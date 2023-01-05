// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import {countResources, expect as expectCDK} from '@aws-cdk/assert';
import * as EcsBlueGreen from '../lib/index';
import { Stack, App } from 'aws-cdk-lib';

test('Blue/Green deployment pipeline is created', () => {
    const app = new App();
    const stack = new Stack(app, 'EcsBlueGreenStack');
    // WHEN
    const ecsBlueGreenRoles = new EcsBlueGreen.EcsBlueGreenRoles(stack, 'EcsBlueGreenRoles');
    const ecsBlueGreenBuildImage = new EcsBlueGreen.EcsBlueGreenBuildImage(stack, 'EcsBlueGreenBuildImage', {
        codeBuildRole: ecsBlueGreenRoles.codeBuildRole,
        ecsTaskRole: ecsBlueGreenRoles.ecsTaskRole,
        codeRepoName: 'books',
        codeRepoDesc: 'source code for books API',
        dockerHubUsername: 'username',
        dockerHubPassword: 'password'
    });
    const ecsBlueGreenCluster = new EcsBlueGreen.EcsBlueGreenCluster(stack, 'EcsBlueGreenCluster', {
        cidr: '10.0.0.0/16'
    });
    new EcsBlueGreen.EcsBlueGreenPipeline(stack, 'EcsBlueGreenPipeline', {
        apiName: 'books',
        deploymentConfigName: 'CodeDeployDefault.ECSLinear10PercentEvery1Minutes',
        cluster: ecsBlueGreenCluster.cluster,
        vpc: ecsBlueGreenCluster.vpc,
        containerPort: 9000,
        ecrRepoName: ecsBlueGreenBuildImage.ecrRepo.repositoryName,
        codeBuildProjectName: ecsBlueGreenBuildImage.codeBuildProject.projectName,
        codeRepoName: 'books',
        ecsTaskRoleArn: ecsBlueGreenRoles.ecsTaskRole.roleArn,
        taskSetTerminationTimeInMinutes: 10
    })

    // THEN
    expectCDK(stack).to(countResources('AWS::IAM::Role', 9));
    expectCDK(stack).to(countResources('AWS::ECR::Repository', 1));
    expectCDK(stack).to(countResources('AWS::CodeCommit::Repository', 1));
    expectCDK(stack).to(countResources('AWS::CodeBuild::Project', 1));
    expectCDK(stack).to(countResources('AWS::EC2::VPC', 1));
    expectCDK(stack).to(countResources('AWS::ECS::Cluster', 1));
    expectCDK(stack).to(countResources('AWS::ECS::TaskDefinition', 1));
    expectCDK(stack).to(countResources('AWS::ECS::Service', 1));
    expectCDK(stack).to(countResources('AWS::ElasticLoadBalancingV2::LoadBalancer', 1));
    expectCDK(stack).to(countResources('AWS::ElasticLoadBalancingV2::Listener', 2));
    expectCDK(stack).to(countResources('AWS::ElasticLoadBalancingV2::TargetGroup', 2));
    expectCDK(stack).to(countResources('AWS::CloudWatch::Alarm', 4));
});
