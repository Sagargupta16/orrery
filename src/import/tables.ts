// Resource types to official icons, for every importer. A node is a resource that serves traffic
// or holds data; everything else is glue, left out with the reason in GLUE. Every icon id here
// resolves in the bundled catalog (tests/importers.test.ts checks each one).

export interface Kind {
  icon: string;
  /** What the resource is, in a few words: the note under a resource icon. */
  what: string;
  /** Sits outside any Region (CloudFront, Route 53): drawn in the cloud group itself. */
  global?: boolean;
}

/** AWS services by a short concept name, shared by the Terraform and CloudFormation tables. */
export const AWS: Record<string, Kind> = {
  lambda: { icon: "aws:lambda-lambda-function", what: "Lambda function" },
  httpApi: { icon: "aws:api-gateway", what: "HTTP API" },
  restApi: { icon: "aws:api-gateway", what: "REST API" },
  websocketApi: { icon: "aws:api-gateway", what: "WebSocket API" },
  appsync: { icon: "aws:appsync", what: "GraphQL API" },
  table: { icon: "aws:dynamodb-table", what: "DynamoDB table" },
  queue: { icon: "aws:simple-queue-service-queue", what: "SQS queue" },
  topic: { icon: "aws:simple-notification-service-topic", what: "SNS topic" },
  bucket: { icon: "aws:simple-storage-service-bucket", what: "S3 bucket" },
  rule: { icon: "aws:eventbridge-rule", what: "EventBridge rule" },
  schedule: { icon: "aws:eventbridge-scheduler", what: "EventBridge schedule" },
  bus: { icon: "aws:eventbridge-custom-event-bus", what: "Event bus" },
  stateMachine: { icon: "aws:step-functions", what: "State machine" },
  stream: { icon: "aws:kinesis-data-streams", what: "Data stream" },
  firehose: { icon: "aws:data-firehose", what: "Delivery stream" },
  cdn: { icon: "aws:cloudfront", what: "Distribution", global: true },
  alb: {
    icon: "aws:elastic-load-balancing-application-load-balancer",
    what: "Application Load Balancer",
  },
  nlb: { icon: "aws:elastic-load-balancing-network-load-balancer", what: "Network Load Balancer" },
  glb: { icon: "aws:elastic-load-balancing-gateway-load-balancer", what: "Gateway Load Balancer" },
  clb: { icon: "aws:elastic-load-balancing-classic-load-balancer", what: "Classic Load Balancer" },
  instance: { icon: "aws:ec2-instance", what: "EC2 instance" },
  asg: { icon: "aws:ec2-instances", what: "Auto Scaling group" },
  aurora: { icon: "aws:aurora", what: "Aurora cluster" },
  rds: { icon: "aws:rds", what: "Database" },
  redis: { icon: "aws:elasticache-elasticache-for-redis", what: "ElastiCache for Redis" },
  valkey: { icon: "aws:elasticache-elasticache-for-valkey", what: "ElastiCache for Valkey" },
  memcached: {
    icon: "aws:elasticache-elasticache-for-memcached",
    what: "ElastiCache for Memcached",
  },
  memorydb: { icon: "aws:memorydb", what: "MemoryDB cluster" },
  ecsService: { icon: "aws:elastic-container-service-service", what: "ECS service" },
  eks: { icon: "aws:elastic-kubernetes-service", what: "EKS cluster" },
  appRunner: { icon: "aws:app-runner", what: "App Runner service" },
  igw: { icon: "aws:vpc-internet-gateway", what: "Internet gateway" },
  nat: { icon: "aws:vpc-nat-gateway", what: "NAT gateway" },
  userPool: { icon: "aws:cognito", what: "User pool" },
  efs: { icon: "aws:elastic-file-system-efs-standard", what: "EFS file system" },
  opensearch: { icon: "aws:opensearch-service", what: "OpenSearch domain" },
  kafka: { icon: "aws:managed-streaming-for-apache-kafka", what: "MSK cluster" },
  mq: { icon: "aws:mq-broker", what: "MQ broker" },
  redshift: { icon: "aws:redshift", what: "Redshift cluster" },
  documentdb: { icon: "aws:documentdb", what: "DocumentDB cluster" },
  neptune: { icon: "aws:neptune", what: "Neptune cluster" },
  sagemaker: { icon: "aws:sagemaker-ai", what: "SageMaker endpoint" },
  glue: { icon: "aws:glue", what: "Glue job" },
  users: { icon: "aws:users", what: "Users" },
};

