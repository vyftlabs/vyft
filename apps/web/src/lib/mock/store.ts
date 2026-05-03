import type {
  Deployment,
  Project,
  Registry,
  Resource,
  Variable,
} from "@vyft/spec";

const STORAGE_KEY = "vyft:db";

export interface Db {
  projects: Project[];
  resources: Resource[];
  variables: Variable[];
  registries: Registry[];
  deployments: Deployment[];
}

const empty = (): Db => ({
  projects: [],
  resources: [],
  variables: [],
  registries: [],
  deployments: [],
});

function load(): Db {
  if (typeof window === "undefined") return empty();
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return empty();
  try {
    const parsed = JSON.parse(raw) as Partial<Db>;
    return { ...empty(), ...parsed };
  } catch {
    return empty();
  }
}

let db: Db = load();

function persist(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

export const store = {
  get db(): Db {
    return db;
  },
  read<K extends keyof Db>(key: K): Db[K] {
    return db[key];
  },
  write<K extends keyof Db>(key: K, next: Db[K]): void {
    db = { ...db, [key]: next };
    persist();
  },
  reset(): void {
    db = empty();
    persist();
  },
};

export function uuid(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}
