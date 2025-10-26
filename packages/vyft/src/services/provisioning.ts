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
      console.error(
        'Provisioning failed. Check your configuration and try again.',
      );
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
      username: 'vyft-admin',
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
      console.error('Scaling failed. Check your configuration and try again.');
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
        console.error(
          'Destruction failed. Check your configuration and try again.',
        );
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

    // Create Hetzner Cloud Firewall for cluster security
    const firewall = new hcloud.Firewall('cluster-firewall', {
      name: `${clusterName}-firewall`,
      rules: [
        // Allow SSH from anywhere (temporary - should be restricted to admin IPs)
        {
          direction: 'in',
          sourceIps: ['0.0.0.0/0', '::/0'],
          destinationIps: [],
          protocol: 'tcp',
          port: '22',
          description: 'SSH access',
        },
        // Allow K3s API server (should be restricted to cluster nodes)
        {
          direction: 'in',
          sourceIps: ['0.0.0.0/0', '::/0'],
          destinationIps: [],
          protocol: 'tcp',
          port: '6443',
          description: 'K3s API server',
        },
        // Allow K3s node communication
        {
          direction: 'in',
          sourceIps: ['0.0.0.0/0', '::/0'],
          destinationIps: [],
          protocol: 'tcp',
          port: '10250',
          description: 'K3s kubelet',
        },
        // Allow WireGuard traffic
        {
          direction: 'in',
          sourceIps: ['0.0.0.0/0', '::/0'],
          destinationIps: [],
          protocol: 'udp',
          port: '51820',
          description: 'WireGuard VPN',
        },
        // Allow all outbound traffic
        {
          direction: 'out',
          sourceIps: [],
          destinationIps: ['0.0.0.0/0', '::/0'],
          protocol: 'any',
          port: 'any',
          description: 'All outbound traffic',
        },
      ],
    });

    const servers = [];
    let serverIp: any;

    for (let i = 0; i < nodeCount; i++) {
      const region = regions[i % regions.length];
      if (!region) {
        throw new Error('No regions available for cluster deployment');
      }
      const serverName = `${clusterName}-node-${i + 1}`;

      let userData: any;
      let role: string;

      if (i < 3) {
        if (i === 0) {
          userData = pulumi.interpolate`#cloud-config
package_update: true
package_upgrade: true

# Security hardening
users:
  - name: vyft-admin
    groups: [sudo, docker]
    shell: /bin/bash
    ssh_authorized_keys:
      - ${sshKey.publicKeyOpenssh}
    sudo: ['ALL=(ALL) NOPASSWD:ALL']

# Disable root login
disable_root: true

# Security packages
packages:
  - ufw
  - fail2ban
  - unattended-upgrades
  - apt-transport-https
  - ca-certificates
  - curl
  - gnupg
  - lsb-release
  - auditd
  - aide
  - rsyslog
  - logrotate

# Security configuration
write_files:
  - path: /etc/ssh/sshd_config.d/99-vyft-security.conf
    content: |
      # Security hardening
      PermitRootLogin no
      PasswordAuthentication no
      ChallengeResponseAuthentication no
      UsePAM yes
      X11Forwarding no
      AllowUsers vyft-admin
      MaxAuthTries 3
      ClientAliveInterval 300
      ClientAliveCountMax 2
      LoginGraceTime 60
      StrictModes yes
      MaxSessions 10
      Compression no
      Protocol 2
    permissions: '0644'
    owner: root:root

  - path: /etc/ufw/before.rules
    content: |
      # Allow loopback
      -A INPUT -i lo -j ACCEPT
      -A OUTPUT -o lo -j ACCEPT
      
      # Allow established connections
      -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
      
      # Allow SSH
      -A INPUT -p tcp --dport 22 -j ACCEPT
      
      # Allow K3s API server
      -A INPUT -p tcp --dport 6443 -j ACCEPT
      
      # Allow K3s kubelet
      -A INPUT -p tcp --dport 10250 -j ACCEPT
      
      # Allow WireGuard
      -A INPUT -p udp --dport 51820 -j ACCEPT
      
      # Drop all other traffic
      -A INPUT -j DROP
    permissions: '0644'
    owner: root:root

  - path: /etc/fail2ban/jail.local
    content: |
      [DEFAULT]
      bantime = 3600
      findtime = 600
      maxretry = 3
      
      [sshd]
      enabled = true
      port = ssh
      filter = sshd
      logpath = /var/log/auth.log
      maxretry = 3
    permissions: '0644'
    owner: root:root

  - path: /etc/apt/apt.conf.d/50unattended-upgrades
    content: |
      Unattended-Upgrade::Allowed-Origins {
          "\${distro_id}:\${distro_codename}-security";
          "\${distro_id}ESMApps:\${distro_codename}-apps-security";
          "\${distro_id}ESM:\${distro_codename}-infra-security";
      };
      Unattended-Upgrade::AutoFixInterruptedDpkg "true";
      Unattended-Upgrade::MinimalSteps "true";
      Unattended-Upgrade::Remove-Unused-Dependencies "true";
      Unattended-Upgrade::Automatic-Reboot "true";
      Unattended-Upgrade::Automatic-Reboot-Time "02:00";
    permissions: '0644'
    owner: root:root

  - path: /etc/apt/apt.conf.d/20auto-upgrades
    content: |
      APT::Periodic::Update-Package-Lists "1";
      APT::Periodic::Unattended-Upgrade "1";
    permissions: '0644'
    owner: root:root

  - path: /etc/rsyslog.d/50-vyft.conf
    content: |
      # Vyft centralized logging configuration
      # Send all logs to a central location
      *.* @@logs.vyft.local:514;RSYSLOG_SyslogProtocol23Format
      
      # Local logging for redundancy
      *.info;mail.none;authpriv.none;cron.none    /var/log/syslog
      authpriv.*                                   /var/log/auth.log
      mail.*                                       -/var/log/mail.log
      cron.*                                       /var/log/cron.log
      *.emerg                                      *
      uucp,news.crit                               /var/log/spooler
      local7.*                                     /var/log/boot.log
    permissions: '0644'
    owner: root:root

  - path: /etc/audit/auditd.conf
    content: |
      # Vyft audit logging configuration
      log_file = /var/log/audit/audit.log
      log_format = RAW
      log_group = adm
      priority_boost = 4
      flush = INCREMENTAL_ASYNC
      freq = 50
      num_logs = 5
      disp_qos = lossy
      dispatcher = /sbin/audispd
      name_format = NONE
      max_log_file = 6
      max_log_file_action = ROTATE
      space_left = 75
      space_left_action = SYSLOG
      action_mail_acct = root
      admin_space_left = 50
      admin_space_left_action = SUSPEND
      disk_full_action = SUSPEND
      disk_error_action = SUSPEND
      use_libwrap = yes
      tcp_listen_port = 60
      tcp_listen_queue = 5
      tcp_max_per_addr = 1
      tcp_client_ports = 1024-65535
      tcp_client_max_idle = 0
      enable_krb5 = no
      krb5_principal = auditd
      krb5_key_file = /etc/audit/audit.key
    permissions: '0640'
    owner: root:root

  - path: /etc/logrotate.d/vyft
    content: |
      /var/log/vyft/*.log {
          daily
          missingok
          rotate 30
          compress
          delaycompress
          notifempty
          create 644 root root
          postrotate
              /bin/kill -HUP \`cat /var/run/rsyslogd.pid 2> /dev/null\` 2> /dev/null || true
          endscript
      }
    permissions: '0644'
    owner: root:root

runcmd:
  # Enable UFW firewall
  - ufw --force enable
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow ssh
  - ufw allow 6443/tcp comment 'K3s API server'
  - ufw allow 10250/tcp comment 'K3s kubelet'
  - ufw allow 51820/udp comment 'WireGuard'
  
  # Start security services
  - systemctl enable fail2ban
  - systemctl start fail2ban
  - systemctl enable unattended-upgrades
  - systemctl start unattended-upgrades
  
  # Configure audit logging
  - systemctl enable auditd
  - systemctl start auditd
  
  # Configure centralized logging
  - systemctl enable rsyslog
  - systemctl restart rsyslog
  - mkdir -p /var/log/vyft
  - chown root:root /var/log/vyft
  - chmod 755 /var/log/vyft
  
  # Install K3s with security improvements and version pinning
  - curl -sfL https://get.k3s.io | K3S_VERSION="v1.28.5+k3s1" K3S_TOKEN="${k3sToken}" sh -s - server --flannel-backend=wireguard-native --cluster-init --disable=traefik --disable=servicelb --tls-san=${serverIp}
  - systemctl enable k3s
  
  # Disable root login after setup
  - sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
  - systemctl reload sshd

power_state:
  mode: reboot
  delay: 5
`;
          role = 'server';
        } else {
          userData = pulumi.interpolate`#cloud-config
package_update: true
package_upgrade: true

# Security hardening
users:
  - name: vyft-admin
    groups: [sudo, docker]
    shell: /bin/bash
    ssh_authorized_keys:
      - ${sshKey.publicKeyOpenssh}
    sudo: ['ALL=(ALL) NOPASSWD:ALL']

# Disable root login
disable_root: true

# Security packages
packages:
  - ufw
  - fail2ban
  - unattended-upgrades
  - apt-transport-https
  - ca-certificates
  - curl
  - gnupg
  - lsb-release
  - auditd
  - aide
  - rsyslog
  - logrotate

# Security configuration
write_files:
  - path: /etc/ssh/sshd_config.d/99-vyft-security.conf
    content: |
      # Security hardening
      PermitRootLogin no
      PasswordAuthentication no
      ChallengeResponseAuthentication no
      UsePAM yes
      X11Forwarding no
      AllowUsers vyft-admin
      MaxAuthTries 3
      ClientAliveInterval 300
      ClientAliveCountMax 2
      LoginGraceTime 60
      StrictModes yes
      MaxSessions 10
      Compression no
      Protocol 2
    permissions: '0644'
    owner: root:root

  - path: /etc/ufw/before.rules
    content: |
      # Allow loopback
      -A INPUT -i lo -j ACCEPT
      -A OUTPUT -o lo -j ACCEPT
      
      # Allow established connections
      -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
      
      # Allow SSH
      -A INPUT -p tcp --dport 22 -j ACCEPT
      
      # Allow K3s API server
      -A INPUT -p tcp --dport 6443 -j ACCEPT
      
      # Allow K3s kubelet
      -A INPUT -p tcp --dport 10250 -j ACCEPT
      
      # Allow WireGuard
      -A INPUT -p udp --dport 51820 -j ACCEPT
      
      # Drop all other traffic
      -A INPUT -j DROP
    permissions: '0644'
    owner: root:root

  - path: /etc/fail2ban/jail.local
    content: |
      [DEFAULT]
      bantime = 3600
      findtime = 600
      maxretry = 3
      
      [sshd]
      enabled = true
      port = ssh
      filter = sshd
      logpath = /var/log/auth.log
      maxretry = 3
    permissions: '0644'
    owner: root:root

  - path: /etc/apt/apt.conf.d/50unattended-upgrades
    content: |
      Unattended-Upgrade::Allowed-Origins {
          "\${distro_id}:\${distro_codename}-security";
          "\${distro_id}ESMApps:\${distro_codename}-apps-security";
          "\${distro_id}ESM:\${distro_codename}-infra-security";
      };
      Unattended-Upgrade::AutoFixInterruptedDpkg "true";
      Unattended-Upgrade::MinimalSteps "true";
      Unattended-Upgrade::Remove-Unused-Dependencies "true";
      Unattended-Upgrade::Automatic-Reboot "true";
      Unattended-Upgrade::Automatic-Reboot-Time "02:00";
    permissions: '0644'
    owner: root:root

  - path: /etc/apt/apt.conf.d/20auto-upgrades
    content: |
      APT::Periodic::Update-Package-Lists "1";
      APT::Periodic::Unattended-Upgrade "1";
    permissions: '0644'
    owner: root:root

  - path: /etc/rsyslog.d/50-vyft.conf
    content: |
      # Vyft centralized logging configuration
      # Send all logs to a central location
      *.* @@logs.vyft.local:514;RSYSLOG_SyslogProtocol23Format
      
      # Local logging for redundancy
      *.info;mail.none;authpriv.none;cron.none    /var/log/syslog
      authpriv.*                                   /var/log/auth.log
      mail.*                                       -/var/log/mail.log
      cron.*                                       /var/log/cron.log
      *.emerg                                      *
      uucp,news.crit                               /var/log/spooler
      local7.*                                     /var/log/boot.log
    permissions: '0644'
    owner: root:root

  - path: /etc/audit/auditd.conf
    content: |
      # Vyft audit logging configuration
      log_file = /var/log/audit/audit.log
      log_format = RAW
      log_group = adm
      priority_boost = 4
      flush = INCREMENTAL_ASYNC
      freq = 50
      num_logs = 5
      disp_qos = lossy
      dispatcher = /sbin/audispd
      name_format = NONE
      max_log_file = 6
      max_log_file_action = ROTATE
      space_left = 75
      space_left_action = SYSLOG
      action_mail_acct = root
      admin_space_left = 50
      admin_space_left_action = SUSPEND
      disk_full_action = SUSPEND
      disk_error_action = SUSPEND
      use_libwrap = yes
      tcp_listen_port = 60
      tcp_listen_queue = 5
      tcp_max_per_addr = 1
      tcp_client_ports = 1024-65535
      tcp_client_max_idle = 0
      enable_krb5 = no
      krb5_principal = auditd
      krb5_key_file = /etc/audit/audit.key
    permissions: '0640'
    owner: root:root

  - path: /etc/logrotate.d/vyft
    content: |
      /var/log/vyft/*.log {
          daily
          missingok
          rotate 30
          compress
          delaycompress
          notifempty
          create 644 root root
          postrotate
              /bin/kill -HUP \`cat /var/run/rsyslogd.pid 2> /dev/null\` 2> /dev/null || true
          endscript
      }
    permissions: '0644'
    owner: root:root

runcmd:
  # Enable UFW firewall
  - ufw --force enable
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow ssh
  - ufw allow 6443/tcp comment 'K3s API server'
  - ufw allow 10250/tcp comment 'K3s kubelet'
  - ufw allow 51820/udp comment 'WireGuard'
  
  # Start security services
  - systemctl enable fail2ban
  - systemctl start fail2ban
  - systemctl enable unattended-upgrades
  - systemctl start unattended-upgrades
  
  # Configure audit logging
  - systemctl enable auditd
  - systemctl start auditd
  
  # Configure centralized logging
  - systemctl enable rsyslog
  - systemctl restart rsyslog
  - mkdir -p /var/log/vyft
  - chown root:root /var/log/vyft
  - chmod 755 /var/log/vyft
  
  # Install K3s with security improvements and version pinning
  - curl -sfL https://get.k3s.io | K3S_VERSION="v1.28.5+k3s1" K3S_TOKEN="${k3sToken}" K3S_URL="https://${serverIp}:6443" sh -s - server --flannel-backend=wireguard-native --disable=traefik --disable=servicelb --tls-san=${serverIp}
  - systemctl enable k3s
  
  # Disable root login after setup
  - sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
  - systemctl reload sshd

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

# Security hardening
users:
  - name: vyft-admin
    groups: [sudo, docker]
    shell: /bin/bash
    ssh_authorized_keys:
      - ${sshKey.publicKeyOpenssh}
    sudo: ['ALL=(ALL) NOPASSWD:ALL']

# Disable root login
disable_root: true

# Security packages
packages:
  - ufw
  - fail2ban
  - unattended-upgrades
  - apt-transport-https
  - ca-certificates
  - curl
  - gnupg
  - lsb-release
  - auditd
  - aide
  - rsyslog
  - logrotate

# Security configuration
write_files:
  - path: /etc/ssh/sshd_config.d/99-vyft-security.conf
    content: |
      # Security hardening
      PermitRootLogin no
      PasswordAuthentication no
      ChallengeResponseAuthentication no
      UsePAM yes
      X11Forwarding no
      AllowUsers vyft-admin
      MaxAuthTries 3
      ClientAliveInterval 300
      ClientAliveCountMax 2
      LoginGraceTime 60
      StrictModes yes
      MaxSessions 10
      Compression no
      Protocol 2
    permissions: '0644'
    owner: root:root

  - path: /etc/ufw/before.rules
    content: |
      # Allow loopback
      -A INPUT -i lo -j ACCEPT
      -A OUTPUT -o lo -j ACCEPT
      
      # Allow established connections
      -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
      
      # Allow SSH
      -A INPUT -p tcp --dport 22 -j ACCEPT
      
      # Allow K3s API server
      -A INPUT -p tcp --dport 6443 -j ACCEPT
      
      # Allow K3s kubelet
      -A INPUT -p tcp --dport 10250 -j ACCEPT
      
      # Allow WireGuard
      -A INPUT -p udp --dport 51820 -j ACCEPT
      
      # Drop all other traffic
      -A INPUT -j DROP
    permissions: '0644'
    owner: root:root

  - path: /etc/fail2ban/jail.local
    content: |
      [DEFAULT]
      bantime = 3600
      findtime = 600
      maxretry = 3
      
      [sshd]
      enabled = true
      port = ssh
      filter = sshd
      logpath = /var/log/auth.log
      maxretry = 3
    permissions: '0644'
    owner: root:root

  - path: /etc/apt/apt.conf.d/50unattended-upgrades
    content: |
      Unattended-Upgrade::Allowed-Origins {
          "\${distro_id}:\${distro_codename}-security";
          "\${distro_id}ESMApps:\${distro_codename}-apps-security";
          "\${distro_id}ESM:\${distro_codename}-infra-security";
      };
      Unattended-Upgrade::AutoFixInterruptedDpkg "true";
      Unattended-Upgrade::MinimalSteps "true";
      Unattended-Upgrade::Remove-Unused-Dependencies "true";
      Unattended-Upgrade::Automatic-Reboot "true";
      Unattended-Upgrade::Automatic-Reboot-Time "02:00";
    permissions: '0644'
    owner: root:root

  - path: /etc/apt/apt.conf.d/20auto-upgrades
    content: |
      APT::Periodic::Update-Package-Lists "1";
      APT::Periodic::Unattended-Upgrade "1";
    permissions: '0644'
    owner: root:root

  - path: /etc/rsyslog.d/50-vyft.conf
    content: |
      # Vyft centralized logging configuration
      # Send all logs to a central location
      *.* @@logs.vyft.local:514;RSYSLOG_SyslogProtocol23Format
      
      # Local logging for redundancy
      *.info;mail.none;authpriv.none;cron.none    /var/log/syslog
      authpriv.*                                   /var/log/auth.log
      mail.*                                       -/var/log/mail.log
      cron.*                                       /var/log/cron.log
      *.emerg                                      *
      uucp,news.crit                               /var/log/spooler
      local7.*                                     /var/log/boot.log
    permissions: '0644'
    owner: root:root

  - path: /etc/audit/auditd.conf
    content: |
      # Vyft audit logging configuration
      log_file = /var/log/audit/audit.log
      log_format = RAW
      log_group = adm
      priority_boost = 4
      flush = INCREMENTAL_ASYNC
      freq = 50
      num_logs = 5
      disp_qos = lossy
      dispatcher = /sbin/audispd
      name_format = NONE
      max_log_file = 6
      max_log_file_action = ROTATE
      space_left = 75
      space_left_action = SYSLOG
      action_mail_acct = root
      admin_space_left = 50
      admin_space_left_action = SUSPEND
      disk_full_action = SUSPEND
      disk_error_action = SUSPEND
      use_libwrap = yes
      tcp_listen_port = 60
      tcp_listen_queue = 5
      tcp_max_per_addr = 1
      tcp_client_ports = 1024-65535
      tcp_client_max_idle = 0
      enable_krb5 = no
      krb5_principal = auditd
      krb5_key_file = /etc/audit/audit.key
    permissions: '0640'
    owner: root:root

  - path: /etc/logrotate.d/vyft
    content: |
      /var/log/vyft/*.log {
          daily
          missingok
          rotate 30
          compress
          delaycompress
          notifempty
          create 644 root root
          postrotate
              /bin/kill -HUP \`cat /var/run/rsyslogd.pid 2> /dev/null\` 2> /dev/null || true
          endscript
      }
    permissions: '0644'
    owner: root:root

runcmd:
  # Enable UFW firewall
  - ufw --force enable
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow ssh
  - ufw allow 6443/tcp comment 'K3s API server'
  - ufw allow 10250/tcp comment 'K3s kubelet'
  - ufw allow 51820/udp comment 'WireGuard'
  
  # Start security services
  - systemctl enable fail2ban
  - systemctl start fail2ban
  - systemctl enable unattended-upgrades
  - systemctl start unattended-upgrades
  
  # Configure audit logging
  - systemctl enable auditd
  - systemctl start auditd
  
  # Configure centralized logging
  - systemctl enable rsyslog
  - systemctl restart rsyslog
  - mkdir -p /var/log/vyft
  - chown root:root /var/log/vyft
  - chmod 755 /var/log/vyft
  
  # Install K3s with security improvements and version pinning
  - curl -sfL https://get.k3s.io | K3S_VERSION="v1.28.5+k3s1" K3S_TOKEN="${k3sToken}" K3S_URL="https://${serverIp}:6443" sh -s - agent
  - systemctl enable k3s-agent
  
  # Disable root login after setup
  - sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
  - systemctl reload sshd

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

      // Apply firewall to server
      new hcloud.FirewallAttachment(`firewall-attachment-${i + 1}`, {
        firewallId: firewall.id.apply((id) => parseInt(id)),
        serverIds: [server.id.apply((id) => parseInt(id))],
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
            user: 'vyft-admin',
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