/** Terraform AWS resource types; aws_lb and the ElastiCache types pick their concept per resource. */
export const TF_AWS: Record<string, keyof typeof AWS> = {
  aws_lambda_function: "lambda",
  aws_apigatewayv2_api: "httpApi",
  aws_api_gateway_rest_api: "restApi",
  aws_appsync_graphql_api: "appsync",
  aws_dynamodb_table: "table",
  aws_sqs_queue: "queue",
  aws_sns_topic: "topic",
  aws_s3_bucket: "bucket",
  aws_cloudwatch_event_rule: "rule",
  aws_scheduler_schedule: "schedule",
  aws_cloudwatch_event_bus: "bus",
  aws_sfn_state_machine: "stateMachine",
  aws_kinesis_stream: "stream",
  aws_kinesis_firehose_delivery_stream: "firehose",
  aws_cloudfront_distribution: "cdn",
  aws_lb: "alb",
  aws_alb: "alb",
  aws_elb: "clb",
  aws_instance: "instance",
  aws_autoscaling_group: "asg",
  aws_rds_cluster: "aurora",
  aws_db_instance: "rds",
  aws_elasticache_replication_group: "redis",
  aws_elasticache_cluster: "redis",
  aws_elasticache_serverless_cache: "redis",
  aws_memorydb_cluster: "memorydb",
  aws_ecs_service: "ecsService",
  aws_eks_cluster: "eks",
  aws_apprunner_service: "appRunner",
  aws_internet_gateway: "igw",
  aws_nat_gateway: "nat",
  aws_cognito_user_pool: "userPool",
  aws_efs_file_system: "efs",
  aws_opensearch_domain: "opensearch",
  aws_elasticsearch_domain: "opensearch",
  aws_msk_cluster: "kafka",
  aws_mq_broker: "mq",
  aws_redshift_cluster: "redshift",
  aws_docdb_cluster: "documentdb",
  aws_neptune_cluster: "neptune",
  aws_sagemaker_endpoint: "sagemaker",
  aws_glue_job: "glue",
};

