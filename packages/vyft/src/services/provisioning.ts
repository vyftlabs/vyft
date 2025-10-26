import { LocalWorkspace, Stack } from '@pulumi/pulumi/automation/index.js';
import * as clack from '@clack/prompts';
import { randomBytes } from 'crypto';
import { getProviderToken } from './provider.js';

interface ClusterOutputs {
  serverIps: string[];
  sshPrivateKey: string;
  k3sToken: string;
  serverIp: string;
}

export async function provisionCluster(
  clusterId: string,
  clusterName: string,
  regions: string[],
  size: string,
  providerId: string,
): Promise<ClusterOutputs> {
  const nodeCount = size === 'ha' ? 3 : 1;

  const passphrase = await clack.password({
    message: 'Enter Pulumi passphrase for encryption:',
    validate: (value) => {
      if (!value || value.trim().length === 0) {
        return 'Passphrase is required';
      }
      if (value.length < 8) {
        return 'Passphrase must be at least 8 characters';
      }
    },
  });

  if (clack.isCancel(passphrase)) {
    throw new Error('Passphrase is required for Pulumi encryption');
  }

  const providerToken = await getProviderToken(
    providerId,
    passphrase as string,
  );
  if (!providerToken) {
    throw new Error(`Provider token not found for provider ${providerId}`);
  }

  const program = generateInlineProgram(clusterName, regions, nodeCount);

  const workspace = await LocalWorkspace.create({
    program: program,
    projectSettings: {
      name: `vyft-cluster-${clusterId}`,
      runtime: 'nodejs',
      description: `Vyft cluster infrastructure for ${clusterName}`,
    },
    envVars: {
      PULUMI_CONFIG_PASSPHRASE: passphrase,
    },
  });

  const stackName = `organization/vyft-cluster-${clusterId}/vyft`;

  try {
    await Stack.create(stackName, workspace);
  } catch (error) {
    try {
      await Stack.select(stackName, workspace);
    } catch (selectError) {
      throw new Error(`Failed to create or select stack: ${selectError}`);
    }
  }

  await workspace.setConfig(stackName, 'hcloud:token', {
    value: providerToken,
    secret: true,
  });

  const stack = await Stack.select(stackName, workspace);
  const upResult = await stack.up({
    continueOnError: false,
    onError(err) {
      console.error(err);
      process.exit(1);
    },
  });

  const outputs = upResult.outputs;
  return {
    serverIps: outputs.serverIps?.value || [],
    sshPrivateKey: outputs.sshPrivateKey?.value || '',
    k3sToken: outputs.k3sToken?.value || '',
    serverIp: outputs.serverIp?.value || '',
  };
}

export async function getClusterOutputs(
  clusterId: string,
  passphrase: string,
): Promise<ClusterOutputs | undefined> {
  try {
    const program = generateInlineProgram('dummy', ['nbg1'], 1);
    const workspace = await LocalWorkspace.create({
      program: program,
      projectSettings: {
        name: `vyft-cluster-${clusterId}`,
        runtime: 'nodejs',
        description: `Vyft cluster infrastructure`,
      },
      envVars: {
        PULUMI_CONFIG_PASSPHRASE: passphrase,
      },
    });

    const stackName = `organization/vyft-cluster-${clusterId}/vyft`;
    const stack = await Stack.select(stackName, workspace);
    const outputs = await stack.outputs();

    return {
      serverIps: outputs.serverIps?.value || [],
      sshPrivateKey: outputs.sshPrivateKey?.value || '',
      k3sToken: outputs.k3sToken?.value || '',
      serverIp: outputs.serverIp?.value || '',
    };
  } catch (error) {
    return undefined;
  }
}

async function getKubeconfigFromNode(
  serverIp: string,
  sshPrivateKey: string,
): Promise<string> {
  const { Client } = await import('ssh2');

  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn.on('ready', () => {
      conn.exec('sudo cat /etc/rancher/k3s/k3s.yaml', (err, stream) => {
        if (err) {
          conn.end();
          reject(err);
          return;
        }

        let kubeconfig = '';
        stream.on('data', (data: any) => {
          kubeconfig += data.toString();
        });

        stream.on('close', (code: any) => {
          conn.end();
          if (code === 0) {
            // Replace localhost with actual server IP
            const updatedKubeconfig = kubeconfig.replace(
              'server: https://127.0.0.1:6443',
              `server: https://${serverIp}:6443`,
            );
            resolve(updatedKubeconfig);
          } else {
            reject(new Error(`Failed to get kubeconfig: exit code ${code}`));
          }
        });
      });
    });

    conn.on('error', (err) => {
      reject(err);
    });

    conn.connect({
      host: serverIp,
      port: 22,
      username: 'root',
      privateKey: sshPrivateKey,
      readyTimeout: 10000,
    });
  });
}

