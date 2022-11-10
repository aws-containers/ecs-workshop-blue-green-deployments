#!/usr/bin/env node

// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Construct } from 'constructs';
import 'source-map-support/register';
import { Stack, App, StackProps, CfnParameter } from 'aws-cdk-lib';
import * as EcsBlueGreen from '../lib';

export class BlueGreenPipelineStack extends Stack {

    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const deploymentConfigName = new CfnParameter(this, 'deploymentConfigName', {
            type: 'String',
            default: 'CodeDeployDefault.ECSLinear10PercentEvery1Minutes',
            allowedValues: [
                'CodeDeployDefault.ECSLinear10PercentEvery1Minutes',
                'CodeDeployDefault.ECSLinear10PercentEvery3Minutes',
                'CodeDeployDefault.ECSCanary10Percent5Minutes',
                'CodeDeployDefault.ECSCanary10Percent15Minutes',
                'CodeDeployDefault.ECSAllAtOnce'
            ],
            description: 'Shifts x percentage of traffic every x minutes until all traffic is shifted',
        });

        const taskSetTerminationTimeInMinutes = new CfnParameter(this, 'taskSetTerminationTimeInMinutes', {
            type: 'Number',
            default: '10',
            description: 'TaskSet termination time in minutes',
        });

        // Build the stack
        const ecsBlueGreenCluster = new EcsBlueGreen.EcsBlueGreenCluster(this, 'EcsBlueGreenCluster', {
            cidr: process.env.CIDR_RANGE
        });

        new EcsBlueGreen.EcsBlueGreenPipeline(this, 'EcsBlueGreenPipeline', {
            apiName: process.env.API_NAME,
            deploymentConfigName: deploymentConfigName.valueAsString,
            cluster: ecsBlueGreenCluster.cluster,
            vpc: ecsBlueGreenCluster.vpc,
            containerPort: Number(process.env.CONTAINER_PORT),
            ecrRepoName: process.env.ECR_REPO_NAME,
            codeBuildProjectName: process.env.CODE_BUILD_PROJECT_NAME,
            codeRepoName: process.env.CODE_REPO_NAME,
            ecsTaskRoleArn: process.env.ECS_TASK_ROLE_ARN,
            taskSetTerminationTimeInMinutes: taskSetTerminationTimeInMinutes.valueAsNumber
        })
    }
}


const app = new App();
new BlueGreenPipelineStack(app, 'BlueGreenPipelineStack', {
    description: 'Builds the blue/green deployment pipeline stack'
});