/** CloudFormation and SAM resource types. */
export const CFN_AWS: Record<string, keyof typeof AWS> = {
  "AWS::Lambda::Function": "lambda",
  "AWS::Serverless::Function": "lambda",
  "AWS::ApiGatewayV2::Api": "httpApi",
  "AWS::Serverless::HttpApi": "httpApi",
  "AWS::ApiGateway::RestApi": "restApi",
  "AWS::Serverless::Api": "restApi",
  "AWS::AppSync::GraphQLApi": "appsync",
  "AWS::Serverless::GraphQLApi": "appsync",
  "AWS::DynamoDB::Table": "table",
  "AWS::DynamoDB::GlobalTable": "table",
  "AWS::Serverless::SimpleTable": "table",
  "AWS::SQS::Queue": "queue",
  "AWS::SNS::Topic": "topic",
  "AWS::S3::Bucket": "bucket",
  "AWS::Events::Rule": "rule",
  "AWS::Scheduler::Schedule": "schedule",
  "AWS::Events::EventBus": "bus",
  "AWS::StepFunctions::StateMachine": "stateMachine",
  "AWS::Serverless::StateMachine": "stateMachine",
  "AWS::Kinesis::Stream": "stream",
  "AWS::KinesisFirehose::DeliveryStream": "firehose",
  "AWS::CloudFront::Distribution": "cdn",
  "AWS::ElasticLoadBalancingV2::LoadBalancer": "alb",
  "AWS::ElasticLoadBalancing::LoadBalancer": "clb",
  "AWS::EC2::Instance": "instance",
  "AWS::AutoScaling::AutoScalingGroup": "asg",
  "AWS::RDS::DBCluster": "aurora",
  "AWS::RDS::DBInstance": "rds",
  "AWS::ElastiCache::ReplicationGroup": "redis",
  "AWS::ElastiCache::CacheCluster": "redis",
  "AWS::ElastiCache::ServerlessCache": "redis",
  "AWS::MemoryDB::Cluster": "memorydb",
  "AWS::ECS::Service": "ecsService",
  "AWS::EKS::Cluster": "eks",
  "AWS::AppRunner::Service": "appRunner",
  "AWS::EC2::InternetGateway": "igw",
  "AWS::EC2::NatGateway": "nat",
  "AWS::Cognito::UserPool": "userPool",
  "AWS::EFS::FileSystem": "efs",
  "AWS::OpenSearchService::Domain": "opensearch",
  "AWS::Elasticsearch::Domain": "opensearch",
  "AWS::MSK::Cluster": "kafka",
  "AWS::AmazonMQ::Broker": "mq",
  "AWS::Redshift::Cluster": "redshift",
  "AWS::DocDB::DBCluster": "documentdb",
  "AWS::Neptune::DBCluster": "neptune",
  "AWS::SageMaker::Endpoint": "sagemaker",
  "AWS::Glue::Job": "glue",
};

/** Engines that pick another icon than their type's default. */
export function awsEngine(concept: keyof typeof AWS, engine: string | undefined): keyof typeof AWS {
  const e = (engine ?? "").toLowerCase();
  if (concept === "redis")
    return e.includes("valkey") ? "valkey" : e.includes("memcached") ? "memcached" : "redis";
  if (concept === "aurora" && e && !e.startsWith("aurora")) return "rds";
  if (concept === "rds" && e.startsWith("aurora")) return "aurora";
  return concept;
}

/** Load balancer types (`load_balancer_type`, `Type`) to their concept. */
export function awsBalancer(type: string | undefined): keyof typeof AWS {
  const t = (type ?? "application").toLowerCase();
  return t === "network" ? "nlb" : t === "gateway" ? "glb" : "alb";
}

