#!/bin/bash
# AWS Deployment Setup Script for TrailPack
# Run this after installing AWS CLI and EB CLI

set -e

echo "=========================================="
echo "TrailPack AWS Deployment Setup"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

AWS_REGION="us-east-1"
BUCKET_NAME="trailpack-frontend-173480719972"
APP_NAME="trailpack-backend"
ENV_NAME="trailpack-prod-env"

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v aws &> /dev/null; then
    echo -e "${RED}AWS CLI is not installed!${NC}"
    echo "Install: curl 'https://awscli.amazonaws.com/AWSCLIV2.pkg' -o 'AWSCLIV2.pkg' && sudo installer -pkg AWSCLIV2.pkg -target /"
    exit 1
fi

if ! command -v eb &> /dev/null; then
    echo -e "${RED}EB CLI is not installed!${NC}"
    echo "Install: pip3 install awsebcli --upgrade --user"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites check passed${NC}"
echo ""

# Check AWS credentials
echo -e "${YELLOW}Checking AWS credentials...${NC}"
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}AWS credentials not configured!${NC}"
    echo "Run: aws configure"
    echo "Account ID: 173480719972"
    exit 1
fi

echo -e "${GREEN}✓ AWS credentials configured${NC}"
echo ""

# Prompt for MongoDB URI
echo -e "${YELLOW}MongoDB Atlas Setup Required:${NC}"
echo "1. Go to https://www.mongodb.com/cloud/atlas"
echo "2. Create free M0 cluster"
echo "3. Create database user and whitelist IP 0.0.0.0/0"
echo "4. Get connection string"
echo ""
read -p "Enter MongoDB connection string: " MONGODB_URI

if [ -z "$MONGODB_URI" ]; then
    echo -e "${RED}MongoDB URI is required!${NC}"
    exit 1
fi

# Generate JWT secret
JWT_SECRET=$(openssl rand -base64 32)
echo -e "${GREEN}Generated JWT Secret: ${JWT_SECRET}${NC}"
echo ""

echo -e "${YELLOW}Step 1: Creating S3 bucket for frontend...${NC}"
aws s3 mb s3://$BUCKET_NAME --region $AWS_REGION 2>/dev/null || echo "Bucket already exists"
echo -e "${GREEN}✓ S3 bucket ready${NC}"
echo ""

echo -e "${YELLOW}Step 2: Configuring S3 for static website...${NC}"
aws s3 website s3://$BUCKET_NAME --index-document login.html --error-document login.html
echo -e "${GREEN}✓ S3 website configured${NC}"
echo ""

echo -e "${YELLOW}Step 3: Setting bucket policy...${NC}"
aws s3api put-bucket-policy --bucket $BUCKET_NAME --policy file://bucket-policy.json
echo -e "${GREEN}✓ Bucket policy set${NC}"
echo ""

echo -e "${YELLOW}Step 4: Initializing Elastic Beanstalk...${NC}"
cd backend
eb init -p node.js $APP_NAME --region $AWS_REGION
echo -e "${GREEN}✓ EB initialized${NC}"
echo ""

echo -e "${YELLOW}Step 5: Creating EB environment...${NC}"
eb create $ENV_NAME --single --envvars \
  MONGODB_URI=$MONGODB_URI,\
  JWT_SECRET=$JWT_SECRET,\
  NODE_ENV=production,\
  PORT=8080
echo -e "${GREEN}✓ EB environment created${NC}"
echo ""

echo -e "${YELLOW}Step 6: Deploying backend...${NC}"
eb deploy
echo -e "${GREEN}✓ Backend deployed${NC}"
echo ""

# Get backend URL
BACKEND_URL=$(eb status | grep "CNAME" | awk '{print $2}')
echo -e "${GREEN}Backend URL: http://${BACKEND_URL}${NC}"
echo ""

cd ..

echo -e "${YELLOW}Step 7: Updating frontend API URL...${NC}"
sed -i '' "s|const API_URL = .*|const API_URL = 'http://${BACKEND_URL}';|g" frontend/auth.js
echo -e "${GREEN}✓ Frontend API URL updated${NC}"
echo ""

echo -e "${YELLOW}Step 8: Deploying frontend to S3...${NC}"
aws s3 sync frontend/ s3://$BUCKET_NAME/ --delete
echo -e "${GREEN}✓ Frontend deployed${NC}"
echo ""

echo "=========================================="
echo -e "${GREEN}🎉 DEPLOYMENT COMPLETE!${NC}"
echo "=========================================="
echo ""
echo "Frontend: http://$BUCKET_NAME.s3-website-$AWS_REGION.amazonaws.com"
echo "Backend: http://$BACKEND_URL"
echo ""
echo "IMPORTANT: Save these credentials:"
echo "MongoDB URI: $MONGODB_URI"
echo "JWT Secret: $JWT_SECRET"
