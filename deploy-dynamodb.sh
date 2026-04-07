#!/bin/bash
# AWS Deployment Script for TrailPack with DynamoDB
# Account ID: 173480719972

set -e

echo "=========================================="
echo "TrailPack AWS Deployment with DynamoDB"
echo "=========================================="
echo ""

AWS_REGION="us-east-1"
BUCKET_NAME="trailpack-frontend-173480719972"
APP_NAME="trailpack-backend"
ENV_NAME="trailpack-prod-env"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v aws &> /dev/null; then
    echo -e "${RED}AWS CLI not installed!${NC}"
    echo "Install: curl 'https://awscli.amazonaws.com/AWSCLIV2.pkg' -o 'AWSCLIV2.pkg' && sudo installer -pkg AWSCLIV2.pkg -target /"
    exit 1
fi

if ! command -v eb &> /dev/null; then
    echo -e "${RED}EB CLI not installed!${NC}"
    echo "Install: pip3 install awsebcli --upgrade --user"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites OK${NC}"
echo ""

# Check AWS credentials
echo -e "${YELLOW}Checking AWS credentials...${NC}"
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}AWS credentials not configured!${NC}"
    echo "Run: aws configure"
    exit 1
fi
echo -e "${GREEN}✓ AWS credentials OK${NC}"
echo ""

# Step 1: Create DynamoDB Tables
echo -e "${YELLOW}Step 1: Creating DynamoDB Tables...${NC}"
./create-dynamodb-tables.sh
echo -e "${GREEN}✓ DynamoDB tables ready${NC}"
echo ""

# Step 2: Install backend dependencies
echo -e "${YELLOW}Step 2: Installing backend dependencies...${NC}"
cd backend
npm install
cd ..
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Step 3: Generate JWT Secret
JWT_SECRET=$(openssl rand -base64 32)
echo -e "${YELLOW}Step 3: Generated JWT Secret${NC}"
echo "Secret: $JWT_SECRET"
echo ""

# Step 4: Create S3 bucket
echo -e "${YELLOW}Step 4: Creating S3 bucket...${NC}"
aws s3 mb s3://$BUCKET_NAME --region $AWS_REGION 2>/dev/null || echo "Bucket exists"
aws s3 website s3://$BUCKET_NAME --index-document login.html --error-document login.html
aws s3api put-bucket-policy --bucket $BUCKET_NAME --policy file://bucket-policy.json
echo -e "${GREEN}✓ S3 bucket ready${NC}"
echo ""

# Step 5: Deploy Backend to Elastic Beanstalk
echo -e "${YELLOW}Step 5: Deploying backend to Elastic Beanstalk...${NC}"
cd backend

# Check if already initialized
if [ ! -d ".elasticbeanstalk" ]; then
    eb init -p node.js $APP_NAME --region $AWS_REGION --profile default
fi

# Create environment if not exists
if ! eb status $ENV_NAME &> /dev/null; then
    eb create $ENV_NAME --single --region $AWS_REGION
fi

# Set environment variables
eb setenv \
    JWT_SECRET=$JWT_SECRET \
    NODE_ENV=production \
    AWS_REGION=$AWS_REGION \
    DYNAMODB_USERS_TABLE=TrailPack-Users \
    DYNAMODB_TRIPS_TABLE=TrailPack-Trips \
    DYNAMODB_ITEMS_TABLE=TrailPack-Items \
    --environment $ENV_NAME

# Deploy
eb deploy $ENV_NAME

# Get backend URL
BACKEND_URL=$(eb status $ENV_NAME | grep "CNAME" | awk '{print $2}')
echo -e "${GREEN}✓ Backend deployed: $BACKEND_URL${NC}"
cd ..
echo ""

# Step 6: Update Frontend API URL
echo -e "${YELLOW}Step 6: Updating frontend API URL...${NC}"
sed -i '' "s|const API_URL = .*|const API_URL = 'http://$BACKEND_URL';|g" frontend/auth.js
echo -e "${GREEN}✓ Frontend API URL updated${NC}"
echo ""

# Step 7: Deploy Frontend to S3
echo -e "${YELLOW}Step 7: Deploying frontend to S3...${NC}"
aws s3 sync frontend/ s3://$BUCKET_NAME/ --delete
echo -e "${GREEN}✓ Frontend deployed${NC}"
echo ""

# Step 8: Create invalidation for CloudFront (if exists)
echo -e "${YELLOW}Step 8: Checking for CloudFront distribution...${NC}"
DIST_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='TrailPack Frontend CDN'].Id" --output text 2>/dev/null || echo "")
if [ ! -z "$DIST_ID" ]; then
    aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*" > /dev/null
    echo -e "${GREEN}✓ CloudFront cache invalidated${NC}"
else
    echo "No CloudFront distribution found (optional)"
fi
echo ""

# Summary
echo "=========================================="
echo -e "${GREEN}🎉 DEPLOYMENT COMPLETE!${NC}"
echo "=========================================="
echo ""
echo "Frontend URL: http://$BUCKET_NAME.s3-website-$AWS_REGION.amazonaws.com"
echo "Backend URL:  http://$BACKEND_URL"
echo ""
echo "DynamoDB Tables:"
echo "  - TrailPack-Users"
echo "  - TrailPack-Trips"
echo "  - TrailPack-Items"
echo ""
echo "JWT Secret (save this!): $JWT_SECRET"
echo ""
echo "=========================================="
