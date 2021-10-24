# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import json
import logging
import urllib.request
import uuid

import boto3

SUCCESS = "SUCCESS"
FAILED = "FAILED"

# Configure logging
LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.DEBUG)

client = boto3.client('codedeploy')


class DeploymentGroupConfig:
    """
    Accepts deployment group parameters for populating the object to create the CodeDeploy configuration
    """

    def __init__(
            self,
            application_name,
            deployment_group_name,
            deployment_config_name,
            service_role_arn,
            blue_target_group,
            green_target_group,
            prod_listener_arn,
            test_listener_arn,
            cluster_name,
            service_name,
            termination_wait_time,
            target_group_alarms
    ):
        """
        DeploymentGroupConfig accepts parameters for the CodeDeploy deployment group custom resource

        :param application_name: CodeDeploy application name
        :param deployment_group_name: CodeDeploy deployment group name
        :param deployment_config_name: CodeDeploy configuration name
        :param service_role_arn: CodeDeploy service role arn
        :param blue_target_group: Blue deployment target group arn
        :param green_target_group: Green deployment target group arn
        :param prod_listener_arn: Production listener arn
        :param test_listener_arn: Test listener arn
        :param cluster_name: ECS cluster name
        :param service_name: ECS service name
        :param termination_wait_time: ECS task set termination wait time
        :param target_group_alarms: Target group CloudWatch alarms
        """
        self.application_name = application_name
        self.deployment_group_name = deployment_group_name
        self.deployment_config_name = deployment_config_name
        self.service_role_arn = service_role_arn
        self.blue_target_group = blue_target_group
        self.green_target_group = green_target_group
        self.prod_listener_arn = prod_listener_arn
        self.test_listener_arn = test_listener_arn
        self.cluster_name = cluster_name
        self.service_name = service_name
        self.termination_wait_time = termination_wait_time
        self.target_group_alarms = target_group_alarms


def extract_params(event):
    return DeploymentGroupConfig(
        application_name=event['ResourceProperties']['ApplicationName'],
        deployment_group_name=event['ResourceProperties']['DeploymentGroupName'],
        deployment_config_name=event['ResourceProperties']['DeploymentConfigName'],
        service_role_arn=event['ResourceProperties']['ServiceRoleArn'],
        blue_target_group=event['ResourceProperties']['BlueTargetGroup'],
        green_target_group=event['ResourceProperties']['GreenTargetGroup'],
        prod_listener_arn=event['ResourceProperties']['ProdListenerArn'],
        test_listener_arn=event['ResourceProperties']['TestListenerArn'],
        cluster_name=event['ResourceProperties']['EcsClusterName'],
        service_name=event['ResourceProperties']['EcsServiceName'],
        termination_wait_time=event['ResourceProperties']['TerminationWaitTime'],
        target_group_alarms=event['ResourceProperties']['TargetGroupAlarms']
    )


# Lambda Handler
def handler(event, context):
    LOGGER.info("Received event: " + json.dumps(event, indent=2))

    request_type = event['RequestType']

    if request_type == 'Create':
        create_deployment_group(event, context)
    elif request_type == 'Update':
        update_deployment_group(event, context)
    elif request_type == 'Delete':
        delete_deployment_group(event, context)


def create_deployment_group(event, context):
    data = {}
    status = FAILED
    config = extract_params(event)
    try:
        client.create_deployment_group(
            applicationName=config.application_name,
            deploymentGroupName=config.deployment_group_name,
            deploymentConfigName=config.deployment_config_name,
            serviceRoleArn=config.service_role_arn,
            deploymentStyle={
                'deploymentType': 'BLUE_GREEN',
                'deploymentOption': 'WITH_TRAFFIC_CONTROL'
            },
            blueGreenDeploymentConfiguration={
                'terminateBlueInstancesOnDeploymentSuccess': {
                    'action': 'TERMINATE',
                    'terminationWaitTimeInMinutes': int(config.termination_wait_time)
                },
                'deploymentReadyOption': {
                    'actionOnTimeout': 'CONTINUE_DEPLOYMENT'
                }
            },
            alarmConfiguration={
                'enabled': True,
                'ignorePollAlarmFailure': False,
                'alarms': json.loads(config.target_group_alarms)
            },
            autoRollbackConfiguration={
                'enabled': True,
                'events': [
                    'DEPLOYMENT_FAILURE',
                    'DEPLOYMENT_STOP_ON_REQUEST',
                    'DEPLOYMENT_STOP_ON_ALARM'
                ]
            },
            ecsServices=[
                {
                    'serviceName': config.service_name,
                    'clusterName': config.cluster_name
                },
            ],
            loadBalancerInfo={
                'targetGroupPairInfoList': [
                    {
                        'targetGroups': [
                            {
                                'name': config.blue_target_group
                            },
                            {
                                'name': config.green_target_group
                            }
                        ],
                        'prodTrafficRoute': {
                            'listenerArns': [
                                config.prod_listener_arn
                            ]
                        },
                        'testTrafficRoute': {
                            'listenerArns': [
                                config.test_listener_arn
                            ]
                        }
                    },
                ]
            }
        )
        data = {
            "event": "Resource created",
            "deploymentGroupName": config.deployment_group_name
        }
        status = SUCCESS
    except BaseException as e:
        LOGGER.error("Resource create failed for deployment group {}".format(config.deployment_group_name) + str(e))
    finally:
        send(event=event,
             context=context,
             physical_resource_id='is-set-' + str(uuid.uuid4()),
             response_status=status,
             response_data=data)