async function drainNodes(
  clusterId: string,
  nodeNames: string[],
  passphrase: string,
  kubeconfig: string,
): Promise<void> {
  const drainProgram = async () => {
    const pulumi = await import('@pulumi/pulumi');
    const k8s = await import('@pulumi/kubernetes');

    const provider = new k8s.Provider('k8s-provider', {
      kubeconfig: kubeconfig,
    });

    for (const nodeName of nodeNames) {
      new k8s.core.v1.Node(
        `${nodeName}-drain`,
        {
          metadata: {
            name: nodeName,
          },
          spec: {
            unschedulable: true,
          },
        },
        { provider },
      );
    }
  };

  const workspace = await LocalWorkspace.create({
    program: drainProgram,
    projectSettings: {
      name: `vyft-drain-${clusterId}`,
      runtime: 'nodejs',
      description: `Node draining for cluster ${clusterId}`,
    },
    envVars: {
      PULUMI_CONFIG_PASSPHRASE: passphrase,
    },
  });

  const stackName = `organization/vyft-drain-${clusterId}/drain`;

  try {
    await Stack.create(stackName, workspace);
  } catch (error) {
    await Stack.select(stackName, workspace);
  }

  const stack = await Stack.select(stackName, workspace);
  await stack.up({
    continueOnError: false,
  });

  await stack.destroy({
    continueOnError: false,
  });
}

export async function scaleCluster(
  clusterId: string,
  clusterName: string,
  regions: string[],
  newNodeCount: number,
  currentNodeCount: number,
  providerId: string,
  k3sToken: string,
  passphrase: string,
): Promise<ClusterOutputs> {
  const providerToken = await getProviderToken(providerId, passphrase);
  if (!providerToken) {
    throw new Error(`Provider token not found for provider ${providerId}`);
  }

  const isScaleDown = newNodeCount < currentNodeCount;

  if (isScaleDown) {
    const currentOutputs = await getClusterOutputs(clusterId, passphrase);
    if (currentOutputs) {
      const nodesToRemove = [];
      for (let i = newNodeCount; i < currentNodeCount; i++) {
        nodesToRemove.push(`${clusterName}-node-${i + 1}`);
      }

      if (nodesToRemove.length > 0) {
        const kubeconfig = await getKubeconfigFromNode(
          currentOutputs.serverIp,
          currentOutputs.sshPrivateKey,
        );

        await drainNodes(clusterId, nodesToRemove, passphrase, kubeconfig);
      }
    }
  }

  const program = generateInlineProgramWithToken(
    clusterName,
    regions,
    newNodeCount,
    k3sToken,
  );

  const workspace = await LocalWorkspace.create({
    program: program,
    projectSettings: {
      name: `vyft-cluster-${clusterId}`,
      runtime: 'nodejs',
      description: `Vyft cluster infrastructure for ${clusterName}`,
    },
    envVars: {
      PULUMI_CONFIG_PASSPHRASE: passphrase,
    },
  });

  const stackName = `organization/vyft-cluster-${clusterId}/vyft`;
  const stack = await Stack.select(stackName, workspace);

  await workspace.setConfig(stackName, 'hcloud:token', {
    value: providerToken,
    secret: true,
  });

  const upResult = await stack.up({
    continueOnError: false,
    onError(err) {
      console.error(err);
      process.exit(1);
    },
  });

  const outputs = upResult.outputs;
  return {
    serverIps: outputs.serverIps?.value || [],
    sshPrivateKey: outputs.sshPrivateKey?.value || '',
    k3sToken: k3sToken,
    serverIp: outputs.serverIp?.value || '',
  };
}