/** Glue, by resource type pattern: what it is and why it is not a node. Checked in order. */
export const GLUE: [RegExp, string][] = [
  [/^(aws_iam_role|AWS::IAM::Role)$/, "IAM role; the flows its policies allow are drawn"],
  [/^(aws_iam_|AWS::IAM::)/, "IAM; its statements are drawn as flows"],
  [
    /^(aws_lambda_permission|AWS::Lambda::Permission)$/,
    "invoke permission; the caller draws the flow",
  ],
  [
    /^(aws_lambda_event_source_mapping|AWS::Lambda::EventSourceMapping)$/,
    "drawn as the flow from its source",
  ],
  [/^(aws_sns_topic_subscription|AWS::SNS::Subscription)$/, "drawn as the flow from its topic"],
  [/^(aws_cloudwatch_event_target|aws_scheduler_)/, "drawn as the flow to its target"],
  [
    /^(aws_apigatewayv2_|aws_api_gateway_|AWS::ApiGateway(V2)?::)/,
    "API wiring; drawn as the flows to its integrations",
  ],
  [
    /^(aws_lb_|aws_alb_|AWS::ElasticLoadBalancingV2::(Listener|ListenerRule|TargetGroup))/,
    "load balancer wiring; drawn as the flows to its targets",
  ],
  [
    /^(aws_autoscaling_attachment|aws_autoscaling_policy|aws_appautoscaling_|AWS::ApplicationAutoScaling::|AWS::AutoScaling::ScalingPolicy)/,
    "scaling settings",
  ],
  [
    /^(aws_security_group|aws_vpc_security_group_|AWS::EC2::SecurityGroup)/,
    "security group; its rules between groups are drawn as flows",
  ],
  [
    /^(aws_route|aws_main_route_table|AWS::EC2::(Route|SubnetRouteTableAssociation|VPCGatewayAttachment))/,
    "routing; drawn as the outbound flows it allows",
  ],
  [/^(aws_eip|AWS::EC2::EIP)/, "Elastic IP address"],
  [
    /^(aws_launch_template|aws_launch_configuration|AWS::EC2::LaunchTemplate|AWS::AutoScaling::LaunchConfiguration)$/,
    "launch settings of an Auto Scaling group",
  ],
  [/^(aws_rds_cluster_instance)$/, "instance of a cluster; counted in its badge"],
  [
    /^(aws_db_|aws_rds_|aws_elasticache_(subnet|parameter|user)|AWS::RDS::DB(SubnetGroup|ClusterParameterGroup|ParameterGroup)|AWS::ElastiCache::(SubnetGroup|ParameterGroup))/,
    "database placement or settings",
  ],
  [/^(aws_ecs_task_definition|AWS::ECS::TaskDefinition)$/, "task definition of an ECS service"],
  [
    /^(aws_ecs_cluster|aws_ecs_cluster_capacity_providers|AWS::ECS::Cluster)$/,
    "cluster; its services are drawn",
  ],
  [
    /^(aws_eks_|AWS::EKS::(Nodegroup|FargateProfile|Addon))/,
    "cluster settings; its workloads are drawn from the manifests",
  ],
  [/^(aws_cloudwatch_|AWS::CloudWatch::|AWS::Logs::)/, "logs and metrics, used by everything"],
  [/^(aws_kms_|AWS::KMS::)/, "encryption keys, used by everything"],
  [
    /^(aws_secretsmanager_|aws_ssm_|AWS::SecretsManager::|AWS::SSM::)/,
    "secrets and settings, used by everything",
  ],
  [/^(aws_s3_bucket_notification)$/, "drawn as the flows from its bucket"],
  [/^(aws_s3_|AWS::S3::BucketPolicy)/, "bucket settings"],
  [
    /^(aws_sqs_queue_|aws_sns_topic_|AWS::SQS::QueuePolicy|AWS::SNS::TopicPolicy)/,
    "queue or topic settings",
  ],
  [/^(aws_acm_|AWS::CertificateManager::)/, "certificate"],
  [/^(aws_route53_|AWS::Route53::)/, "DNS name; no traffic passes through it"],
  [
    /^(aws_cloudfront_(origin|cache|response|function|key|public)|AWS::CloudFront::(Origin|Cache|ResponseHeaders|Function))/,
    "CloudFront settings",
  ],
  [/^(aws_wafv2_|aws_waf_|AWS::WAFv2::)/, "web firewall attached to an entry point"],
  [/^(aws_vpc_endpoint|AWS::EC2::VPCEndpoint)/, "private route to a service"],
  [
    /^(aws_vpc_|aws_default_|aws_network_acl|aws_flow_log|aws_egress_only|AWS::EC2::(VPCCidrBlock|NetworkAcl|DHCPOptions|FlowLog))/,
    "network settings",
  ],
  [/^(aws_ecr_|AWS::ECR::)/, "image registry; it belongs in a deploy figure"],
  [
    /^(aws_dynamodb_table_item|aws_dynamodb_contributor|aws_dynamodb_resource_policy)/,
    "table settings",
  ],
  [/^(aws_lambda_(alias|layer|function_event|provisioned|code_signing))/, "function settings"],
  [
    /^(aws_lambda_function_url|AWS::Lambda::Url)$/,
    "drawn as the flow from the users to its function",
  ],
  [/^(aws_cognito_|AWS::Cognito::)/, "user pool settings"],
  [/^(aws_sfn_activity|aws_sfn_alias)/, "state machine settings"],
  [/^(aws_pipes_pipe|AWS::Pipes::Pipe)$/, "drawn as the flow from its source to its target"],
  [
    /^(aws_s3_bucket_replication|aws_kinesis_|aws_glue_|aws_athena_|aws_lakeformation_)/,
    "service settings",
  ],
  [/^AWS::(Lambda|SQS|SNS|DynamoDB|Events|Kinesis|StepFunctions)::/, "service settings"],
  [/^(AWS::CDK::Metadata|AWS::CloudFormation::)/, "deployment plumbing"],
  [/^Custom::/, "custom resource run at deploy time"],
  [
    /^(random_|null_|terraform_data|time_|tls_|local_|archive_|external$|http$)/,
    "helper resource with no runtime traffic",
  ],
  [
    /^(azurerm_role_|azurerm_user_assigned_identity|azurerm_key_vault|azurerm_log_analytics|azurerm_monitor|azurerm_application_insights|azurerm_network_security|azurerm_route|azurerm_public_ip|azurerm_network_interface|azurerm_.*_association$|azurerm_service_plan|azurerm_app_service_plan|azurerm_private_dns|azurerm_dns)/,
    "Azure plumbing: identity, monitoring, addressing or plans",
  ],
  [
    /^(google_project_iam|google_service_account|google_.*_iam_|google_project_service|google_kms|google_secret_manager|google_logging|google_monitoring|google_compute_(firewall|route|router|address|global_address|backend|health_check|target|forwarding|url_map|managed_ssl|ssl)|google_dns)/,
    "Google Cloud plumbing: identity, monitoring, addressing or load balancer parts",
  ],
];

