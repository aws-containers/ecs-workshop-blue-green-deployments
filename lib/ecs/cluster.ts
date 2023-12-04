// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';

export interface EcsBlueGreenClusterProps {
    readonly cidr?: string;
}

export class EcsBlueGreenCluster extends Construct {

    public readonly vpc: ec2.IVpc;
    public readonly cluster: ecs.ICluster;

    constructor(scope: Construct, id: string, props: EcsBlueGreenClusterProps = {}) {
        super(scope, id);

        // Create the VPC for the ECS cluster.  The VPC will have one private subnet without NAT Gateway.  
        this.vpc = new ec2.Vpc(this, 'ecsClusterVPC', {
            cidr: props.cidr,
            subnetConfiguration: [
              {
                name: 'Private',
                subnetType: ec2.SubnetType.PRIVATE_ISOLATED              
            }
            ]  
          });

        // Create the VPC endpoint for the ECR registry
        new ec2.InterfaceVpcEndpoint(this, 'ECRVpcEndpoint', {
            vpc: this.vpc, 
            service: ec2.InterfaceVpcEndpointAwsService.ECR,
            privateDnsEnabled: true
        })

        // Create the VPC endpoint for the ECR Docker registry.  This is required for the Fargate task to pull the docker image from ECR.  
        //This is not required for the ECS task to pull the docker image from ECR.  The ECS task will pull the docker image from EC

        new ec2.InterfaceVpcEndpoint(this, 'ECRDockerVpcEndpoint', {
            vpc: this.vpc,            
            service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
            privateDnsEnabled: true
        })

        // access S3 bucket from Fargate task.  This is required for the Fargate task to pull the docker image from ECR.
        new ec2.GatewayVpcEndpoint(this, 'S3GatewayEndpoint', {
            service: ec2.GatewayVpcEndpointAwsService.S3,
            vpc: this.vpc,            
            subnets: [{ subnetType: ec2.SubnetType.PRIVATE_ISOLATED, }]
        })
        
        // access Cloudwatch logging
        new ec2.InterfaceVpcEndpoint(this, 'CloudWatchLogsVpcEndpoint', {
            vpc: this.vpc,            
            service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
            privateDnsEnabled: true
        })

        this.cluster = new ecs.Cluster(this, 'ecsCluster', {
            vpc: this.vpc,
            containerInsights: true
        });
    }
}