export async function destroyClusterInfrastructure(
  clusterId: string,
  passphrase: string,
): Promise<void> {
  try {
    const program = generateInlineProgram('dummy', ['nbg1'], 1);
    const workspace = await LocalWorkspace.create({
      program: program,
      projectSettings: {
        name: `vyft-cluster-${clusterId}`,
        runtime: 'nodejs',
        description: `Vyft cluster infrastructure`,
      },
      envVars: {
        PULUMI_CONFIG_PASSPHRASE: passphrase,
      },
    });

    const stackName = `organization/vyft-cluster-${clusterId}/vyft`;
    const stack = await Stack.select(stackName, workspace);
    await stack.destroy({
      continueOnError: false,
      onError(err) {
        console.error(err);
        process.exit(1);
      },
    });
  } catch (error) {
    console.warn(
      `Failed to destroy infrastructure for cluster ${clusterId}:`,
      error,
    );
  }
}

function generateInlineProgram(
  clusterName: string,
  regions: string[],
  nodeCount: number,
): any {
  return generateInlineProgramWithToken(clusterName, regions, nodeCount);
}

function generateInlineProgramWithToken(
  clusterName: string,
  regions: string[],
  nodeCount: number,
  existingToken?: string,
): any {
  return async () => {
    const pulumi = await import('@pulumi/pulumi');
    const hcloud = await import('@pulumi/hcloud');
    const tls = await import('@pulumi/tls');

    const config = new pulumi.Config();

    const k3sToken = existingToken || randomBytes(32).toString('hex');

    const sshKey = new tls.PrivateKey('ssh-key', {
      algorithm: 'RSA',
      rsaBits: 4096,
    });

    const hcloudSshKey = new hcloud.SshKey('cluster-ssh-key', {
      name: `${clusterName}-ssh-key`,
      publicKey: sshKey.publicKeyOpenssh,
    });

    const servers = [];
    let serverIp: any;

    for (let i = 0; i < nodeCount; i++) {
      const region = regions[i % regions.length];
      const serverName = `${clusterName}-node-${i + 1}`;

      let userData: any;
      let role: string;

      if (i < 3) {
        if (i === 0) {
          userData = pulumi.interpolate`#cloud-config
package_update: true
package_upgrade: true

runcmd:
  - curl -sfL https://get.k3s.io | K3S_TOKEN="${k3sToken}" sh -s - server --flannel-backend=wireguard-native --cluster-init
  - systemctl enable k3s

power_state:
  mode: reboot
  delay: 5
`;
          role = 'server';
        } else {
          userData = pulumi.interpolate`#cloud-config
package_update: true
package_upgrade: true

runcmd:
  - curl -sfL https://get.k3s.io | K3S_TOKEN="${k3sToken}" K3S_URL="https://${serverIp}:6443" sh -s - server --flannel-backend=wireguard-native
  - systemctl enable k3s

power_state:
  mode: reboot
  delay: 5
`;
          role = 'server';
        }
      } else {
        userData = pulumi.interpolate`#cloud-config
package_update: true
package_upgrade: true

runcmd:
  - curl -sfL https://get.k3s.io | K3S_TOKEN="${k3sToken}" K3S_URL="https://${serverIp}:6443" sh -s - agent
  - systemctl enable k3s-agent

power_state:
  mode: reboot
  delay: 5
`;
        role = 'agent';
      }

      const server = new hcloud.Server(`server-${i + 1}`, {
        name: serverName,
        image: 'ubuntu-22.04',
        serverType: 'cx33',
        location: region,
        sshKeys: [hcloudSshKey.name],
        userData: userData,
        labels: {
          cluster: clusterName,
          node: `${i + 1}`,
          region: region,
          role: role,
        },
      });

      // Wait for cloud-init to complete using Pulumi remote command
      const cloudInitWait = new (
        await import('@pulumi/command')
      ).remote.Command(
        `cloud-init-wait-${i + 1}`,
        {
          connection: {
            host: server.ipv4Address,
            port: 22,
            user: 'root',
            privateKey: sshKey.privateKeyOpenssh,
          },
          create: 'sudo cloud-init status --wait',
        },
        {
          dependsOn: [server],
        },
      );

      if (i === 0) {
        serverIp = server.ipv4Address;
      }

      servers.push(server);
    }

    return {
      serverIps: servers.map((server) => server.ipv4Address),
      sshPrivateKey: sshKey.privateKeyOpenssh,
      k3sToken: k3sToken,
      serverIp: serverIp!,
    };
  };
}
