interface Terminal {
  write: (text: string) => void;
}

interface LocalEcho {
  print: (text: string) => void;
}

export async function clear(
  terminal: Terminal,
  localEcho: LocalEcho,
  _args: string[],
) {
  localEcho.print('\x1b[2J\x1b[H');
}
