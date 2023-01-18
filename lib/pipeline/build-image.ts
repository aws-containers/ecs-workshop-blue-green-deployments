// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Construct } from 'constructs';
import { CfnOutput } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as codeCommit from 'aws-cdk-lib/aws-codecommit';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as codeBuild from 'aws-cdk-lib/aws-codebuild';

export interface EcsBlueGreenBuildImageProps {
    readonly codeRepoName?: string;
    readonly codeRepoDesc?: string;
    readonly ecsTaskRole?: iam.Role;
    readonly codeBuildRole?: iam.Role;
    readonly dockerHubUsername?: string;
    readonly dockerHubPassword?: string;
}

export class EcsBlueGreenBuildImage extends Construct {

    public readonly ecrRepo: ecr.Repository;
    public readonly codeBuildProject: codeBuild.Project;

    constructor(scope: Construct, id: string, props: EcsBlueGreenBuildImageProps = {}) {
        super(scope, id);

        // ECR repository for the docker images
        this.ecrRepo = new ecr.Repository(this, 'ecrRepo', {
            imageScanOnPush: true
        });

        // CodeCommit repository for storing the source code
        const codeRepo = new codeCommit.Repository(this, 'codeRepo', {
            repositoryName: props.codeRepoName!,
            description: props.codeRepoDesc!
        });

        // Creating the code build project
        this.codeBuildProject = new codeBuild.Project(this, 'codeBuild', {
            role: props.codeBuildRole,
            description: 'Code build project for the application',
            environment: {
                buildImage: codeBuild.LinuxBuildImage.STANDARD_5_0,
                computeType: codeBuild.ComputeType.SMALL,
                privileged: true,
                environmentVariables: {
                    REPOSITORY_URI: {
                        value: this.ecrRepo.repositoryUri,
                        type: codeBuild.BuildEnvironmentVariableType.PLAINTEXT
                    },
                    TASK_EXECUTION_ARN: {
                        value: props.ecsTaskRole!.roleArn,
                        type: codeBuild.BuildEnvironmentVariableType.PLAINTEXT
                    }
                }
            },
            source: codeBuild.Source.codeCommit({
                repository: codeRepo,
                branchOrRef: 'main'
            })
        });

        // Export the outputs
        new CfnOutput(this, 'codeRepoName', {
            description: 'CodeCommit repository name',
            exportName: 'repositoryName',
            value: codeRepo.repositoryName
        });
        new CfnOutput(this, 'ecrRepoName', {
            description: 'ECR repository name',
            exportName: 'ecrRepoName',
            value: this.ecrRepo.repositoryName
        });
        new CfnOutput(this, 'codeBuildProjectName', {
            description: 'CodeBuild project name',
            exportName: 'codeBuildProjectName',
            value: this.codeBuildProject.projectName
        });
        new CfnOutput(this, 'ecsTaskRoleArn', {
            description: 'ECS task role arn',
            exportName: 'ecsTaskRoleArn',
            value: props.ecsTaskRole?.roleArn!
        });
        new CfnOutput(this, 'codeRepoCloneURL', {
            description: 'CodeCommit repository clone URL',
            exportName: 'repositoryCloneUrlHttp',
            value: codeRepo.repositoryCloneUrlHttp
        });
    }
}