/** Terraform Azure resource types. */
export const TF_AZURE: Record<string, Kind> = {
  azurerm_linux_function_app: { icon: "azure:function-apps", what: "Function App" },
  azurerm_windows_function_app: { icon: "azure:function-apps", what: "Function App" },
  azurerm_function_app: { icon: "azure:function-apps", what: "Function App" },
  azurerm_linux_web_app: { icon: "azure:app-services", what: "App Service" },
  azurerm_windows_web_app: { icon: "azure:app-services", what: "App Service" },
  azurerm_app_service: { icon: "azure:app-services", what: "App Service" },
  azurerm_linux_virtual_machine: { icon: "azure:virtual-machine", what: "Virtual Machine" },
  azurerm_windows_virtual_machine: { icon: "azure:virtual-machine", what: "Virtual Machine" },
  azurerm_virtual_machine: { icon: "azure:virtual-machine", what: "Virtual Machine" },
  azurerm_storage_account: { icon: "azure:storage-accounts", what: "Storage Account" },
  azurerm_mssql_database: { icon: "azure:sql-database", what: "SQL Database" },
  azurerm_cosmosdb_account: { icon: "azure:azure-cosmos-db", what: "Azure Cosmos DB" },
  azurerm_servicebus_namespace: { icon: "azure:azure-service-bus", what: "Service Bus" },
  azurerm_eventhub_namespace: { icon: "azure:event-hubs", what: "Event Hub" },
  azurerm_eventgrid_topic: { icon: "azure:event-grid-topics", what: "Event Grid Topic" },
  azurerm_kubernetes_cluster: { icon: "azure:kubernetes-services", what: "Kubernetes Service" },
  azurerm_container_app_environment: {
    icon: "azure:container-apps-environments",
    what: "Container Apps Environment",
  },
  azurerm_application_gateway: { icon: "azure:application-gateways", what: "Application Gateway" },
  azurerm_lb: { icon: "azure:load-balancers", what: "Load Balancer" },
  azurerm_cdn_frontdoor_profile: { icon: "azure:front-door-and-cdn-profiles", what: "Front Door" },
  azurerm_api_management: { icon: "azure:api-management-services", what: "API Management Service" },
  azurerm_redis_cache: { icon: "azure:cache-redis", what: "Cache Redis" },
  azurerm_postgresql_flexible_server: {
    icon: "azure:azure-database-postgresql-server",
    what: "Azure Database PostgreSQL Server",
  },
};

