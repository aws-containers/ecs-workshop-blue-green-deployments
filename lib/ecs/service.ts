// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Construct } from 'constructs';
import {Duration, RemovalPolicy} from 'aws-cdk-lib';
import {IRole} from 'aws-cdk-lib/aws-iam';
import {IVpc, Port} from 'aws-cdk-lib/aws-ec2';
import {
    ApplicationLoadBalancer,
    ApplicationProtocol,
    ApplicationTargetGroup,
    TargetType
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import {DeploymentControllerType, FargateService, ICluster, Protocol} from 'aws-cdk-lib/aws-ecs';
import {ApplicationListener} from 'aws-cdk-lib/aws-elasticloadbalancingv2/lib/alb/application-listener';
import {IRepository} from 'aws-cdk-lib/aws-ecr';
import ecs = require('aws-cdk-lib/aws-ecs');
import elb = require('aws-cdk-lib/aws-elasticloadbalancingv2');
import log = require('aws-cdk-lib/aws-logs');


export interface EcsBlueGreenServiceProps {
    readonly apiName?: string;
    readonly vpc?: IVpc;
    readonly cluster?: ICluster;
    readonly containerPort?: number;
    readonly ecrRepository?: IRepository;
    readonly ecsTaskRole?: IRole;
}

export class EcsBlueGreenService extends Construct {

    private static readonly PREFIX: string = 'app';

    public readonly ecsService: FargateService;
    public readonly blueTargetGroup: ApplicationTargetGroup;
    public readonly greenTargetGroup: ApplicationTargetGroup;
    public readonly albProdListener: ApplicationListener;
    public readonly albTestListener: ApplicationListener;
    public readonly alb: ApplicationLoadBalancer

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
            protocol: Protocol.TCP
        })

        // Creating an application load balancer, listener and two target groups for Blue/Green deployment
        this.alb = new elb.ApplicationLoadBalancer(this, 'alb', {
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
        this.blueTargetGroup = new elb.ApplicationTargetGroup(this, 'blueGroup', {
            vpc: props.vpc!,
            protocol: ApplicationProtocol.HTTP,
            port: 80,
            targetType: TargetType.IP,
            healthCheck: {
                path: '/',
                timeout: Duration.seconds(30),
                interval: Duration.seconds(60),
                healthyHttpCodes: '200'
            }
        });

        // Target group 2
        this.greenTargetGroup = new elb.ApplicationTargetGroup(this, 'greenGroup', {
            vpc: props.vpc!,
            protocol: ApplicationProtocol.HTTP,
            port: 80,
            targetType: TargetType.IP,
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
                type: DeploymentControllerType.CODE_DEPLOY
            },
            serviceName: props.apiName!
        });

        this.ecsService.connections.allowFrom(this.alb, Port.tcp(80))
        this.ecsService.connections.allowFrom(this.alb, Port.tcp(8080))
        this.ecsService.attachToApplicationTargetGroup(this.blueTargetGroup);

    }

}
