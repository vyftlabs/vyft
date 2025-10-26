import { Command } from 'commander';
import * as clack from '@clack/prompts';
import { Client } from 'ssh2';
import { getCurrentClusterInfo } from '../services/cluster.js';
import { getClusterOutputs } from '../services/provisioning.js';

export const ssh = new Command('ssh')
  .description('SSH into cluster nodes')
  .action(async () => {
    try {
      clack.intro('🔐 SSH into cluster nodes');

      const currentCluster = getCurrentClusterInfo();
      if (!currentCluster) {
        clack.log.error('No current cluster selected');
        clack.log.info('Use "vyft cluster use" to select a cluster first');
        process.exit(1);
      }

      clack.note(
        `Current cluster: ${currentCluster.name} (ID: ${currentCluster.id})`,
      );

      const passphrase = await clack.password({
        message: 'Enter Pulumi passphrase:',
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Passphrase is required';
          }
        },
      });

      if (clack.isCancel(passphrase)) {
        clack.cancel('SSH cancelled');
        process.exit(1);
      }

      const outputsSpinner = clack.spinner();
      outputsSpinner.start('Retrieving cluster outputs...');

      const outputs = await getClusterOutputs(
        currentCluster.id,
        passphrase as string,
      );

      outputsSpinner.stop('Cluster outputs retrieved');

      if (!outputs || !outputs.serverIps || outputs.serverIps.length === 0) {
        clack.log.error('No servers found in cluster');
        clack.log.info('Cluster may not be provisioned yet');
        process.exit(1);
      }

      if (!outputs.sshPrivateKey) {
        clack.log.error('SSH private key not found');
        clack.log.info('Cluster may not be properly provisioned');
        process.exit(1);
      }

      const nodeOptions = outputs.serverIps.map((ip, index) => {
        const region =
          currentCluster.regions[index % currentCluster.regions.length];
        const nodeName = `${currentCluster.name}-node-${index + 1}`;
        return {
          value: ip,
          label: `${nodeName} (${ip}) - ${region}`,
        };
      });

      const selectedIp = await clack.select({
        message: 'Select node to SSH into:',
        options: nodeOptions,
      });

      if (clack.isCancel(selectedIp)) {
        clack.cancel('SSH cancelled');
        process.exit(1);
      }

      clack.log.info(`Connecting to ${selectedIp}...`);

      const conn = new Client();

      conn.on('ready', () => {
        conn.shell(
          {
            term: process.env.TERM || 'xterm',
            cols: process.stdout.columns,
            rows: process.stdout.rows,
          },
          (err: any, stream: any) => {
            if (err) {
              clack.log.error(`Shell error: ${err.message}`);
              conn.end();
              process.exit(1);
            }

            process.stdout.on('resize', () => {
              stream.setWindow(process.stdout.rows, process.stdout.columns);
            });

            process.stdin.setRawMode(true);
            process.stdin.resume();

            stream.pipe(process.stdout);
            process.stdin.pipe(stream);

            stream.on('close', () => {
              process.stdin.setRawMode(false);
              conn.end();
              process.exit(0);
            });
          },
        );
      });

      conn.on('error', (err: any) => {
        clack.log.error(`Connection failed: ${err.message}`);
        clack.log.info('Check that the server is running and accessible');
        process.exit(1);
      });

      conn.connect({
        host: selectedIp as string,
        port: 22,
        username: 'root',
        privateKey: outputs!.sshPrivateKey,
        readyTimeout: 10000,
      });
    } catch (error: any) {
      clack.log.error(`SSH failed: ${error.message}`);
      process.exit(1);
    }
  });
