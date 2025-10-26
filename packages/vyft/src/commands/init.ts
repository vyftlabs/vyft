import { Command } from 'commander';
import * as clack from '@clack/prompts';
import * as fs from 'fs';
import * as path from 'path';

export const init = new Command('init').description(
  'Initialize a new Vyft project',
);

init.action(async () => {
  clack.intro('🚀 Initializing Vyft project');

  try {
    const projectName = await clack.text({
      message: 'What is your project name?',
      placeholder: 'my-awesome-app',
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Project name is required';
        }
        if (!/^[a-z0-9-]+$/.test(value)) {
          return 'Project name must contain only lowercase letters, numbers, and hyphens';
        }
        return undefined;
      },
    });

    if (clack.isCancel(projectName)) {
      clack.cancel('Operation cancelled');
      process.exit(0);
    }

    const projectDir = path.join(process.cwd(), projectName as string);

    if (fs.existsSync(projectDir)) {
      const overwrite = await clack.confirm({
        message: `Directory ${projectName} already exists. Overwrite?`,
        initialValue: false,
      });

      if (clack.isCancel(overwrite) || !overwrite) {
        clack.cancel('Operation cancelled');
        process.exit(0);
      }
    }

    const spinner = clack.spinner();
    spinner.start('Creating project structure...');

    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'config'), { recursive: true });

    const packageJson = {
      name: projectName,
      version: '1.0.0',
      description: `A Vyft application: ${projectName}`,
      type: 'module',
      main: 'src/index.js',
      scripts: {
        start: 'node src/index.js',
        dev: 'vyft dev',
        deploy: 'vyft deploy',
        build: 'vyft build',
      },
      dependencies: {
        '@vyft/cli': '^0.0.1',
      },
      keywords: ['vyft', 'infrastructure', 'deployment'],
    };

    const vyftConfig = `import { defineConfig } from '@vyft/cli';

export default defineConfig({
  name: '${projectName}',
  version: '1.0.0',
  description: 'A Vyft application',
  
  // Infrastructure configuration
  infrastructure: {
    provider: 'hetzner', // or 'kubernetes', 'aws', etc.
    region: 'nbg1',
    size: 'cx11'
  },
  
  // Application configuration
  app: {
    port: 3000,
    env: {
      NODE_ENV: 'production'
    }
  }
});
`;

    const readmeContent = `# ${projectName}

A Vyft application for infrastructure deployment.

## Getting Started

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Deploy your application:
   \`\`\`bash
   vyft deploy
   \`\`\`

3. View logs:
   \`\`\`bash
   vyft logs
   \`\`\`

## Project Structure

- \`src/\` - Source code
- \`config/\` - Configuration files
- \`vyft.config.ts\` - Vyft configuration
- \`package.json\` - Project configuration

## Commands

- \`vyft dev\` - Start development mode
- \`vyft deploy\` - Deploy to infrastructure
- \`vyft logs\` - View application logs
- \`vyft status\` - Check deployment status
`;

    const indexJs = `// ${projectName} - Main application file
import { service, route } from '@vyft/cli';

const app = service('${projectName}', {
  route: route('api.example.com'),
  env: {
    NODE_ENV: 'production',
    PORT: 3000
  }
});

export default app;
`;

    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify(packageJson, null, 2),
    );
    fs.writeFileSync(path.join(projectDir, 'vyft.config.ts'), vyftConfig);
    fs.writeFileSync(path.join(projectDir, 'README.md'), readmeContent);
    fs.writeFileSync(path.join(projectDir, 'src', 'index.js'), indexJs);

    spinner.stop('✅ Project structure created');

    clack.note(
      `Next steps:
1. cd ${projectName}
2. npm install
3. vyft provider add (to configure cloud provider)
4. vyft deploy (to deploy your application)`,
      'Project initialized successfully!',
    );

    clack.outro('🎉 Project ready! Happy coding!');
  } catch (error: any) {
    clack.cancel(`Failed to initialize project: ${error.message}`);
    process.exit(1);
  }
});
