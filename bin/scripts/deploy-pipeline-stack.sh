#!/usr/bin/env bash

######################################################################
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. #
# SPDX-License-Identifier: MIT-0                                     #
######################################################################

GREEN="\033[1;32m"
YELLOW="\033[1;33m"

#############################################################################
# CodePipeline resources
##############################################################################

echo -e "${GREEN}Exporting the cloudformation stack outputs...."

export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_DEFAULT_REGION=$(aws configure get region)

export CODE_REPO_NAME=$(aws cloudformation describe-stacks --stack-name BlueGreenContainerImageStack --query 'Stacks[*].Outputs[?ExportName==`repositoryName`].OutputValue' --output text)
export CODE_REPO_URL=$(aws cloudformation describe-stacks --stack-name BlueGreenContainerImageStack --query 'Stacks[*].Outputs[?ExportName==`repositoryCloneUrlHttp`].OutputValue' --output text)
export ECR_REPO_NAME=$(aws cloudformation describe-stacks --stack-name BlueGreenContainerImageStack --query 'Stacks[*].Outputs[?ExportName==`ecrRepoName`].OutputValue' --output text)
export CODE_BUILD_PROJECT_NAME=$(aws cloudformation describe-stacks --stack-name BlueGreenContainerImageStack --query 'Stacks[*].Outputs[?ExportName==`codeBuildProjectName`].OutputValue' --output text)
export ECS_TASK_ROLE_ARN=$(aws cloudformation describe-stacks --stack-name BlueGreenContainerImageStack --query 'Stacks[*].Outputs[?ExportName==`ecsTaskRoleArn`].OutputValue' --output text)

echo -e "${GREEN}Initiating the code build to create the container image...."
export BUILD_ID=$(aws codebuild start-build --project-name $CODE_BUILD_PROJECT_NAME --query build.id --output text)
BUILD_STATUS=$(aws codebuild batch-get-builds --ids $BUILD_ID --query 'builds[*].buildStatus' --output text | xargs)

# Wait till the CodeBuild status is SUCCEEDED
while [ "$BUILD_STATUS" != "SUCCEEDED" ];
do
  sleep 10
  BUILD_STATUS=$(aws codebuild batch-get-builds --ids $BUILD_ID --query 'builds[*].buildStatus' --output text | xargs)
  echo -e "${YELLOW}Awaiting SUCCEEDED status....Current status: ${BUILD_STATUS}"
done

echo -e "${GREEN}Completed CodeBuild...ECR image is available"

echo -e "${GREEN}Start building the CodePipeline resources...."

export API_NAME=nginx-sample
export CONTAINER_PORT=80
export CIDR_RANGE=10.0.0.0/16

cdk --app "npx ts-node bin/pipeline-stack.ts" deploy --require-approval never
export ALB_DNS=$(aws cloudformation describe-stacks --stack-name BlueGreenPipelineStack --query 'Stacks[*].Outputs[?ExportName==`ecsBlueGreenLBDns`].OutputValue' --output text)

echo -e "${GREEN}Completed building the CodePipeline resources...."

echo -e "${GREEN}Let's curl the below URL for API...."

echo "http://$ALB_DNS"
curl http://$ALB_DNS
