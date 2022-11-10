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

        this.vpc = new ec2.Vpc(this, 'ecsClusterVPC', {
            cidr: props.cidr
        });
        this.cluster = new ecs.Cluster(this, 'ecsCluster', {
            vpc: this.vpc,
            containerInsights: true
        });
    }
}
