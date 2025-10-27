import * as fsAsync from 'node:fs/promises';

export async function ensureFileExists(
  filePath: string,
  content: string,
): Promise<void> {
  try {
    await fsAsync.access(filePath);
  } catch {
    await fsAsync.writeFile(filePath, content, { flag: 'wx' });
  }
}

export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fsAsync.access(dirPath);
  } catch {
    await fsAsync.mkdir(dirPath, { recursive: true });
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const data = await fsAsync.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function writeJsonFile(
  filePath: string,
  data: any,
): Promise<void> {
  await fsAsync.writeFile(filePath, JSON.stringify(data, null, 2));
}