/** Terraform Google Cloud resource types. */
export const TF_GOOGLE: Record<string, Kind> = {
  google_cloud_run_v2_service: { icon: "gcp:cloud-run", what: "Cloud Run" },
  google_cloud_run_service: { icon: "gcp:cloud-run", what: "Cloud Run" },
  google_cloudfunctions2_function: { icon: "gcp:cloud-functions", what: "Cloud Functions" },
  google_cloudfunctions_function: { icon: "gcp:cloud-functions", what: "Cloud Functions" },
  google_compute_instance: { icon: "gcp:compute-engine", what: "Compute Engine" },
  google_compute_instance_group_manager: { icon: "gcp:compute-engine", what: "Compute Engine" },
  google_compute_region_instance_group_manager: {
    icon: "gcp:compute-engine",
    what: "Compute Engine",
  },
  google_storage_bucket: { icon: "gcp:cloud-storage", what: "Cloud Storage" },
  google_sql_database_instance: { icon: "gcp:cloud-sql", what: "Cloud SQL" },
  google_pubsub_topic: { icon: "gcp:pubsub", what: "Pub/Sub" },
  google_bigquery_dataset: { icon: "gcp:bigquery", what: "BigQuery" },
  google_container_cluster: { icon: "gcp:gke", what: "GKE" },
  google_redis_instance: { icon: "gcp:memorystore", what: "Memorystore" },
  google_firestore_database: { icon: "gcp:firestore", what: "Firestore" },
  google_spanner_instance: { icon: "gcp:cloud-spanner", what: "Spanner" },
  google_api_gateway_gateway: { icon: "gcp:cloud-api-gateway", what: "Cloud API Gateway" },
  google_compute_router_nat: { icon: "gcp:cloud-nat", what: "Cloud NAT" },
};

/** Kubernetes kinds drawn as nodes. */
export const K8S: Record<string, Kind> = {
  Deployment: { icon: "k8s:deployment", what: "Deployment" },
  StatefulSet: { icon: "k8s:statefulset", what: "StatefulSet" },
  DaemonSet: { icon: "k8s:daemonset", what: "DaemonSet" },
  Job: { icon: "k8s:job", what: "Job" },
  CronJob: { icon: "k8s:cronjob", what: "CronJob" },
  Pod: { icon: "k8s:pod", what: "Pod" },
  ReplicaSet: { icon: "k8s:replicaset", what: "ReplicaSet" },
  Service: { icon: "k8s:service", what: "Service" },
  Ingress: { icon: "k8s:ingress", what: "Ingress" },
  Gateway: { icon: "k8s:ingress", what: "Gateway" },
  users: { icon: "tabler:users", what: "Users" },
};

/** Kubernetes kinds left out, with the reason. */
export const K8S_GLUE: Record<string, string> = {
  Namespace: "drawn as a group",
  ConfigMap: "configuration; the hosts it names are drawn as flows",
  Secret: "credentials, used by everything",
  ServiceAccount: "identity",
  Role: "access rules",
  ClusterRole: "access rules",
  RoleBinding: "access rules",
  ClusterRoleBinding: "access rules",
  HorizontalPodAutoscaler: "scaling settings; its range is in the workload's note",
  PodDisruptionBudget: "availability settings",
  PersistentVolumeClaim: "storage claim of a workload",
  PersistentVolume: "storage",
  StorageClass: "storage settings",
  NetworkPolicy: "access rules; the traffic it allows is drawn as flows",
  HTTPRoute: "drawn as the flows from its gateway",
  GRPCRoute: "drawn as the flows from its gateway",
  IngressClass: "controller settings",
  GatewayClass: "controller settings",
  ServiceMonitor: "monitoring settings",
  PodMonitor: "monitoring settings",
  LimitRange: "quota settings",
  ResourceQuota: "quota settings",
  CustomResourceDefinition: "API extension",
  Endpoints: "generated from a Service",
  EndpointSlice: "generated from a Service",
};

