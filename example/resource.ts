import { resource, secret, std, interpolate } from "vyft";
import { resolve } from "path";
import { resolvePackageJson, resolvePackageManager } from "./helpers";

type SiteArgs = {
  cwd?: string;
  path?: string;
  domain?: string;
  spa?: boolean;
  input?: string[];
  output?: string[];
};

export const site = resource("site", async (id, config: SiteArgs, ctx) => {
  const {
    cwd = process.cwd(),
    path = ".",
    spa = true,
    input = ["src/**", "public/**", "package.json"],
    output = ["dist/**"],
  } = config;
  const pkg = await resolvePackageJson(resolve(cwd, path));
  const pm = await resolvePackageManager(pkg.path);
  await std.process.exec(`${pm} run build`, { cwd: pkg.path });

  const archive = await std.fs.glob({
    include: output,
    cwd: pkg.path,
  });

  const archiveRef = await ctx.artifacts.write("archive", archive);

  const nginxConfig = interpolate`
  server {
    listen       80;
    server_name  localhost;
    root   /usr/share/nginx/html;

    location / {
      try_files $uri $uri/ ${spa ? "/index.html" : ""};
    }
  }
  `;

  const nginx = service(`${id}-nginx`, {
    image: "nginx:alpine",
    port: 80,
    route: config.domain ? `https://${config.domain}` : undefined,
    mounts: [
      { source: archiveRef, target: "/usr/share/nginx/html" },
      { source: nginxConfig, target: "/etc/nginx/conf.d/default.conf" },
    ],
  });

  ctx.runtime.exec(nginx, {
    command: ["nginx", "-t"],
    cwd: "/etc/nginx",
  });

  return {
    children: [nginx],
    output: {},
  };
});
