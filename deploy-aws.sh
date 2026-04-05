#!/bin/bash
# AWS Deployment Script for TrailPack (Linux/Mac)
# Account ID: 173480719972

set -e

echo "=========================================="
echo "TrailPack AWS Deployment Script"
echo "=========================================="
echo ""

# Configuration
AWS_REGION="us-east-1"
BUCKET_NAME="trailpack-frontend-173480719972"
APP_NAME="trailpack-backend"
ENV_NAME="trailpack-backend-env"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}ERROR: AWS CLI is not installed!${NC}"
    echo "Please install AWS CLI from: https://aws.amazon.com/cli/"
    exit 1
fi

echo -e "${YELLOW}Step 1: Setting up S3 bucket for frontend...${NC}"
aws s3 mb s3://$BUCKET_NAME --region $AWS_REGION 2>/dev/null || echo "Bucket may already exist"

echo ""
echo -e "${YELLOW}Step 2: Configuring S3 bucket for static website hosting...${NC}"
aws s3 website s3://$BUCKET_NAME --index-document login.html --error-document login.html

echo ""
echo -e "${YELLOW}Step 3: Setting bucket policy for public access...${NC}"
cat > bucket-policy-temp.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$BUCKET_NAME/*"
    }
  ]
}
EOF
aws s3api put-bucket-policy --bucket $BUCKET_NAME --policy file://bucket-policy-temp.json
rm bucket-policy-temp.json

echo ""
echo -e "${YELLOW}Step 4: Uploading frontend files to S3...${NC}"
aws s3 sync frontend/ s3://$BUCKET_NAME --delete

echo ""
echo -e "${YELLOW}Step 5: Setting content types...${NC}"
aws s3 cp s3://$BUCKET_NAME/ s3://$BUCKET_NAME/ --recursive --metadata-directive REPLACE --content-type text/html --exclude "*" --include "*.html"
aws s3 cp s3://$BUCKET_NAME/ s3://$BUCKET_NAME/ --recursive --metadata-directive REPLACE --content-type text/css --exclude "*" --include "*.css"
aws s3 cp s3://$BUCKET_NAME/ s3://$BUCKET_NAME/ --recursive --metadata-directive REPLACE --content-type application/javascript --exclude "*" --include "*.js"

echo ""
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}Frontend Deployment Complete!${NC}"
echo -e "${GREEN}==========================================${NC}"
echo "Website URL: http://$BUCKET_NAME.s3-website-$AWS_REGION.amazonaws.com"
echo ""

# Check if EB CLI is installed
if ! command -v eb &> /dev/null; then
    echo -e "${YELLOW}WARNING: EB CLI is not installed!${NC}"
    echo "Please install EB CLI: pip install awsebcli"
    echo ""
    echo "To deploy backend manually:"
    echo "1. Install EB CLI: pip install awsebcli"
    echo "2. cd backend"
    echo "3. eb init -p node.js $APP_NAME"
    echo "4. eb create $ENV_NAME --single"
    exit 0
fi

echo ""
echo -e "${YELLOW}Step 6: Deploying backend to Elastic Beanstalk...${NC}"
cd backend
eb init -p node.js $APP_NAME --region $AWS_REGION --force

# Check if environment exists
if eb status $ENV_NAME 2>/dev/null; then
    echo "Environment exists, deploying..."
    eb deploy $ENV_NAME
else
    echo "Creating new environment..."
    eb create $ENV_NAME --single
fi

echo ""
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}Backend Deployment Complete!${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}Deployment Summary${NC}"
echo -e "${GREEN}==========================================${NC}"
echo "Frontend: http://$BUCKET_NAME.s3-website-$AWS_REGION.amazonaws.com"
echo "Backend: $(eb status | grep CNAME | awk '{print $2}')"
echo ""
echo "IMPORTANT:"
echo "1. Update frontend/auth.js with your backend URL"
echo "2. Set up MongoDB Atlas and update MONGODB_URI"
echo "3. Keep JWT_SECRET secure and unique"
echo ""
