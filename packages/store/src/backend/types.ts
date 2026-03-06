export interface StorageBackend {
  read(key: string): Promise<string | null>;
  write(key: string, data: string): Promise<void>;
  append(key: string, data: string): Promise<void>;
  delete(key: string): Promise<void>;
  deleteAll(prefix: string): Promise<void>;
  lock(): Promise<void>;
  unlock(): Promise<void>;
}
