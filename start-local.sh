#!/bin/bash
cd /Users/shrey/Desktop/TrailPack/backend
export JWT_SECRET="trailpack-secret"
export PORT="3000"
export AWS_REGION="us-east-1"
node server.js
