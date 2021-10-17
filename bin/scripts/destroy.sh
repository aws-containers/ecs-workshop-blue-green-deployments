#!/usr/bin/env bash

######################################################################
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. #
# SPDX-License-Identifier: MIT-0                                     #
######################################################################

GREEN="\033[1;32m"
YELLOW="\033[1;33m"

echo -e "${GREEN}Start cleanup..."

export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_DEFAULT_REGION=$(aws configure get region)

export CODE_REPO_NAME=nginx-sample
export API_NAME=nginx-sample
export CONTAINER_PORT=80
export CIDR_RANGE=10.0.0.0/16
export CODE_REPO_URL=$(aws cloudformation describe-stacks --stack-name BlueGreenContainerImageStack --query 'Stacks[*].Outputs[?ExportName==`repositoryCloneUrlHttp`].OutputValue' --output text)
export ECR_REPO_NAME=$(aws cloudformation describe-stacks --stack-name BlueGreenContainerImageStack --query 'Stacks[*].Outputs[?ExportName==`ecrRepoName`].OutputValue' --output text)
export CODE_BUILD_PROJECT_NAME=$(aws cloudformation describe-stacks --stack-name BlueGreenContainerImageStack --query 'Stacks[*].Outputs[?ExportName==`codeBuildProjectName`].OutputValue' --output text)
export ECS_TASK_ROLE_ARN=$(aws cloudformation describe-stacks --stack-name BlueGreenContainerImageStack --query 'Stacks[*].Outputs[?ExportName==`ecsTaskRoleArn`].OutputValue' --output text)

cdk --app "npx ts-node bin/pipeline-stack.ts" destroy --require-approval never
cdk --app "npx ts-node bin/container-image-stack.ts" destroy --require-approval never

echo -e "${GREEN}Cleanup completed..."
