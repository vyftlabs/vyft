import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Reference to an artifact stored in the artifact store.
 * This is what gets persisted in state - lightweight and serializable.
 */
export interface ArtifactRef {
  readonly kind: "artifact";
  /** Key identifying this artifact */
  readonly key: string;
  /** SHA256 hash of the content */
  readonly hash: string;
  /** Size in bytes */
  readonly size: number;
}

/**
 * Artifact store interface for resources to write and read artifacts.
 * Scoped to a specific resource ID.
 */
export interface ArtifactStore {
  /**
   * Write content to the artifact store.
   * Auto-registers the artifact for framework tracking.
   * Returns a reference that can be persisted in state.
   */
  write(key: string, content: string | Buffer): Promise<ArtifactRef>;

  /**
   * Read artifact content by reference.
   */
  read(ref: ArtifactRef): Promise<Buffer>;

  /**
   * Check if an artifact exists.
   */
  exists(ref: ArtifactRef): Promise<boolean>;

  /**
   * Delete an artifact.
   */
  delete(ref: ArtifactRef): Promise<void>;

  /**
   * Delete all artifacts for this resource.
   */
  deleteAll(): Promise<void>;

  /**
   * Get all registered artifacts (for framework use).
   */
  getRegistered(): Map<string, ArtifactRef>;
}

export interface ArtifactStoreOptions {
  /** Base directory for artifact storage */
  baseDir: string;
  /** Resource ID (artifacts are scoped per-resource) */
  resourceId: string;
}

/**
 * Create a file-based artifact store scoped to a specific resource.
 *
 * Storage structure:
 * ```
 * {baseDir}/
 *   {resourceId}/
 *     {hash}  # artifact content
 * ```
 */
export function createArtifactStore(
  options: ArtifactStoreOptions,
): ArtifactStore {
  const { baseDir, resourceId } = options;
  const resourceDir = path.join(baseDir, resourceId);
  const registered = new Map<string, ArtifactRef>();

  async function ensureDir(): Promise<void> {
    await fs.mkdir(resourceDir, { recursive: true });
  }

  function artifactPath(hash: string): string {
    return path.join(resourceDir, hash);
  }

  return {
    async write(key: string, content: string | Buffer): Promise<ArtifactRef> {
      await ensureDir();

      const buffer =
        typeof content === "string" ? Buffer.from(content) : content;
      const hash = crypto.createHash("sha256").update(buffer).digest("hex");
      const size = buffer.length;

      const filePath = artifactPath(hash);

      // Check if already exists (content-addressed, so same hash = same content)
      try {
        await fs.access(filePath);
        // Already exists, no need to write again
      } catch {
        // Doesn't exist, write it
        await fs.writeFile(filePath, buffer);
      }

      const ref: ArtifactRef = { kind: "artifact", key, hash, size };

      // Auto-register for framework tracking
      registered.set(key, ref);

      return ref;
    },

    async read(ref: ArtifactRef): Promise<Buffer> {
      const filePath = artifactPath(ref.hash);
      return fs.readFile(filePath);
    },

    async exists(ref: ArtifactRef): Promise<boolean> {
      const filePath = artifactPath(ref.hash);
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    },

    async delete(ref: ArtifactRef): Promise<void> {
      const filePath = artifactPath(ref.hash);
      try {
        await fs.unlink(filePath);
      } catch {
        // Ignore if doesn't exist
      }
    },

    async deleteAll(): Promise<void> {
      try {
        await fs.rm(resourceDir, { recursive: true, force: true });
      } catch {
        // Ignore if doesn't exist
      }
    },

    getRegistered(): Map<string, ArtifactRef> {
      return new Map(registered);
    },
  };
}
