import type { FileSystem } from "./types.ts";

function enoent(path: string): NodeJS.ErrnoException {
  const err = new Error(
    `ENOENT: no such file or directory, '${path}'`,
  ) as NodeJS.ErrnoException;
  err.code = "ENOENT";
  return err;
}

function eexist(path: string): NodeJS.ErrnoException {
  const err = new Error(
    `EEXIST: file already exists, '${path}'`,
  ) as NodeJS.ErrnoException;
  err.code = "EEXIST";
  return err;
}

export function createMemoryFs(): FileSystem {
  const files = new Map<string, string>();

  return {
    async readFile(path: string): Promise<string> {
      const content = files.get(path);
      if (content === undefined) throw enoent(path);
      return content;
    },

    async writeFile(
      path: string,
      data: string,
      options: string | { flag: string },
    ): Promise<void> {
      if (
        typeof options === "object" &&
        options.flag === "wx" &&
        files.has(path)
      ) {
        throw eexist(path);
      }
      files.set(path, data);
    },

    async appendFile(path: string, data: string): Promise<void> {
      files.set(path, (files.get(path) ?? "") + data);
    },

    async rename(oldPath: string, newPath: string): Promise<void> {
      const content = files.get(oldPath);
      if (content === undefined) throw enoent(oldPath);
      files.delete(oldPath);
      files.set(newPath, content);
    },

    async mkdir(): Promise<string | undefined> {
      return undefined;
    },

    async unlink(path: string): Promise<void> {
      if (!files.has(path)) throw enoent(path);
      files.delete(path);
    },

    async rm(path: string): Promise<void> {
      for (const key of files.keys()) {
        if (key === path || key.startsWith(`${path}/`)) {
          files.delete(key);
        }
      }
    },
  };
}