/** Container images to logos: the first pattern that matches the image name wins. */
export const IMAGES: [RegExp, Kind][] = [
  [/(^|\/)postgres(ql)?(:|$)|postgis|timescale/, { icon: "logos:postgresql", what: "PostgreSQL" }],
  [/(^|\/)mysql(:|$)/, { icon: "logos:mysql-icon", what: "MySQL" }],
  [/(^|\/)mariadb(:|$)/, { icon: "logos:mariadb-icon", what: "MariaDB" }],
  [/(^|\/)mongo(db)?(:|$)/, { icon: "logos:mongodb-icon", what: "MongoDB" }],
  [/(^|\/)valkey(:|$)/, { icon: "logos:valkey-icon", what: "Valkey" }],
  [/(^|\/)redis(:|$)|redis-stack/, { icon: "logos:redis", what: "Redis" }],
  [/(^|\/)rabbitmq(:|$)/, { icon: "logos:rabbitmq-icon", what: "RabbitMQ" }],
  [/kafka/, { icon: "logos:kafka-icon", what: "Kafka" }],
  [/(^|\/)nats(:|$)/, { icon: "logos:nats-icon", what: "NATS" }],
  [/(^|\/)nginx(:|$)|nginx-unprivileged/, { icon: "logos:nginx", what: "NGINX" }],
  [/(^|\/)traefik(:|$)/, { icon: "logos:traefik-proxy-icon", what: "Traefik Proxy" }],
  [/(^|\/)caddy(:|$)/, { icon: "si:caddy", what: "Caddy" }],
  [/(^|\/)envoy/, { icon: "logos:envoy-icon", what: "Envoy" }],
  [/elasticsearch/, { icon: "logos:elasticsearch", what: "Elasticsearch" }],
  [/opensearch/, { icon: "logos:opensearch-icon", what: "OpenSearch" }],
  [/kibana/, { icon: "logos:kibana", what: "Kibana" }],
  [/grafana/, { icon: "logos:grafana", what: "Grafana" }],
  [/prometheus/, { icon: "logos:prometheus", what: "Prometheus" }],
  [/jaeger/, { icon: "si:jaeger", what: "Jaeger" }],
  [/otel|opentelemetry/, { icon: "logos:opentelemetry-icon", what: "OpenTelemetry Collector" }],
  [/minio/, { icon: "si:minio", what: "MinIO" }],
  [/memcached/, { icon: "logos:memcached", what: "Memcached" }],
  [/cassandra/, { icon: "logos:cassandra", what: "Cassandra" }],
  [/clickhouse/, { icon: "si:clickhouse", what: "ClickHouse" }],
  [/influxdb/, { icon: "logos:influxdb-icon", what: "InfluxDB" }],
  [/consul/, { icon: "logos:consul", what: "Consul" }],
  [/vault/, { icon: "logos:vault-icon", what: "Vault" }],
  [/(^|\/)node(:|$)/, { icon: "logos:nodejs-icon", what: "Node.js" }],
  [/(^|\/)python(:|$)/, { icon: "logos:python", what: "Python" }],
  [/(^|\/)golang(:|$)/, { icon: "logos:go", what: "Go" }],
];

/** A container with an image the table does not know, or one built from source. */
export const CONTAINER: Kind = { icon: "logos:docker-icon", what: "Container" };

/** Every icon id the importers can write, for the test that checks each resolves. */
export function tableIcons(): string[] {
  return [
    ...Object.values(AWS),
    ...Object.values(TF_AZURE),
    ...Object.values(TF_GOOGLE),
    ...Object.values(K8S),
    ...IMAGES.map(([, k]) => k),
    CONTAINER,
  ].map((k) => k.icon);
}
