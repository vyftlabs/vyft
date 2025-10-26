import { Command } from 'commander';
import * as clack from '@clack/prompts';
import {
  createProvider,
  listProviders,
  destroyProvider,
} from '../services/provider.js';
import { validateHetznerToken } from '../validators.js';
import { printTable } from '../utils/table.js';

export async function addProviderAction(): Promise<void> {
  try {
    const providerType = await clack.select({
      message: 'Which provider would you like to add?',
      options: [{ value: 'hetzner', label: 'Hetzner Cloud' }],
      initialValue: 'hetzner',
    });

    if (clack.isCancel(providerType)) {
      clack.cancel('Provider addition cancelled');
      process.exit(1);
    }

    const name = await clack.text({
      message: 'Enter a name for this provider:',
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Provider name is required';
        }
      },
    });

    if (clack.isCancel(name)) {
      clack.cancel('Provider addition cancelled');
      process.exit(1);
    }

    clack.note(
      'Get your API token at:\nhttps://console.hetzner.cloud/projects → Security → API tokens',
      'Hetzner Cloud API Token Required',
    );

    const token = await clack.password({
      message: 'Enter your Hetzner API token:',
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return 'API token is required';
        }
      },
    });

    if (clack.isCancel(token)) {
      clack.cancel('Provider addition cancelled');
      process.exit(1);
    }

    const validationSpinner = clack.spinner();
    validationSpinner.start('Validating API token...');

    const isValid = await validateHetznerToken(token as string);

    if (!isValid) {
      validationSpinner.stop('❌ Invalid API token');
      clack.cancel('Please check your API token and try again');
      process.exit(1);
    }

    validationSpinner.stop('API token validated');

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
      clack.cancel('Provider addition cancelled');
      process.exit(1);
    }

    const createSpinner = clack.spinner();
    createSpinner.start('Creating provider...');

    const providerId = await createProvider(
      name as string,
      providerType as 'hetzner',
      token as string,
      passphrase as string,
    );

    createSpinner.stop('Provider created successfully');
  } catch (error: any) {
    clack.log.error(`Failed to add provider: ${error.message}`);
    process.exit(1);
  }
}

export const provider = new Command('provider').description(
  'Manage cloud providers',
);

provider
  .command('add')
  .description('Add a new cloud provider')
  .action(addProviderAction);

provider
  .command('list')
  .description('List configured providers')
  .action(async () => {
    try {
      const providers = await listProviders();

      if (providers.length === 0) {
        console.log('No providers configured');
        return;
      }

      printTable(providers, ['name', 'type']);
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

provider
  .command('remove')
  .description('Remove a cloud provider')
  .action(async () => {
    try {
      const providers = await listProviders();

      if (providers.length === 0) {
        console.log('No providers configured');
        return;
      }

      const providerToRemove = await clack.select({
        message: 'Which provider would you like to remove?',
        options: providers.map((provider) => ({
          value: provider.id,
          label: `${provider.name} (${provider.type})`,
        })),
      });

      if (clack.isCancel(providerToRemove)) {
        clack.cancel('Provider removal cancelled');
        process.exit(1);
      }

      const provider = providers.find((p) => p.id === providerToRemove);
      const confirmed = await clack.confirm({
        message: `Are you sure you want to remove provider '${provider?.name}'?`,
        initialValue: false,
      });

      if (clack.isCancel(confirmed) || !confirmed) {
        clack.cancel('Provider removal cancelled');
        process.exit(1);
      }

      const passphrase = await clack.password({
        message: 'Enter Pulumi passphrase to remove provider:',
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Passphrase is required';
          }
        },
      });

      if (clack.isCancel(passphrase)) {
        clack.cancel('Provider removal cancelled');
        process.exit(1);
      }

      const destroySpinner = clack.spinner();
      destroySpinner.start('Removing provider...');

      await destroyProvider(providerToRemove as string, passphrase as string);

      destroySpinner.stop('Provider removed successfully');
    } catch (error: any) {
      clack.log.error(`Failed to remove provider: ${error.message}`);
      process.exit(1);
    }
  });
