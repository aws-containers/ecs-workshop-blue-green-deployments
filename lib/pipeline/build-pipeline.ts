// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import * as cdk from '@aws-cdk/core';
import {CfnOutput} from '@aws-cdk/core';
import {AnyPrincipal, Effect, ServicePrincipal} from '@aws-cdk/aws-iam';
import {BlockPublicAccess, BucketEncryption} from '@aws-cdk/aws-s3';
import {EcsBlueGreenDeploymentGroup, EcsBlueGreenService, EcsServiceAlarms} from '..';
import {ICluster} from '@aws-cdk/aws-ecs';
import {IVpc} from '@aws-cdk/aws-ec2';
import iam = require('@aws-cdk/aws-iam');
import s3 = require('@aws-cdk/aws-s3');
import ecr = require('@aws-cdk/aws-ecr');
import codeCommit = require('@aws-cdk/aws-codecommit');
import codeBuild = require('@aws-cdk/aws-codebuild');
import codePipeline = require('@aws-cdk/aws-codepipeline');
import codePipelineActions = require('@aws-cdk/aws-codepipeline-actions');


export interface EcsBlueGreenPipelineProps {
    readonly codeRepoName?: string;
    readonly ecrRepoName?: string;
    readonly codeBuildProjectName?: string;
    readonly ecsTaskRoleArn?: string;
    readonly containerPort?: number;
    readonly apiName?: string;
    readonly vpc?: IVpc;
    readonly cluster?: ICluster;
    readonly taskSetTerminationTimeInMinutes?: number;
    readonly deploymentConfigName?: string;
}

export class EcsBlueGreenPipeline extends cdk.Construct {

    constructor(scope: cdk.Construct, id: string, props: EcsBlueGreenPipelineProps = {}) {
        super(scope, id);

        const codeRepo = codeCommit.Repository.fromRepositoryName(this, 'codeRepo', props.codeRepoName!);
        const ecrRepo = ecr.Repository.fromRepositoryName(this, 'ecrRepo', props.ecrRepoName!);
        const codeBuildProject = codeBuild.Project.fromProjectName(this, 'codeBuild', props.codeBuildProjectName!);
        const ecsTaskRole = iam.Role.fromRoleArn(this, 'ecsTaskRole', props.ecsTaskRoleArn!);

        const codePipelineRole = new iam.Role(this, 'codePipelineRole', {
            assumedBy: new ServicePrincipal('codepipeline.amazonaws.com')
        });

        const codePipelinePolicy = new iam.PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
                'iam:PassRole',
                'sts:AssumeRole',
                'codecommit:Get*',
                'codecommit:List*',
                'codecommit:GitPull',
                'codecommit:UploadArchive',
                'codecommit:CancelUploadArchive',
                'codebuild:BatchGetBuilds',
                'codebuild:StartBuild',
                'codedeploy:CreateDeployment',
                'codedeploy:Get*',
                'codedeploy:RegisterApplicationRevision',
                's3:Get*',
                's3:List*',
                's3:PutObject'
            ],
            resources: ['*']
        });

        codePipelineRole.addToPolicy(codePipelinePolicy);

        const sourceArtifact = new codePipeline.Artifact('sourceArtifact');
        const buildArtifact = new codePipeline.Artifact('buildArtifact');

        // S3 bucket for storing the code pipeline artifacts
        const artifactsBucket = new s3.Bucket(this, 'artifactsBucket', {
            encryption: BucketEncryption.S3_MANAGED,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL
        });

        // S3 bucket policy for the code pipeline artifacts
        const denyUnEncryptedObjectUploads = new iam.PolicyStatement({
            effect: Effect.DENY,
            actions: ['s3:PutObject'],
            principals: [new AnyPrincipal()],
            resources: [artifactsBucket.bucketArn.concat('/*')],
            conditions: {
                StringNotEquals: {
                    's3:x-amz-server-side-encryption': 'aws:kms'
                }
            }
        });

        const denyInsecureConnections = new iam.PolicyStatement({
            effect: Effect.DENY,
            actions: ['s3:*'],
            principals: [new AnyPrincipal()],
            resources: [artifactsBucket.bucketArn.concat('/*')],
            conditions: {
                Bool: {
                    'aws:SecureTransport': 'false'
                }
            }
        });

        artifactsBucket.addToResourcePolicy(denyUnEncryptedObjectUploads);
        artifactsBucket.addToResourcePolicy(denyInsecureConnections);

        const ecsBlueGreenService = new EcsBlueGreenService(this, 'service', {
            containerPort: props.containerPort,
            apiName: props.apiName,
            ecrRepository: ecrRepo,
            ecsTaskRole: ecsTaskRole,
            vpc: props.vpc,
            cluster: props.cluster
        });

        const ecsServiceAlarms = new EcsServiceAlarms(this, 'alarms', {
            alb: ecsBlueGreenService.alb,
            blueTargetGroup: ecsBlueGreenService.blueTargetGroup,
            greenTargetGroup: ecsBlueGreenService.greenTargetGroup,
            apiName: props.apiName
        });

        const ecsBlueGreenDeploymentGroup = new EcsBlueGreenDeploymentGroup(this, 'ecsApplication', {
            ecsClusterName: props.cluster?.clusterName,
            ecsServiceName: ecsBlueGreenService.ecsService.serviceName,
            prodListenerArn: ecsBlueGreenService.albProdListener.listenerArn,
            testListenerArn: ecsBlueGreenService.albTestListener.listenerArn,
            blueTargetGroupName: ecsBlueGreenService.blueTargetGroup.targetGroupName,
            greenTargetGroupName: ecsBlueGreenService.greenTargetGroup.targetGroupName,
            terminationWaitTime: props.taskSetTerminationTimeInMinutes,
            deploymentConfigName: props.deploymentConfigName,
            deploymentGroupName: props.apiName,
            targetGroupAlarms: ecsServiceAlarms.targetGroupAlarms
        });

        // Code Pipeline - CloudWatch trigger event is created by CDK
        const pipeline = new codePipeline.Pipeline(this, 'ecsBlueGreen', {
            role: codePipelineRole,
            artifactBucket: artifactsBucket,
            stages: [
                {
                    stageName: 'Source',
                    actions: [
                        new codePipelineActions.CodeCommitSourceAction({
                            actionName: 'Source',
                            repository: codeRepo,
                            output: sourceArtifact,
                            branch: 'main'
                        }),
                    ]
                },
                {
                    stageName: 'Build',
                    actions: [
                        new codePipelineActions.CodeBuildAction({
                            actionName: 'Build',
                            project: codeBuildProject,
                            input: sourceArtifact,
                            outputs: [buildArtifact]
                        })
                    ]
                },
                {
                    stageName: 'Deploy',
                    actions: [
                        new codePipelineActions.CodeDeployEcsDeployAction({
                            actionName: 'Deploy',
                            deploymentGroup: ecsBlueGreenDeploymentGroup.ecsDeploymentGroup,
                            appSpecTemplateInput: buildArtifact,
                            taskDefinitionTemplateInput: buildArtifact,
                        })
                    ]
                }
            ]
        });

        pipeline.node.addDependency(ecsBlueGreenDeploymentGroup);

        // Export the outputs
        new CfnOutput(this, 'ecsBlueGreenLBDns', {
            description: 'Load balancer DNS',
            exportName: 'ecsBlueGreenLBDns',
            value: ecsBlueGreenService.alb.loadBalancerDnsName
        });

    }

}
