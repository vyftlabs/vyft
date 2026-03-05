import {
  appendFile,
  mkdir,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import type { FileSystem } from "./types.ts";

export const nodeFs: FileSystem = {
  readFile: (path, encoding) => readFile(path, encoding),
  writeFile: (path, data, options) => writeFile(path, data, options),
  appendFile: (path, data, encoding) => appendFile(path, data, encoding),
  rename: (oldPath, newPath) => rename(oldPath, newPath),
  mkdir: (path, options) => mkdir(path, options),
  unlink: (path) => unlink(path),
  rm: (path, options) => rm(path, options),
};
