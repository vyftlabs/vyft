interface KeyringEntry {
  getPassword(): string | null;
  setPassword(password: string): void;
  deletePassword(): void;
}

interface KeyringEntryConstructor {
  new (service: string, account: string): KeyringEntry;
}

// undefined = not yet loaded, null = unavailable
let EntryClass: KeyringEntryConstructor | null | undefined;

async function loadEntry(): Promise<KeyringEntryConstructor | null> {
  if (EntryClass !== undefined) return EntryClass;
  try {
    const mod: { Entry: KeyringEntryConstructor } = await import(
      "@napi-rs/keyring"
    );
    EntryClass = mod.Entry;
  } catch {
    EntryClass = null;
  }
  return EntryClass;
}

const SERVICE = "vyft";

export async function getPassphrase(project: string): Promise<string | null> {
  const Ctor = await loadEntry();
  if (!Ctor) return null;
  try {
    return new Ctor(SERVICE, project).getPassword();
  } catch {
    return null;
  }
}

export async function setPassphrase(
  project: string,
  value: string,
): Promise<boolean> {
  const Ctor = await loadEntry();
  if (!Ctor) return false;
  try {
    new Ctor(SERVICE, project).setPassword(value);
    return true;
  } catch {
    return false;
  }
}
