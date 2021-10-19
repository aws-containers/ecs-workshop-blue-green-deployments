// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import {Effect, ManagedPolicy, Role, ServicePrincipal} from '@aws-cdk/aws-iam';
import * as cdk from '@aws-cdk/core';
import iam = require('@aws-cdk/aws-iam');

export class EcsBlueGreenRoles extends cdk.Construct {

    public readonly ecsTaskRole: Role;
    public readonly codeBuildRole: Role;

    constructor(scope: cdk.Construct, id: string) {
        super(scope, id);

        // ECS task execution role
        this.ecsTaskRole = new iam.Role(this, 'ecsTaskRoleForWorkshop', {
            assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com')
        });
        this.ecsTaskRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'));


        // IAM role for the Code Build project
        this.codeBuildRole = new iam.Role(this, 'codeBuildServiceRole', {
            assumedBy: new ServicePrincipal('codebuild.amazonaws.com')
        });

        const
            inlinePolicyForCodeBuild = new iam.PolicyStatement({
                effect: Effect.ALLOW,
                actions: [
                    'ecr:GetAuthorizationToken',
                    'ecr:BatchCheckLayerAvailability',
                    'ecr:InitiateLayerUpload',
                    'ecr:UploadLayerPart',
                    'ecr:CompleteLayerUpload',
                    'ecr:PutImage',
                    's3:Get*',
                    's3:List*',
                    's3:PutObject',
                    'secretsmanager:GetSecretValue'
                ],
                resources: ['*']
            });

        this.codeBuildRole.addToPolicy(inlinePolicyForCodeBuild);
    }

}
