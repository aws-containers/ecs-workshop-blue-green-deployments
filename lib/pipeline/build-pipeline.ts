// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import {EcsBlueGreenDeploymentGroup, EcsBlueGreenService, EcsServiceAlarms} from '..';
import { Construct } from 'constructs';
import { CfnOutput, Duration } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as codeCommit from 'aws-cdk-lib/aws-codecommit';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as codeBuild from 'aws-cdk-lib/aws-codebuild';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as codePipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codePipelineActions from 'aws-cdk-lib/aws-codepipeline-actions';

export interface EcsBlueGreenPipelineProps {
    readonly codeRepoName?: string;
    readonly ecrRepoName?: string;
    readonly codeBuildProjectName?: string;
    readonly ecsTaskRoleArn?: string;
    readonly containerPort?: number;
    readonly apiName?: string;
    readonly vpc?: ec2.IVpc;
    readonly cluster?: ecs.ICluster;
    readonly taskSetTerminationTimeInMinutes?: number;
    readonly deploymentConfigName?: string;
}

export class EcsBlueGreenPipeline extends Construct {

    constructor(scope: Construct, id: string, props: EcsBlueGreenPipelineProps = {}) {
        super(scope, id);

        const codeRepo = codeCommit.Repository.fromRepositoryName(this, 'codeRepo', props.codeRepoName!);
        const ecrRepo = ecr.Repository.fromRepositoryName(this, 'ecrRepo', props.ecrRepoName!);
        const codeBuildProject = codeBuild.Project.fromProjectName(this, 'codeBuild', props.codeBuildProjectName!);
        const ecsTaskRole = iam.Role.fromRoleArn(this, 'ecsTaskRole', props.ecsTaskRoleArn!);

        const codePipelineRole = new iam.Role(this, 'codePipelineRole', {
            assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com')
        });

        const codePipelinePolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
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
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL
        });

        // S3 bucket policy for the code pipeline artifacts
        const denyUnEncryptedObjectUploads = new iam.PolicyStatement({
            effect: iam.Effect.DENY,
            actions: ['s3:PutObject'],
            principals: [new iam.AnyPrincipal()],
            resources: [artifactsBucket.bucketArn.concat('/*')],
            conditions: {
                StringNotEquals: {
                    's3:x-amz-server-side-encryption': 'aws:kms'
                }
            }
        });

        const denyInsecureConnections = new iam.PolicyStatement({
            effect: iam.Effect.DENY,
            actions: ['s3:*'],
            principals: [new iam.AnyPrincipal()],
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
