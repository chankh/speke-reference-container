#!/usr/bin/env node
import cdk = require('@aws-cdk/core');
import { SpekeStack } from '../lib/cdk-stack';

const app = new cdk.App();
new SpekeStack(app, 'SpekeStack');