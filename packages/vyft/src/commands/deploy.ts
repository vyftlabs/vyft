import { Command } from 'commander';
import * as clack from '@clack/prompts';
import * as fs from 'fs';
import * as path from 'path';
import {
  getCurrentCluster,
  getCurrentClusterInfo,
} from '../services/cluster.js';

export const deploy = new Command('deploy').description(
  'Deploy your application',
);

deploy.action(async () => {
  clack.intro('🚀 Deploying your application');

  try {
    const configPath = path.join(process.cwd(), 'vyft.config.ts');

    if (!fs.existsSync(configPath)) {
      clack.cancel('No vyft.config.ts found. Run "vyft init" first.');
      process.exit(1);
    }

    const currentCluster = getCurrentCluster();
    if (!currentCluster) {
      clack.cancel(
        'No cluster selected. Run "vyft cluster use" to select a cluster.',
      );
      process.exit(1);
    }

    const clusterInfo = getCurrentClusterInfo();
    if (!clusterInfo) {
      clack.cancel(
        'Cluster information not found. Please reconfigure your cluster.',
      );
      process.exit(1);
    }

    const spinner = clack.spinner();
    spinner.start('Validating configuration...');

    // Simulate configuration validation
    await new Promise((resolve) => setTimeout(resolve, 1000));
    spinner.stop('✅ Configuration valid');

    spinner.start('Building application...');

    // Simulate build process
    await new Promise((resolve) => setTimeout(resolve, 2000));
    spinner.stop('✅ Application built');

    spinner.start('Deploying to cluster...');

    // Simulate deployment
    await new Promise((resolve) => setTimeout(resolve, 3000));
    spinner.stop('✅ Deployed successfully');

    clack.note(
      `Deployment Details:
- Cluster: ${clusterInfo.name} (${clusterInfo.id})
- Region: ${clusterInfo.regions.join(', ')}
- Size: ${clusterInfo.size}
- Status: Running
- URL: https://${clusterInfo.name}.vyft.dev`,
      'Deployment completed!',
    );

    clack.outro('🎉 Your application is live!');
  } catch (error: any) {
    clack.cancel(`Deployment failed: ${error.message}`);
    process.exit(1);
  }
});
