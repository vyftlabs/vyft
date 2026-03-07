import http from "node:http";

export interface DockerResponse<T = unknown> {
  status: number;
  body: T;
}

export interface DockerClient {
  get<T = unknown>(path: string): Promise<DockerResponse<T>>;
  post<T = unknown>(path: string, body?: unknown): Promise<DockerResponse<T>>;
  del<T = unknown>(path: string): Promise<DockerResponse<T>>;
}

const API_VERSION = "/v1.47";

function request<T>(
  socketPath: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<DockerResponse<T>> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;

    const req = http.request(
      {
        socketPath,
        path: `${API_VERSION}${path}`,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload !== undefined
            ? { "Content-Length": Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let parsed: T;
          try {
            parsed = JSON.parse(raw) as T;
          } catch {
            parsed = raw as T;
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
        res.on("error", reject);
      },
    );

    req.on("error", reject);
    if (payload !== undefined) {
      req.write(payload);
    }
    req.end();
  });
}

export function createClient(socketPath?: string): DockerClient {
  const sock =
    socketPath ?? process.env["DOCKER_HOST"] ?? "/var/run/docker.sock";

  return {
    get<T>(path: string) {
      return request<T>(sock, "GET", path);
    },
    post<T>(path: string, body?: unknown) {
      return request<T>(sock, "POST", path, body);
    },
    del<T>(path: string) {
      return request<T>(sock, "DELETE", path);
    },
  };
}
