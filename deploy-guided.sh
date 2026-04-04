#!/bin/bash
# Guided AWS Deployment for TrailPack
# Run each step one by one

echo "=========================================="
echo "TrailPack AWS Deployment - Guided Steps"
echo "=========================================="
echo ""
echo "Follow each step. Press ENTER after completing each one."
echo ""

# Step 1
echo "Step 1: Install AWS CLI"
echo "Command: curl 'https://awscli.amazonaws.com/AWSCLIV2.pkg' -o 'AWSCLIV2.pkg' && sudo installer -pkg AWSCLIV2.pkg -target /"
read -p "Press ENTER after installing AWS CLI..."

# Step 2
echo ""
echo "Step 2: Install EB CLI"
echo "Command: pip3 install awsebcli --upgrade --user"
read -p "Press ENTER after installing EB CLI..."

# Step 3
echo ""
echo "Step 3: Configure AWS credentials"
echo "Command: aws configure"
echo "You need: AWS Access Key ID, AWS Secret Access Key, region: us-east-1"
read -p "Press ENTER after configuring AWS..."

# Step 4
echo ""
echo "Step 4: Setup MongoDB Atlas"
echo "1. Go to https://www.mongodb.com/cloud/atlas"
echo "2. Create free M0 cluster"
echo "3. Create database user"
echo "4. Whitelist IP: 0.0.0.0/0"
echo "5. Get connection string"
echo ""
read -p "Enter your MongoDB connection string: " MONGODB_URI

if [ -z "$MONGODB_URI" ]; then
    echo "MongoDB URI is required!"
    exit 1
fi

# Generate JWT secret
JWT_SECRET=$(openssl rand -base64 32)
echo ""
echo "Generated JWT Secret: $JWT_SECRET"
echo "SAVE THIS - you'll need it if you redeploy"
echo ""

# Step 5
echo "Step 5: Create S3 bucket"
echo "Command: aws s3 mb s3://trailpack-frontend-173480719972 --region us-east-1"
read -p "Press ENTER after creating S3 bucket..."

# Step 6
echo ""
echo "Step 6: Configure S3 for website hosting"
echo "Command: aws s3 website s3://trailpack-frontend-173480719972 --index-document login.html --error-document login.html"
read -p "Press ENTER after configuring S3 website..."

# Step 7
echo ""
echo "Step 7: Set bucket policy"
echo "Command: aws s3api put-bucket-policy --bucket trailpack-frontend-173480719972 --policy file://bucket-policy.json"
read -p "Press ENTER after setting bucket policy..."

# Step 8
echo ""
echo "Step 8: Initialize Elastic Beanstalk"
echo "Command: cd backend && eb init -p node.js trailpack-backend --region us-east-1"
read -p "Press ENTER after initializing EB..."

# Step 9
echo ""
echo "Step 9: Create EB environment"
echo "Command: eb create trailpack-prod-env --single"
echo "Then set environment variables:"
echo "  MONGODB_URI=$MONGODB_URI"
echo "  JWT_SECRET=$JWT_SECRET"
echo "  NODE_ENV=production"
read -p "Press ENTER after creating EB environment..."

# Step 10
echo ""
echo "Step 10: Deploy backend"
echo "Command: eb deploy"
read -p "Press ENTER after deploying backend..."

# Get backend URL
echo ""
echo "Get your backend URL:"
echo "Command: eb status"
read -p "Enter your backend URL (e.g., xxx.elasticbeanstalk.com): " BACKEND_URL

# Step 11
echo ""
echo "Step 11: Update frontend API URL"
echo "Updating frontend/auth.js..."
sed -i '' "s|const API_URL = .*|const API_URL = 'http://$BACKEND_URL';|g" frontend/auth.js
echo "Done!"

# Step 12
echo ""
echo "Step 12: Deploy frontend"
echo "Command: aws s3 sync frontend/ s3://trailpack-frontend-173480719972/ --delete"
read -p "Press ENTER after deploying frontend..."

echo ""
echo "=========================================="
echo "DEPLOYMENT COMPLETE!"
echo "=========================================="
echo ""
echo "Frontend: http://trailpack-frontend-173480719972.s3-website-us-east-1.amazonaws.com"
echo "Backend: http://$BACKEND_URL"
echo ""
echo "MongoDB URI: $MONGODB_URI"
echo "JWT Secret: $JWT_SECRET"
