# MongoDB Atlas Setup Guide

## Step 1: Create MongoDB Atlas Account

1. Visit https://www.mongodb.com/cloud/atlas
2. Click "Try Free" and sign up with your email
3. Choose "AWS" as your cloud provider
4. Select the region closest to your users (e.g., `us-east-1` for US East Coast)

## Step 2: Create a Cluster (Free Tier M0)

1. In Atlas Dashboard, click "Build a Cluster"
2. Choose "M0 Sandbox" (Free Forever tier)
3. Select AWS as cloud provider
4. Choose region (recommend `us-east-1` for AWS deployment)
5. Cluster name: `trailpack-cluster`
6. Click "Create Cluster" (takes ~5 minutes)

## Step 3: Configure Database Access

### Create Database User:
1. Go to "Database Access" in left sidebar
2. Click "Add New Database User"
3. Choose "Password" authentication method
4. Username: `trailpack_user`
5. Password: Generate a strong password (save this!)
6. Database User Privileges: Select "Read and write to any database"
7. Click "Add User"

## Step 4: Configure Network Access

### Add IP Whitelist:
1. Go to "Network Access" in left sidebar
2. Click "Add IP Address"
3. Click "Allow Access from Anywhere" (adds `0.0.0.0/0`)
   - ⚠️ For production, restrict to specific IPs only
4. Click "Confirm"

## Step 5: Get Connection String

1. Go to "Clusters" and click "Connect" on your cluster
2. Choose "Connect your application"
3. Select driver: "Node.js" and version: "4.0 or later"
4. Copy the connection string:
   ```
   mongodb+srv://trailpack_user:<password>@cluster0.xxxxx.mongodb.net/trailpack?retryWrites=true&w=majority
   ```
5. Replace `<password>` with your actual password

## Step 6: Test Connection

1. In your backend `.env` file, set:
   ```
   MONGODB_URI=mongodb+srv://trailpack_user:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/trailpack?retryWrites=true&w=majority
   ```
2. Start your backend: `npm start`
3. Check console for "Connected to MongoDB" message

## Free Tier Limits

- **Storage**: 512 MB (sufficient for testing)
- **Operations**: Limited but generous for development
- **Concurrent Connections**: 100
- **Clusters**: 1 free M0 cluster per project

## Security Best Practices

1. **Use strong passwords** for database users
2. **IP Whitelist**: Restrict to your server's IP in production
3. **Network Peering**: Use AWS VPC peering for enhanced security
4. **Encryption**: Atlas encrypts data at rest and in transit by default
5. **Backups**: Enable automated backups for production data

## Troubleshooting

### Connection Timeout
- Verify IP whitelist includes your server IP
- Check cluster is in "Active" state
- Test from command line: `mongo "your-connection-string"`

### Authentication Failed
- Double-check password in connection string
- Verify database user exists and has correct privileges
- Ensure you're using the correct username

### SSL/TLS Issues
- Connection string should include `ssl=true` or `tls=true`
- Atlas uses TLS 1.2 by default

## Connection String Format

```
mongodb+srv://trailpack_user:PASSWORD@cluster0.xxxxx.mongodb.net/trailpack?retryWrites=true&w=majority&ssl=true
```

Replace:
- `PASSWORD` - Your actual database password
- `cluster0.xxxxx` - Your actual cluster name