def update_deployment_group(event, context):
    data = {}
    status = FAILED
    config = extract_params(event)
    try:
        current_deployment_group_name = event['OldResourceProperties']['DeploymentGroupName']

        client.update_deployment_group(
            applicationName=config.application_name,
            currentDeploymentGroupName=current_deployment_group_name,
            newDeploymentGroupName=config.deployment_group_name,
            deploymentConfigName=config.deployment_config_name,
            serviceRoleArn=config.service_role_arn,
            deploymentStyle={
                'deploymentType': 'BLUE_GREEN',
                'deploymentOption': 'WITH_TRAFFIC_CONTROL'
            },
            blueGreenDeploymentConfiguration={
                'terminateBlueInstancesOnDeploymentSuccess': {
                    'action': 'TERMINATE',
                    'terminationWaitTimeInMinutes': int(config.termination_wait_time)
                },
                'deploymentReadyOption': {
                    'actionOnTimeout': 'CONTINUE_DEPLOYMENT'
                }
            },
            alarmConfiguration={
                'enabled': True,
                'ignorePollAlarmFailure': False,
                'alarms': json.loads(config.target_group_alarms)
            },
            autoRollbackConfiguration={
                'enabled': True,
                'events': [
                    'DEPLOYMENT_FAILURE',
                    'DEPLOYMENT_STOP_ON_REQUEST',
                    'DEPLOYMENT_STOP_ON_ALARM'
                ]
            },
            ecsServices=[
                {
                    'serviceName': config.service_name,
                    'clusterName': config.cluster_name
                },
            ],
            loadBalancerInfo={
                'targetGroupPairInfoList': [
                    {
                        'targetGroups': [
                            {
                                'name': config.blue_target_group
                            },
                            {
                                'name': config.green_target_group
                            }
                        ],
                        'prodTrafficRoute': {
                            'listenerArns': [
                                config.prod_listener_arn
                            ]
                        },
                        'testTrafficRoute': {
                            'listenerArns': [
                                config.test_listener_arn
                            ]
                        }
                    },
                ]
            }
        )
        data = {
            "event": "Resource updated",
            "deploymentGroupName": config.deployment_group_name
        }
        status = SUCCESS
    except BaseException as e:
        LOGGER.error("Resource update failed for deployment group {}".format(config.deployment_group_name) + str(e))
    finally:
        send(event=event,
             context=context,
             physical_resource_id=event['PhysicalResourceId'],
             response_status=status,
             response_data=data)


def delete_deployment_group(event, context):
    data = {}
    status = FAILED
    config = extract_params(event)

    if not event['PhysicalResourceId'].startswith('is-set-'):
        send(event=event,
             context=context,
             physical_resource_id=event['PhysicalResourceId'],
             response_status=SUCCESS,
             response_data=data)
    else:
        try:
            client.delete_deployment_group(
                applicationName=config.application_name,
                deploymentGroupName=config.deployment_group_name
            )
            status = SUCCESS

            data = {
                "event": "Resource deleted",
                "deploymentGroupName": config.deployment_group_name
            }
        except BaseException as e:
            LOGGER.error("Resource delete failed for deployment group {}".format(config.deployment_group_name) + str(e))
        finally:
            send(event=event,
                 context=context,
                 physical_resource_id=event['PhysicalResourceId'],
                 response_status=status,
                 response_data=data)


def send(event, context, response_status, response_data, physical_resource_id=None, no_echo=False):
    response_url = event['ResponseURL']

    LOGGER.info(response_url)

    response_body = {
        'Status': response_status,
        'Reason': 'See the details in CloudWatch Log Stream: ' + context.log_stream_name,
        'PhysicalResourceId': physical_resource_id or context.log_stream_name, 'StackId': event['StackId'],
        'RequestId': event['RequestId'], 'LogicalResourceId': event['LogicalResourceId'],
        'NoEcho': no_echo,
        'Data': response_data
    }

    json_response_body = json.dumps(response_body)

    LOGGER.info("Response body:\n" + json_response_body)

    headers = {
        'content-type': '',
        'content-length': str(len(json_response_body))
    }

    try:
        req = urllib.request.Request(response_url,
                                     data=json_response_body.encode('utf-8'),
                                     headers=headers,
                                     method='PUT')
        response = urllib.request.urlopen(req)
        LOGGER.info("Status code: " + response.reason)
    except Exception as e:
        LOGGER.error("send(..) failed executing requests.put(..): " + str(e))
