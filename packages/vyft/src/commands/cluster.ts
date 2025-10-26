import { Command } from 'commander';
import * as clack from '@clack/prompts';
import {
  createCluster,
  listClusters,
  destroyCluster,
  setCurrentCluster,
  getCurrentCluster,
  getCurrentClusterInfo,
  storeClusterK3sToken,
  getClusterK3sToken,
  updateClusterNodeCount,
} from '../services/cluster.js';
import { listProviders } from '../services/provider.js';
import { addProviderAction } from './provider.js';
import { provisionCluster, scaleCluster } from '../services/provisioning.js';

export const cluster = new Command('cluster').description('Manage clusters');

cluster
  .command('add')
  .description('Add a new cluster')
  .action(async () => {
    try {
      clack.intro('🐦 Adding cluster');

      const name = await clack.text({
        message: 'Enter a name for this cluster:',
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Cluster name is required';
          }
        },
      });

      if (clack.isCancel(name)) {
        clack.cancel('Cluster addition cancelled');
        process.exit(1);
      }

      let providers = await listProviders();
      let provider: string;

      if (providers.length === 0) {
        clack.note("No providers configured. Let's create one first.");

        try {
          await addProviderAction();
          providers = await listProviders();
          if (providers.length === 0) {
            clack.cancel('Provider creation was cancelled');
            process.exit(1);
          }
        } catch (error) {
          clack.cancel('Provider creation failed');
          process.exit(1);
        }
      }

      const selectedProvider = await clack.select({
        message: 'Which provider would you like to use?',
        options: providers.map((p) => ({
          value: p.id,
          label: `${p.name} (${p.type})`,
        })),
      });

      if (clack.isCancel(selectedProvider)) {
        clack.cancel('Cluster addition cancelled');
        process.exit(1);
      }

      provider = selectedProvider as string;

      clack.note(
        'For best performance, keep regions geographically close to each other',
      );

      const regions = await clack.multiselect({
        message: 'Select regions for cluster nodes (multi-zone for HA):',
        options: [
          { value: 'nbg1', label: 'Nuremberg (nbg1)', hint: 'Germany' },
          { value: 'fsn1', label: 'Falkenstein (fsn1)', hint: 'Germany' },
          { value: 'hel1', label: 'Helsinki (hel1)', hint: 'Finland' },
          { value: 'ash', label: 'Ashburn (ash)', hint: 'USA East' },
          { value: 'hil', label: 'Hillsboro (hil)', hint: 'USA West' },
        ],
        required: true,
      });

      if (clack.isCancel(regions)) {
        clack.cancel('Cluster addition cancelled');
        process.exit(1);
      }

      clack.note(
        'High Availability: 3 nodes for redundancy and fault tolerance\nYou can expand the cluster later as needed',
        'Cluster Configuration',
      );

      const highAvailability = await clack.confirm({
        message: 'Enable High Availability?',
        initialValue: true,
      });

      if (clack.isCancel(highAvailability)) {
        clack.cancel('Cluster addition cancelled');
        process.exit(1);
      }

      const size = highAvailability ? 'ha' : 'single';

      const passphrase = await clack.password({
        message: 'Enter Pulumi passphrase for encryption:',
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Passphrase is required';
          }
        },
      });

      if (clack.isCancel(passphrase)) {
        clack.cancel('Cluster addition cancelled');
        process.exit(1);
      }

      const createSpinner = clack.spinner();
      createSpinner.start('Creating cluster...');

      const clusterId = await createCluster(
        name as string,
        'kubernetes',
        regions as string[],
        size as string,
        provider as string,
        passphrase as string,
      );

      createSpinner.stop('Cluster metadata created');

      const provisionSpinner = clack.spinner();
      provisionSpinner.start('Provisioning servers...');

      const outputs = await provisionCluster(
        clusterId,
        name as string,
        regions as string[],
        size as string,
        provider as string,
      );

      provisionSpinner.stop('Servers provisioned successfully');

      const storeSpinner = clack.spinner();
      storeSpinner.start('Storing k3s token...');

      await storeClusterK3sToken(
        clusterId,
        outputs.k3sToken,
        passphrase as string,
      );

      storeSpinner.stop('K3s token stored securely');

      clack.log.info(`Server IPs: ${outputs.serverIps.join(', ')}`);
      clack.log.info(`SSH Key saved securely in Pulumi state`);
      clack.log.info(`K3s cluster token stored securely`);

      setCurrentCluster(clusterId);
      clack.log.info(`Set as current cluster`);

      clack.outro(
        `🎉 Cluster '${name}' created successfully! (ID: ${clusterId})`,
      );
    } catch (error: any) {
      clack.log.error(`Failed to add cluster: ${error.message}`);
      process.exit(1);
    }
  });

