import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

const VERSION = "0.17.2";

const PLATFORM_MAP: Record<string, Record<string, string>> = {
  darwin: {
    arm64: "arm64-apple-darwin",
    x64: "x86_64-apple-darwin",
  },
  linux: {
    arm64: "arm64-unknown-linux-musl",
    x64: "x86_64-unknown-linux-musl",
  },
};

function getPlatformTarget(): string {
  const platformTargets = PLATFORM_MAP[process.platform];
  if (!platformTargets) {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }
  const target = platformTargets[process.arch];
  if (!target) {
    throw new Error(
      `Unsupported architecture: ${process.arch} on ${process.platform}`,
    );
  }
  return target;
}

function getCacheDir(): string {
  return join(
    process.cwd(),
    "node_modules",
    ".cache",
    "vyft",
    "railpack",
    `v${VERSION}`,
  );
}

function getDownloadUrl(): string {
  const target = getPlatformTarget();
  return `https://github.com/railwayapp/railpack/releases/download/v${VERSION}/railpack-v${VERSION}-${target}.tar.gz`;
}

function getChecksumsUrl(): string {
  return `https://github.com/railwayapp/railpack/releases/download/v${VERSION}/checksums.txt`;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(path);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

async function verifyChecksum(
  archivePath: string,
  archiveName: string,
): Promise<void> {
  const checksumsUrl = getChecksumsUrl();
  const res = await fetch(checksumsUrl);
  if (!res.ok) {
    throw new Error(
      `Failed to download checksums: ${res.status} ${res.statusText}`,
    );
  }
  const text = await res.text();

  const expectedHash = text
    .split("\n")
    .find((line) => line.includes(archiveName))
    ?.split(/\s+/)[0];

  if (!expectedHash) {
    throw new Error(`Checksum not found for ${archiveName}`);
  }

  const actualHash = await sha256(archivePath);
  if (actualHash !== expectedHash) {
    throw new Error(
      `Checksum mismatch for ${archiveName}: expected ${expectedHash}, got ${actualHash}`,
    );
  }
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to download ${url}: ${res.status} ${res.statusText}`,
    );
  }
  if (!res.body) {
    throw new Error(`No response body from ${url}`);
  }
  const fileStream = createWriteStream(dest);
  await pipeline(res.body, fileStream);
}

/** Returns the path to the railpack binary, downloading it if not cached. */
export async function ensureBinary(): Promise<string> {
  const cacheDir = getCacheDir();
  const binaryPath = join(cacheDir, "railpack");

  if (await fileExists(binaryPath)) {
    return binaryPath;
  }

  await mkdir(cacheDir, { recursive: true });

  const target = getPlatformTarget();
  const archiveName = `railpack-v${VERSION}-${target}.tar.gz`;
  const archivePath = join(cacheDir, archiveName);

  await download(getDownloadUrl(), archivePath);
  await verifyChecksum(archivePath, archiveName);

  await new Promise<void>((resolve, reject) => {
    execFile("tar", ["xzf", archivePath, "-C", cacheDir], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  await chmod(binaryPath, 0o755);

  return binaryPath;
}
