// Spinner frames for loading animation
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerIndex = 0;

interface Terminal {
  write: (text: string) => void;
}

interface LocalEcho {
  println: (text: string) => void;
}

async function promptsLoader(
  terminal: Terminal,
  loadingText: string,
  promise: Promise<unknown>,
  successText: string,
) {
  const spinnerInterval: NodeJS.Timeout = setInterval(() => {
    const spinner = spinnerFrames[spinnerIndex % spinnerFrames.length];
    terminal.write(`\r\x1b[K\x1b[36m${spinner}\x1b[0m ${loadingText}`);
    spinnerIndex++;
  }, 80);

  try {
    await promise;
    clearInterval(spinnerInterval);
    terminal.write(`\r\x1b[K\x1b[32m✔\x1b[0m ${successText}\r\n`);
  } catch (error) {
    clearInterval(spinnerInterval);
    terminal.write(`\r\x1b[K\x1b[31m✖\x1b[0m Failed\r\n`);
  }
}

async function deploy(
  terminal: Terminal,
  localEcho: LocalEcho,
  _args: string[],
) {
  localEcho.println(
    '\x1b[90mNo infrastructure found - provisioning new cluster\x1b[0m',
  );

  terminal.write('\x1b[36m?\x1b[0m Choose a cloud provider: ');
  await new Promise((resolve) => setTimeout(resolve, 800));
  terminal.write('\x1b[32mHetzner\x1b[0m\r\n');

  await new Promise((resolve) => setTimeout(resolve, 400));
  terminal.write('\x1b[36m?\x1b[0m Hetzner API token: ');
  await new Promise((resolve) => setTimeout(resolve, 600));
  terminal.write('\x1b[90m••••••••••••••••\x1b[0m\r\n');

  await new Promise((resolve) => setTimeout(resolve, 300));
  localEcho.println('\x1b[32m✔\x1b[0m Authentication successful\n');

  await promptsLoader(
    terminal,
    'Provisioning infrastructure...',
    new Promise((resolve) => setTimeout(resolve, 1800)),
    'Infrastructure ready',
  );

  await promptsLoader(
    terminal,
    'Building and deploying...',
    new Promise((resolve) => setTimeout(resolve, 2200)),
    'Deployed to \x1b[36mhttps://api.example.com\x1b[0m',
  );
}

