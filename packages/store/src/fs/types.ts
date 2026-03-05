export interface FileSystem {
  readFile(path: string, encoding: "utf8"): Promise<string>;
  writeFile(path: string, data: string, encoding: "utf8"): Promise<void>;
  writeFile(
    path: string,
    data: string,
    options: { flag: string },
  ): Promise<void>;
  appendFile(path: string, data: string, encoding: "utf8"): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  mkdir(
    path: string,
    options: { recursive: true },
  ): Promise<string | undefined>;
  unlink(path: string): Promise<void>;
  rm(path: string, options: { recursive: true; force: true }): Promise<void>;
}
