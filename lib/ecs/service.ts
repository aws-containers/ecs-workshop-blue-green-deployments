// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Construct } from 'constructs';
import { RemovalPolicy, Duration } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as log from 'aws-cdk-lib/aws-logs';
import * as albv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';


export interface EcsBlueGreenServiceProps {
    readonly apiName?: string;
    readonly vpc?: ec2.IVpc;
    readonly cluster?: ecs.ICluster;
    readonly containerPort?: number;
    readonly ecrRepository?: ecr.IRepository;
    readonly ecsTaskRole?: iam.IRole;
}

export class EcsBlueGreenService extends Construct {

    private static readonly PREFIX: string = 'app';

    public readonly ecsService: ecs.FargateService;
    public readonly blueTargetGroup: albv2.ApplicationTargetGroup;
    public readonly greenTargetGroup: albv2.ApplicationTargetGroup;
    public readonly albProdListener: albv2.ApplicationListener;
    public readonly albTestListener: albv2.ApplicationListener;
    public readonly alb: albv2.ApplicationLoadBalancer

    constructor(scope: Construct, id: string, props: EcsBlueGreenServiceProps = {}) {
        super(scope, id);

        // Creating the task definition
        const taskDefinition = new ecs.FargateTaskDefinition(this, 'apiTaskDefinition', {
            family: props.apiName,
            cpu: 256,
            memoryLimitMiB: 1024,
            taskRole: props.ecsTaskRole,
            executionRole: props.ecsTaskRole
        });
        taskDefinition.addContainer('apiContainer', {
            image: ecs.ContainerImage.fromEcrRepository(props.ecrRepository!),
            logging: new ecs.AwsLogDriver({
                logGroup: new log.LogGroup(this, 'apiLogGroup', {
                    logGroupName: '/ecs/'.concat(props.apiName!),
                    removalPolicy: RemovalPolicy.DESTROY
                }),
                streamPrefix: EcsBlueGreenService.PREFIX
            }),
        }).addPortMappings({
            containerPort: props.containerPort!,
            protocol: ecs.Protocol.TCP
        })

        // Creating an application load balancer, listener and two target groups for Blue/Green deployment
        this.alb = new albv2.ApplicationLoadBalancer(this, 'alb', {
            vpc: props.vpc!,
            internetFacing: true
        });
        this.albProdListener = this.alb.addListener('albProdListener', {
            port: 80
        });
        this.albTestListener = this.alb.addListener('albTestListener', {
            port: 8080
        });

        this.albProdListener.connections.allowDefaultPortFromAnyIpv4('Allow traffic from everywhere');
        this.albTestListener.connections.allowDefaultPortFromAnyIpv4('Allow traffic from everywhere');

        // Target group 1
        this.blueTargetGroup = new albv2.ApplicationTargetGroup(this, 'blueGroup', {
            vpc: props.vpc!,
            protocol: albv2.ApplicationProtocol.HTTP,
            port: 80,
            targetType: albv2.TargetType.IP,
            healthCheck: {
                path: '/',
                timeout: Duration.seconds(30),
                interval: Duration.seconds(60),
                healthyHttpCodes: '200'
            }
        });

        // Target group 2
        this.greenTargetGroup = new albv2.ApplicationTargetGroup(this, 'greenGroup', {
            vpc: props.vpc!,
            protocol: albv2.ApplicationProtocol.HTTP,
            port: 80,
            targetType: albv2.TargetType.IP,
            healthCheck: {
                path: '/',
                timeout: Duration.seconds(30),
                interval: Duration.seconds(60),
                healthyHttpCodes: '200'
            }
        });

        // Registering the blue target group with the production listener of load balancer
        this.albProdListener.addTargetGroups('blueTarget', {
            targetGroups: [this.blueTargetGroup]
        });

        // Registering the green target group with the test listener of load balancer
        this.albTestListener.addTargetGroups('greenTarget', {
            targetGroups: [this.greenTargetGroup]
        });

        this.ecsService = new ecs.FargateService(this, 'ecsService', {
            cluster: props.cluster!,
            taskDefinition: taskDefinition,
            healthCheckGracePeriod: Duration.seconds(60),
            desiredCount: 3,
            deploymentController: {
                type: ecs.DeploymentControllerType.CODE_DEPLOY
            },
            serviceName: props.apiName!
        });

        this.ecsService.connections.allowFrom(this.alb, ec2.Port.tcp(80))
        this.ecsService.connections.allowFrom(this.alb, ec2.Port.tcp(8080))
        this.ecsService.attachToApplicationTargetGroup(this.blueTargetGroup);

    }

}