cluster
  .command('use')
  .description('Set the current active cluster')
  .action(async () => {
    try {
      clack.intro('🎯 Setting current cluster');

      const clusters = await listClusters();
      if (clusters.length === 0) {
        clack.log.error('No clusters configured');
        process.exit(1);
      }

      const currentClusterId = getCurrentCluster();
      const currentCluster = currentClusterId
        ? clusters.find((c) => c.id === currentClusterId)
        : undefined;

      if (currentCluster) {
        clack.note(
          `Currently using: ${currentCluster.name} (${currentCluster.id})`,
        );
      } else {
        clack.note('No cluster currently selected');
      }

      const selectedCluster = await clack.select({
        message: 'Select cluster to use:',
        options: clusters.map((cluster) => ({
          value: cluster.id,
          label:
            cluster.id === currentClusterId
              ? `* ${cluster.name} (${cluster.type}) - [CURRENT]`
              : `${cluster.name} (${cluster.type})`,
        })),
      });

      if (clack.isCancel(selectedCluster)) {
        clack.cancel('Cluster selection cancelled');
        process.exit(1);
      }

      const cluster = clusters.find((c) => c.id === selectedCluster);
      setCurrentCluster(selectedCluster as string);

      clack.outro(
        `🎉 Now using cluster '${cluster?.name}' (ID: ${selectedCluster})`,
      );
    } catch (error: any) {
      clack.log.error(`Failed to set current cluster: ${error.message}`);
      process.exit(1);
    }
  });

