# AWS Deployment Guide for TrailPack

## Prerequisites
1. AWS Account (ID: 783476057304) - Free Tier
2. AWS CLI installed and configured
3. EB CLI installed (for Elastic Beanstalk)

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        AWS Cloud                         │
│  ┌──────────────────┐      ┌──────────────────────┐     │
│  │  S3 Bucket       │      │  Elastic Beanstalk   │     │
│  │  (Frontend)      │◄────►│  (Backend API)       │     │
│  │  trailpack-      │      │  Node.js Environment │     │
│  │  frontend-7834   │      │                      │     │
│  └──────────────────┘      └──────────┬───────────┘     │
│                                       │                 │
│                                       ▼                 │
│                          ┌──────────────────────┐     │
│                          │  MongoDB Atlas       │     │
│                          │  (Free Tier Cluster) │     │
│                          └──────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

## Step 1: MongoDB Atlas Setup (Free Tier)

1. Go to https://www.mongodb.com/cloud/atlas
2. Sign up/login and create a new project "TrailPack"
3. Create a free cluster (M0 tier):
   - Choose AWS as cloud provider
   - Select region closest to your users (e.g., us-east-1)
4. Create a database user:
   - Username: `trailpack_user`
   - Password: (generate strong password)
5. Add IP whitelist: `0.0.0.0/0` (for development, restrict in production)
6. Get connection string:
   ```
   mongodb+srv://trailpack_user:<password>@cluster0.xxxxx.mongodb.net/trailpack?retryWrites=true&w=majority
   ```

## Step 2: Backend Deployment (Elastic Beanstalk)

### Install EB CLI
```bash
pip install awsebcli
```

### Initialize Elastic Beanstalk
```bash
cd backend
eb init -p node.js trailpack-backend
```

### Create Environment and Deploy
```bash
eb create trailpack-backend-env --single --envvars \
  MONGODB_URI=your_mongodb_connection_string,\
  JWT_SECRET=your_secure_jwt_secret,\
  PORT=8080
```

## Step 3: Frontend Deployment (S3)

### Create S3 Bucket
```bash
aws s3 mb s3://trailpack-frontend-783476057304 --region us-east-1
```

### Configure for Static Website Hosting
```bash
aws s3 website s3://trailpack-frontend-783476057304 --index-document login.html --error-document login.html
```

### Set Bucket Policy
```bash
aws s3api put-bucket-policy --bucket trailpack-frontend-783476057304 --policy file://bucket-policy.json
```

### Upload Frontend
```bash
aws s3 sync frontend/ s3://trailpack-frontend-783476057304 --delete
```

## Step 4: Environment Variables

Update these files with production values:

### Backend `.env`
```
MONGODB_URI=mongodb+srv://trailpack_user:PASSWORD@cluster0.xxxxx.mongodb.net/trailpack?retryWrites=true&w=majority
JWT_SECRET=your_super_secure_random_string_min_32_chars
PORT=8080
NODE_ENV=production
```

### Frontend `auth.js` (API_URL)
Update to point to your Elastic Beanstalk URL

## Step 5: CORS Configuration

Update `backend/server.js` CORS settings for production:
```javascript
app.use(cors({
  origin: 'http://trailpack-frontend-783476057304.s3-website-us-east-1.amazonaws.com',
  credentials: true
}));
```

## Estimated Costs (Free Tier)

| Service | Free Tier Limit | TrailPack Usage |
|---------|----------------|-----------------|
| Elastic Beanstalk | 750 hrs/month | ~$0 |
| S3 | 5GB storage, 20k GET | ~$0 |
| Data Transfer | 100GB/month | ~$0 |
| MongoDB Atlas | 512MB storage | $0 |

**Total: $0/month for first 12 months**

## Important Notes

1. **Never commit sensitive data** (passwords, JWT secrets) to Git
2. Use AWS Systems Manager Parameter Store for secrets in production
3. Enable CloudWatch logs for monitoring
4. Set up AWS Budgets alerts to avoid unexpected charges

## Post-Deployment URLs

- **Frontend**: http://trailpack-frontend-783476057304.s3-website-us-east-1.amazonaws.com
- **Backend**: http://trailpack-backend-env.xxx.elasticbeanstalk.com

## Troubleshooting

1. **CORS Errors**: Check CORS origin matches exactly
2. **MongoDB Connection**: Verify IP whitelist and connection string
3. **S3 403 Error**: Check bucket policy allows public read
