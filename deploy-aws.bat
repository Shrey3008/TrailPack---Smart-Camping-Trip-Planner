@echo off
REM AWS Deployment Script for TrailPack
REM Account ID: 783476057304

echo ==========================================
echo TrailPack AWS Deployment Script
echo ==========================================
echo.

REM Check if AWS CLI is installed
aws --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: AWS CLI is not installed!
    echo Please install AWS CLI from: https://aws.amazon.com/cli/
    exit /b 1
)

REM Set AWS region
set AWS_REGION=us-east-1
set BUCKET_NAME=trailpack-frontend-783476057304
set APP_NAME=trailpack-backend
set ENV_NAME=trailpack-backend-env

echo Step 1: Setting up S3 bucket for frontend...
aws s3 mb s3://%BUCKET_NAME% --region %AWS_REGION% 2>nul || echo Bucket may already exist

echo.
echo Step 2: Configuring S3 bucket for static website hosting...
aws s3 website s3://%BUCKET_NAME% --index-document login.html --error-document login.html

echo.
echo Step 3: Setting bucket policy for public access...
aws s3api put-bucket-policy --bucket %BUCKET_NAME% --policy file://../bucket-policy.json

echo.
echo Step 4: Uploading frontend files to S3...
aws s3 sync ../frontend/ s3://%BUCKET_NAME% --delete

echo.
echo Step 5: Setting content types...
aws s3 cp s3://%BUCKET_NAME%/ s3://%BUCKET_NAME%/ --recursive --metadata-directive REPLACE --content-type text/html --exclude "*" --include "*.html"
aws s3 cp s3://%BUCKET_NAME%/ s3://%BUCKET_NAME%/ --recursive --metadata-directive REPLACE --content-type text/css --exclude "*" --include "*.css"
aws s3 cp s3://%BUCKET_NAME%/ s3://%BUCKET_NAME%/ --recursive --metadata-directive REPLACE --content-type application/javascript --exclude "*" --include "*.js"

echo.
echo ==========================================
echo Frontend Deployment Complete!
echo ==========================================
echo Website URL: http://%BUCKET_NAME%.s3-website-%AWS_REGION%.amazonaws.com
echo.

REM Check if EB CLI is installed
eb --version >nul 2>&1
if errorlevel 1 (
    echo WARNING: EB CLI is not installed!
    echo Please install EB CLI: pip install awsebcli
    echo.
    echo To deploy backend manually:
    echo 1. Install EB CLI: pip install awsebcli
    echo 2. cd backend
    echo 3. eb init -p node.js %APP_NAME%
    echo 4. eb create %ENV_NAME% --single
    exit /b 0
)

echo Step 6: Deploying backend to Elastic Beanstalk...
cd ..
eb init -p node.js %APP_NAME% --region %AWS_REGION% --force
eb use %ENV_NAME% 2>nul || eb create %ENV_NAME% --single --envvars MONGODB_URI=%MONGODB_URI%,JWT_SECRET=%JWT_SECRET%,NODE_ENV=production,PORT=8080

echo.
echo ==========================================
echo Backend Deployment Complete!
echo ==========================================
echo.
echo ==========================================
echo Deployment Summary
echo ==========================================
echo Frontend: http://%BUCKET_NAME%.s3-website-%AWS_REGION%.amazonaws.com
echo Backend: Run 'eb status' to get the URL
echo.
echo IMPORTANT:
echo 1. Update frontend/auth.js with your backend URL
echo 2. Set up MongoDB Atlas and update MONGODB_URI
echo 3. Keep JWT_SECRET secure and unique
echo.
pause
