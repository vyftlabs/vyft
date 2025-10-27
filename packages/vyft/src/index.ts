#!/usr/bin/env node

import { Command } from 'commander';
import { provider } from './commands/provider.js';
import { cluster } from './commands/cluster.js';
import { ssh } from './commands/ssh.js';

const program = new Command();

program
  .name('vyft')
  .description('Vyft - Infrastructure deployment made simple')
  .version('0.0.1');

program.addCommand(provider);
program.addCommand(cluster);
program.addCommand(ssh);

program.parse();
