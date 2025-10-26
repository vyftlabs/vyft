// import { createVirtualTypeScriptEnvironment } from '@typescript/vfs';

export class VirtualFileSystem {
  private currentPath = '/';
  private files: Map<string, string> = new Map();
  private directories: Set<string> = new Set();

  constructor() {
    this.initializeDefaultFileSystem();
  }

  private initializeDefaultFileSystem() {
    // Create root directory
    this.directories.add('/');

    // Create some default files
    this.files.set(
      '/README.md',
      `# Vyft Project

Welcome to your Vyft project! This is a sample README file.

## Getting Started

1. Deploy your application: \`vyft deploy\`
2. View logs: \`vyft logs\`
3. List files: \`ls\`

## Project Structure

- \`src/\` - Source code
- \`package.json\` - Project configuration
- \`README.md\` - This file
`,
    );

    this.files.set(
      '/package.json',
      `{
  "name": "vyft-project",
  "version": "1.0.0",
  "description": "A Vyft application",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "vyft dev",
    "deploy": "vyft deploy"
  },
  "dependencies": {
    "@vyft/core": "^1.0.0"
  }
}`,
    );

    // Create src directory and some files
    this.directories.add('/src');
    this.files.set(
      '/src/index.js',
      `import { service, route } from '@vyft/core';

const app = service('my-app', {
  route: route('api.example.com'),
  env: {
    NODE_ENV: 'production'
  }
});

export default app;`,
    );

    this.files.set(
      '/src/utils.js',
      `export function formatDate(date) {
  return new Date(date).toLocaleDateString();
}

export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}`,
    );

    // Create config directory
    this.directories.add('/config');
    this.files.set(
      '/config/database.json',
      `{
  "host": "localhost",
  "port": 5432,
  "database": "vyft_db",
  "username": "vyft_user"
}`,
    );
  }

  pwd(): string {
    return this.currentPath;
  }

  cd(path: string): boolean {
    const normalizedPath = this.normalizePath(path);

    if (normalizedPath === '/') {
      this.currentPath = '/';
      return true;
    }

    if (this.directories.has(normalizedPath)) {
      this.currentPath = normalizedPath;
      return true;
    }

    return false;
  }

  ls(path?: string): string[] {
    const targetPath = path ? this.normalizePath(path) : this.currentPath;
    const items: string[] = [];

    // Add directories
    for (const dir of this.directories) {
      if (dir.startsWith(targetPath) && dir !== targetPath) {
        const relativePath = dir.substring(targetPath.length);
        if (relativePath.startsWith('/')) {
          const name = relativePath.substring(1).split('/')[0];
          if (name && !items.includes(name + '/')) {
            items.push(name + '/');
          }
        }
      }
    }

    // Add files
    for (const file of this.files.keys()) {
      if (file.startsWith(targetPath) && file !== targetPath) {
        const relativePath = file.substring(targetPath.length);
        if (relativePath.startsWith('/')) {
          const name = relativePath.substring(1).split('/')[0];
          if (name && !items.includes(name) && !items.includes(name + '/')) {
            items.push(name);
          }
        }
      }
    }

    return items.sort();
  }

  cat(path: string): string | null {
    const normalizedPath = this.normalizePath(path);
    return this.files.get(normalizedPath) || null;
  }

  mkdir(path: string): boolean {
    const normalizedPath = this.normalizePath(path);

    if (
      this.directories.has(normalizedPath) ||
      this.files.has(normalizedPath)
    ) {
      return false;
    }

    this.directories.add(normalizedPath);
    return true;
  }

  touch(path: string): boolean {
    const normalizedPath = this.normalizePath(path);

    if (
      this.files.has(normalizedPath) ||
      this.directories.has(normalizedPath)
    ) {
      return false;
    }

    this.files.set(normalizedPath, '');
    return true;
  }

  rm(path: string): boolean {
    const normalizedPath = this.normalizePath(path);

    if (this.files.has(normalizedPath)) {
      this.files.delete(normalizedPath);
      return true;
    }

    if (this.directories.has(normalizedPath)) {
      // Check if directory is empty
      const hasFiles = Array.from(this.files.keys()).some((file) =>
        file.startsWith(normalizedPath + '/'),
      );
      const hasSubdirs = Array.from(this.directories).some(
        (dir) => dir.startsWith(normalizedPath + '/') && dir !== normalizedPath,
      );

      if (!hasFiles && !hasSubdirs) {
        this.directories.delete(normalizedPath);
        return true;
      }
    }

    return false;
  }

  private normalizePath(path: string): string {
    if (path.startsWith('/')) {
      return path;
    }

    const current = this.currentPath === '/' ? '' : this.currentPath;
    return current + '/' + path;
  }
}