async function logs(
  terminal: Terminal,
  localEcho: LocalEcho,
  args: string[],
  interruptSignal?: { interrupted: () => boolean },
) {
  const isFollow = args.includes('-f');

  const generateTimestamp = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour12: false });
  };

  const logTemplates = [
    {
      service: 'api',
      level: 'INFO',
      template: 'GET /health 200 {}ms',
      color: '\x1b[34m',
    },
    {
      service: 'api',
      level: 'INFO',
      template: 'GET /api/users/{} 200 {}ms',
      color: '\x1b[34m',
    },
    {
      service: 'api',
      level: 'INFO',
      template: 'POST /api/auth/login 200 {}ms',
      color: '\x1b[34m',
    },
    {
      service: 'api',
      level: 'INFO',
      template: 'GET /api/products?page={}&limit=10 200 {}ms',
      color: '\x1b[34m',
    },
    {
      service: 'api',
      level: 'INFO',
      template: 'PUT /api/products/{} 200 {}ms',
      color: '\x1b[34m',
    },
    {
      service: 'api',
      level: 'INFO',
      template: 'GET /api/orders/recent 200 {}ms',
      color: '\x1b[34m',
    },
    {
      service: 'api',
      level: 'INFO',
      template: 'POST /api/orders 201 {}ms',
      color: '\x1b[34m',
    },
    {
      service: 'api',
      level: 'INFO',
      template: 'DELETE /api/sessions/expired 200 {}ms',
      color: '\x1b[34m',
    },
    {
      service: 'api',
      level: 'WARN',
      template: 'GET /api/analytics/dashboard 429 {}ms - Rate limit exceeded',
      color: '\x1b[34m',
    },
    {
      service: 'postgres',
      level: 'INFO',
      template: 'Checkpoint completed',
      color: '\x1b[35m',
    },
    {
      service: 'postgres',
      level: 'INFO',
      template: 'Database connection pool: {} active connections',
      color: '\x1b[35m',
    },
  ];

  const generateRandomLog = () => {
    const template =
      logTemplates[Math.floor(Math.random() * logTemplates.length)];
    let message = template.template;

    message = message.replace(/\{\}/g, () => {
      if (message.includes('active connections'))
        return String(Math.floor(Math.random() * 50) + 5);
      if (message.includes('page='))
        return String(Math.floor(Math.random() * 10) + 1);
      if (message.includes('/users/') || message.includes('/products/'))
        return String(Math.floor(Math.random() * 1000) + 1);
      return String(Math.floor(Math.random() * 200) + 10);
    });

    return {
      service: template.service,
      level: template.level,
      message,
      color: template.color,
    };
  };

  const initialLogs = [
    {
      service: 'postgres',
      level: 'INFO',
      message: 'Database system is ready to accept connections',
      color: '\x1b[35m',
    },
    {
      service: 'api',
      level: 'INFO',
      message: 'Starting Express server on port 3000',
      color: '\x1b[34m',
    },
    {
      service: 'api',
      level: 'INFO',
      message: 'Connected to database successfully',
      color: '\x1b[34m',
    },
    {
      service: 'api',
      level: 'INFO',
      message: 'Server listening on port 3000',
      color: '\x1b[34m',
    },
  ];

  localEcho.println('\x1b[32mFetching application logs...\x1b[0m');
  await new Promise((resolve) => setTimeout(resolve, 400));

  for (let i = 0; i < initialLogs.length; i++) {
    const entry = initialLogs[i];
    const timestamp = generateTimestamp();
    const levelColor = entry.level === 'DEBUG' ? '\x1b[90m' : '\x1b[37m';

    localEcho.println(
      `\x1b[90m${timestamp}\x1b[0m ${entry.color}[${entry.service}]\x1b[0m ${levelColor}${entry.level}\x1b[0m ${entry.message}`,
    );

    const delay = Math.random() * 150 + 50;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  if (isFollow) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (interruptSignal?.interrupted()) {
        break;
      }

      const entry = generateRandomLog();
      const timestamp = generateTimestamp();
      const levelColor = entry.level === 'DEBUG' ? '\x1b[90m' : '\x1b[37m';

      localEcho.println(
        `\x1b[90m${timestamp}\x1b[0m ${entry.color}[${entry.service}]\x1b[0m ${levelColor}${entry.level}\x1b[0m ${entry.message}`,
      );

      const delay = Math.random() * 2000 + 500;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

function showVyftHelp(localEcho: LocalEcho) {
  localEcho.println(
    '\x1b[36mVyft CLI\x1b[0m - Deploy and manage your applications',
  );
  localEcho.println('');
  localEcho.println('\x1b[33mUsage:\x1b[0m');
  localEcho.println('  vyft <command> [options]');
  localEcho.println('');
  localEcho.println('\x1b[33mCommands:\x1b[0m');
  localEcho.println('  \x1b[32mdeploy\x1b[0m     Deploy your application');
  localEcho.println('  \x1b[32mlogs\x1b[0m       Show application logs');
  localEcho.println('  \x1b[32mhelp\x1b[0m       Show this help message');
}

export async function vyft(
  terminal: Terminal,
  localEcho: LocalEcho,
  args: string[],
  interruptSignal?: { interrupted: () => boolean },
) {
  const subcommand = args[0];

  switch (subcommand) {
    case 'deploy':
      await deploy(terminal, localEcho, args.slice(1));
      break;
    case 'logs':
      await logs(terminal, localEcho, args.slice(1), interruptSignal);
      break;
    case 'help':
    case undefined:
      showVyftHelp(localEcho);
      break;
    default:
      localEcho.println(`\x1b[31mUnknown command: vyft ${subcommand}\x1b[0m`);
      localEcho.println(
        'Run "\x1b[33mvyft help\x1b[0m" for available commands',
      );
  }
}
