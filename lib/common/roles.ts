// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';

export class EcsBlueGreenRoles extends Construct {

    public readonly ecsTaskRole: iam.Role;
    public readonly codeBuildRole: iam.Role;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        // ECS task execution role
        this.ecsTaskRole = new iam.Role(this, 'ecsTaskRoleForWorkshop', {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com')
        });
        this.ecsTaskRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'));


        // IAM role for the Code Build project
        this.codeBuildRole = new iam.Role(this, 'codeBuildServiceRole', {
            assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com')
        });

        const
            inlinePolicyForCodeBuild = new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
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
