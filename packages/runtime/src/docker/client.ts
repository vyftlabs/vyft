import http from "node:http";

export interface DockerClient {
  get(path: string): Promise<unknown>;
  post(path: string, body?: unknown): Promise<unknown>;
  del(path: string): Promise<void>;
  /** POST with raw body stream (for image build tar). */
  postStream(path: string, body: Buffer, contentType: string): Promise<unknown>;
}

const API_VERSION = "/v1.47";

function socketPath(): string {
  const host = process.env["DOCKER_HOST"];
  if (host?.startsWith("unix://")) return host.slice(7);
  return "/var/run/docker.sock";
}

function request(
  method: string,
  path: string,
  body?: string | Buffer,
  contentType?: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (body && contentType) {
      headers["Content-Type"] = contentType;
      headers["Content-Length"] = String(Buffer.byteLength(body));
    } else if (body) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = String(Buffer.byteLength(body));
    }

    const req = http.request(
      {
        socketPath: socketPath(),
        path: `${API_VERSION}${path}`,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

export function createDockerClient(): DockerClient {
  return {
    async get(path) {
      const res = await request("GET", path);
      if (res.status >= 400) {
        throw new Error(`Docker GET ${path}: ${res.status} ${res.body}`);
      }
      return res.body ? JSON.parse(res.body) : null;
    },

    async post(path, body?) {
      const payload = body !== undefined ? JSON.stringify(body) : undefined;
      const res = await request("POST", path, payload);
      if (res.status >= 400 && res.status !== 409) {
        throw new Error(`Docker POST ${path}: ${res.status} ${res.body}`);
      }
      return res.body ? JSON.parse(res.body) : null;
    },

    async del(path) {
      const res = await request("DELETE", path);
      if (res.status >= 400 && res.status !== 404) {
        throw new Error(`Docker DELETE ${path}: ${res.status} ${res.body}`);
      }
    },

    async postStream(path, body, contentType) {
      const res = await request("POST", path, body, contentType);
      if (res.status >= 400) {
        throw new Error(`Docker POST ${path}: ${res.status} ${res.body}`);
      }
      return res.body ? JSON.parse(res.body) : null;
    },
  };
}
