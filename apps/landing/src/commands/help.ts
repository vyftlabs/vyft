interface Terminal {
  write: (text: string) => void;
}

interface LocalEcho {
  println: (text: string) => void;
}

export async function help(
  terminal: Terminal,
  localEcho: LocalEcho,
  _args: string[],
) {
  localEcho.println('\x1b[36mAvailable commands:\x1b[0m');
  localEcho.println('  \x1b[33mhelp\x1b[0m         - Show this help');
  localEcho.println('  \x1b[33mclear\x1b[0m        - Clear terminal');
  localEcho.println(
    '  \x1b[32mvyft\x1b[0m         - Vyft CLI (try: vyft help)',
  );
}