cluster
  .command('current')
  .description('Show the current active cluster')
  .action(async () => {
    try {
      const currentCluster = getCurrentClusterInfo();

      if (currentCluster) {
        console.log(
          `Current cluster: ${currentCluster.name} (ID: ${currentCluster.id})`,
        );
        console.log(`Type: ${currentCluster.type}`);
        console.log(`Regions: ${currentCluster.regions.join(', ')}`);
        console.log(`Size: ${currentCluster.size}`);
        console.log(`Created: ${currentCluster.createdAt}`);
      } else {
        console.log('No cluster currently selected');
        console.log('Use "vyft cluster use" to select a cluster');
      }
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

cluster
  .command('list')
  .description('List configured clusters')
  .action(async () => {
    try {
      const clusters = await listClusters();
      const currentClusterId = getCurrentCluster();

      if (clusters.length === 0) {
        console.log('No clusters configured');
        return;
      }

      console.log('Configured clusters:');
      clusters.forEach((cluster, index) => {
        const isCurrent = cluster.id === currentClusterId;
        const indicator = isCurrent ? '* ' : '  ';
        const currentLabel = isCurrent ? ' [CURRENT]' : '';

        console.log(
          `${indicator}${index + 1}. ${cluster.name} (${cluster.type})${currentLabel}`,
        );
        console.log(`     ID: ${cluster.id}`);
        console.log(`     Regions: ${cluster.regions.join(', ')}`);
        console.log(`     Size: ${cluster.size}`);
        console.log(`     Created: ${cluster.createdAt}`);
        console.log('');
      });

      if (!currentClusterId) {
        console.log('No cluster currently selected');
        console.log('Use "vyft cluster use" to select a cluster');
      }
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

cluster
  .command('remove')
  .description('Remove a cluster')
  .action(async () => {
    try {
      const clusters = await listClusters();

      if (clusters.length === 0) {
        console.log('No clusters configured');
        return;
      }

      const clusterToRemove = await clack.select({
        message: 'Which cluster would you like to remove?',
        options: clusters.map((cluster) => ({
          value: cluster.id,
          label: `${cluster.name} (${cluster.type})`,
        })),
      });

      if (clack.isCancel(clusterToRemove)) {
        clack.cancel('Cluster removal cancelled');
        process.exit(1);
      }

      const cluster = clusters.find((c) => c.id === clusterToRemove);
      const confirmed = await clack.confirm({
        message: `Are you sure you want to remove cluster '${cluster?.name}'?`,
        initialValue: false,
      });

      if (clack.isCancel(confirmed) || !confirmed) {
        clack.cancel('Cluster removal cancelled');
        process.exit(1);
      }

      const passphrase = await clack.password({
        message: 'Enter Pulumi passphrase to destroy infrastructure:',
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Passphrase is required';
          }
        },
      });

      if (clack.isCancel(passphrase)) {
        clack.cancel('Cluster removal cancelled');
        process.exit(1);
      }

      const destroySpinner = clack.spinner();
      destroySpinner.start('Removing cluster...');

      await destroyCluster(clusterToRemove as string, passphrase as string);

      destroySpinner.stop('Cluster removed successfully');
    } catch (error: any) {
      clack.log.error(`Failed to remove cluster: ${error.message}`);
      process.exit(1);
    }
  });

cluster
  .command('scale')
  .description('Scale cluster up or down')
  .action(async () => {
    try {
      clack.intro('📈 Scaling cluster');

      const currentCluster = getCurrentClusterInfo();
      if (!currentCluster) {
        clack.log.error('No current cluster selected');
        process.exit(1);
      }

      clack.note(
        `Current cluster: ${currentCluster.name}\nCurrent nodes: ${currentCluster.nodeCount}`,
      );

      const newNodeCount = await clack.text({
        message: 'Enter new node count:',
        placeholder: currentCluster.nodeCount.toString(),
        validate: (value) => {
          const num = parseInt(value, 10);
          if (isNaN(num) || num < 1) {
            return 'Node count must be at least 1';
          }
          if (num === currentCluster.nodeCount) {
            return 'Node count is the same';
          }
        },
      });

      if (clack.isCancel(newNodeCount)) {
        clack.cancel('Scaling cancelled');
        process.exit(1);
      }

      const targetCount = parseInt(newNodeCount as string, 10);
      const isScaleUp = targetCount > currentCluster.nodeCount;

      const confirm = await clack.confirm({
        message: `${isScaleUp ? 'Scale up' : 'Scale down'} from ${currentCluster.nodeCount} to ${targetCount} nodes?`,
      });

      if (!confirm || clack.isCancel(confirm)) {
        clack.cancel('Scaling cancelled');
        process.exit(1);
      }

      const passphrase = await clack.password({
        message: 'Enter Pulumi passphrase:',
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Passphrase is required';
          }
        },
      });

      if (clack.isCancel(passphrase)) {
        clack.cancel('Scaling cancelled');
        process.exit(1);
      }

      if (!isScaleUp) {
        clack.note(
          'Scaling down will remove nodes. Ensure workloads are drained first.',
          'Warning',
        );

        const finalConfirm = await clack.confirm({
          message: 'Continue with scale down?',
        });

        if (!finalConfirm || clack.isCancel(finalConfirm)) {
          clack.cancel('Scaling cancelled');
          process.exit(1);
        }
      }

      const spinner = clack.spinner();
      spinner.start(`Scaling cluster to ${targetCount} nodes...`);

      const k3sToken = await getClusterK3sToken(
        currentCluster.id,
        passphrase as string,
      );

      if (!k3sToken) {
        spinner.stop('Failed to retrieve k3s token');
        process.exit(1);
      }

      const outputs = await scaleCluster(
        currentCluster.id,
        currentCluster.name,
        currentCluster.regions,
        targetCount,
        currentCluster.nodeCount,
        currentCluster.providerId,
        k3sToken,
        passphrase as string,
      );

      updateClusterNodeCount(currentCluster.id, targetCount);

      spinner.stop(`Cluster scaled to ${targetCount} nodes`);

      clack.log.info(`Server IPs: ${outputs.serverIps.join(', ')}`);
      clack.outro(`🎉 Cluster scaled successfully!`);
    } catch (error: any) {
      clack.log.error(`Failed to scale cluster: ${error.message}`);
      process.exit(1);
    }
  });
