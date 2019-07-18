import ec2 = require('@aws-cdk/aws-ec2');
import ecs = require('@aws-cdk/aws-ecs');
import ecs_patterns = require('@aws-cdk/aws-ecs-patterns');
import iam = require('@aws-cdk/aws-iam');
import s3 = require('@aws-cdk/aws-s3');
import cloudfront = require('@aws-cdk/aws-cloudfront');
import cdk = require('@aws-cdk/core');

export class SpekeStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    const key_retention_days = new cdk.CfnParameter(this, 'KeyRetentionDays', {default: 2, type: "Number"});
    const widevine_pssh_box = new cdk.CfnParameter(this, 'WidevinePSSHBox', {default: "", type: "String"});
    const widevine_protection_header = new cdk.CfnParameter(this, 'WidevineProtectionHeader', {default: "", type: "String"});
    const playready_pssh_box = new cdk.CfnParameter(this, 'PlayreadyPSSHBox', {default: "", type: "String"});
    const playready_protection_header = new cdk.CfnParameter(this, 'PlayreadyProtectionHeader', {default: "", type: "String"});
    const playready_content_key = new cdk.CfnParameter(this, 'PlayreadyContentKey', {default: "", type: "String"});
    
    const key_bucket = new s3.Bucket(this, 'KeyBucket', {
      cors: [
        {
          allowedHeaders: ["*"],
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: ["*"],
          maxAge: 3000
        }
      ],
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(key_retention_days.valueAsNumber),
          id: "Expire old keys",
          enabled: true
        }
      ]
    });

    new cdk.CfnOutput(this, 'SPEKEKeyBucket', {
      description: "Bucket name for the SPEKE key cache", 
      value: key_bucket.bucketName
    });

    const key_cdn = new cloudfront.CloudFrontWebDistribution(this, 'KeyBucketCloudFrontDistribution', {
      comment: "SPEKE CDN for " + key_bucket.bucketName,
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: key_bucket
          },
          behaviors: [
            { isDefaultBehavior: true }
          ],
        }
      ],
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
    })
    
    const vpc = new ec2.Vpc(this, "SpekeVpc");
    
    const cluster = new ecs.Cluster(this, "SpekeCluster", {
      vpc: vpc
    })
    
    const role = new iam.Role(this, 'SpekeTaskRole', {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    
    role.addToPolicy(new iam.PolicyStatement({
      actions: ["secretsmanager:GetRandomPassword", "secretsmanager:CreateSecrets"],
      resources: ["*"]
    }));
    role.addToPolicy(new iam.PolicyStatement({
      actions: ["secretsmanager:GetSecretValue"],
      resources: ["arn:aws:secretsmanager:" + this.region +":"+ this.account + ":secret:speke/*" ]
    }));
    role.addToPolicy(new iam.PolicyStatement({
      actions: ["s3:PutObject", "s3:PutObjectAcl"],
      resources: [key_bucket.bucketArn + "/*"]
    }));

    // create a load-balanced Fargate service and make it public
    const service = new ecs_patterns.LoadBalancedFargateService(this, "SpekeService", {
      cluster: cluster,
      cpu: 1024,
      desiredCount: 2,
      image: ecs.ContainerImage.fromRegistry("chankh/speke-key-server:latest"),
      memoryLimitMiB: 2048,
      publicLoadBalancer: true,
      environment: {
        "WIDEVINE_PSSH_BOX": widevine_pssh_box.valueAsString, 
        "WIDEVINE_PROTECTION_HEADER": widevine_protection_header.valueAsString,
        "PLAYREADY_CONTENT_KEY": playready_content_key.valueAsString,
        "PLAYREADY_PROTECTION_HEADER": playready_protection_header.valueAsString,
        "PLAYREADY_PSSH_BOX": playready_pssh_box.valueAsString,
        "KEYSTORE_BUCKET": key_bucket.bucketName,
        "KEYSTORE_URL": "https://" + key_cdn.domainName,
      },
      taskRole: role,
    });

    new cdk.CfnOutput(this, 'SPEKEServerURL', {
      description: "URL for the SPEKE server that is called by MediaPackage",
      value: "https://" + service.loadBalancer.loadBalancerDnsName + "/copyProtection"
    });
  }
}
