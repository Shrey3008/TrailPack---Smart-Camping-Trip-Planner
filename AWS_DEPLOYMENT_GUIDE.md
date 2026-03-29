# AWS Free Tier Deployment Guide - TrailPack

## Overview

This guide will help you deploy TrailPack to AWS Free Tier using:
- Frontend: S3 Static Website Hosting (Free)
- Backend: Elastic Beanstalk (750 hrs/month Free)
- Database: MongoDB Atlas (512MB Free tier)

Account ID: 783476057304

## Step 1: MongoDB Atlas (Free Database)

1. Go to https://www.mongodb.com/cloud/atlas
2. Sign up and Create Free Cluster (M0)
3. Create database user: trailpack_user with a strong password
4. Whitelist IP: 0.0.0.0/0 (change to your server IP in production)
5. Get connection string and save it

Connection String Format:
mongodb+srv://trailpack_user:PASSWORD@cluster0.xxxxx.mongodb.net/trailpack?retryWrites=true&w=majority

## Step 2: Deploy Backend (Elastic Beanstalk)

Prerequisites:
- AWS CLI installed: https://aws.amazon.com/cli/
- EB CLI installed: pip install awsebcli
- AWS credentials configured: aws configure

Deploy:
cd backend
eb init -p node.js trailpack-backend --region us-east-1
eb create trailpack-backend-env --single --envvars MONGODB_URI=your_mongodb_uri,JWT_SECRET=your_random_secret,PORT=8080,NODE_ENV=production

Get your backend URL:
eb status

## Step 3: Deploy Frontend (S3)

Update API URL in frontend/auth.js line 7:
const API_URL = 'http://trailpack-backend-env.xxx.elasticbeanstalk.com';

Deploy to S3:
cd frontend
aws s3 mb s3://trailpack-frontend-783476057304 --region us-east-1
aws s3 website s3://trailpack-frontend-783476057304 --index-document login.html --error-document login.html
aws s3 sync . s3://trailpack-frontend-783476057304

## Final URLs

Frontend: http://trailpack-frontend-783476057304.s3-website-us-east-1.amazonaws.com
Backend: http://trailpack-backend-env.xxx.elasticbeanstalk.com

## Estimated Costs

All services are within AWS Free Tier limits:
- S3: 5GB storage, 20k GET requests/month (Free)
- Elastic Beanstalk: 750 hours/month (Free)
- Data Transfer: 100GB/month (Free)
- MongoDB Atlas: 512MB storage (Free)

Total: $0/month for 12 months

## Troubleshooting

1. CORS Errors: Check backend CORS settings match your S3 URL
2. MongoDB Connection: Verify IP whitelist and connection string
3. S3 403 Error: Check bucket policy allows public access
4. EB Health Check: Ensure health check path is configured in .ebextensions

## Security Notes

- Never commit .env files to GitHub
- Use strong JWT secrets (32+ characters)
- Restrict MongoDB IP whitelist in production
- Enable AWS CloudTrail for audit logging
