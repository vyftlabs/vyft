import { resource, service, std } from "vyft";

export const site = resource("site", (_id, config: { cwd: string }) => {
  std.process.exec({
    command: ["npm", "ci"],
    cwd: config.cwd,
    inputs: ["package.json", "package-lock.json"],
  });

  std.process.exec({
    command: ["npm", "run", "build"],
    cwd: config.cwd,
    env: { NODE_ENV: "production" },
    inputs: ["src/**", "package.json"],
    outputs: ["dist/**"],
  });

  const assets = std.fs.glob({
    cwd: config.cwd,
    include: ["dist/**"],
  });

  const nginx = service("nginx", {
    image: "nginx:alpine",
    port: 80,
    mounts: [{ source: assets, path: "/usr/share/nginx/html" }],
  });

  return {
    outputs: {
      url: nginx.url,
      host: nginx.host,
    },
  };
});

export const frontend = site("frontend", {
  cwd: "./app",
});
