#!/bin/bash
# Run this as AWS admin to fix the Elastic Beanstalk service role

aws iam attach-role-policy \
  --role-name aws-elasticbeanstalk-service-role \
  --policy-arn arn:aws:iam::aws:policy/CloudWatchLogsFullAccess

aws iam attach-role-policy \
  --role-name aws-elasticbeanstalk-service-role \
  --policy-arn arn:aws:iam::aws:policy/CloudWatchFullAccess

echo "IAM role fixed. Wait 5 minutes, then deploy."
