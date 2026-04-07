#!/bin/bash
# Create DynamoDB Tables for TrailPack
# Run this before deploying the application

set -e

echo "=========================================="
echo "Creating DynamoDB Tables for TrailPack"
echo "=========================================="
echo ""

AWS_REGION="us-east-1"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "ERROR: AWS CLI is not installed!"
    echo "Install: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo "ERROR: AWS credentials not configured!"
    echo "Run: aws configure"
    exit 1
fi

echo "Creating Users table..."
aws dynamodb create-table \
    --cli-input-json file://aws-configs/dynamodb-users-table.json \
    --region $AWS_REGION || echo "Table may already exist"

echo ""
echo "Creating Trips table..."
aws dynamodb create-table \
    --cli-input-json file://aws-configs/dynamodb-trips-table.json \
    --region $AWS_REGION || echo "Table may already exist"

echo ""
echo "Creating Items table..."
aws dynamodb create-table \
    --cli-input-json file://aws-configs/dynamodb-items-table.json \
    --region $AWS_REGION || echo "Table may already exist"

echo ""
echo "=========================================="
echo "DynamoDB Tables Created Successfully!"
echo "=========================================="
echo ""
echo "Tables:"
echo "  - TrailPack-Users"
echo "  - TrailPack-Trips"
echo "  - TrailPack-Items"
echo ""
echo "Next: Run ./deploy-aws.sh to deploy the application"
