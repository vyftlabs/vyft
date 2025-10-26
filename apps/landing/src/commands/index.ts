import { help } from './help';
import { clear } from './clear';
import { vyft } from './vyft';

export const terminalCommands = {
  help,
  clear,
  vyft,
};

interface LocalEcho {
  println: (text: string) => void;
}

export async function handleUnknownCommand(cmd: string, localEcho: LocalEcho) {
  localEcho.println(`\x1b[31mCommand not found: ${cmd}\x1b[0m`);
  localEcho.println('Type "\x1b[33mhelp\x1b[0m" for available commands');
}
