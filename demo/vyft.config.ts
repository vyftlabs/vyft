import { secret, service, std } from "vyft";

const password = std.crypto.randomString("password", {
  length: 16,
});

const db = service("db", {
  image: "postgres:16",
  port: 5432,
  env: {
    POSTGRES_USER: "postgres",
    POSTGRES_PASSWORD: password,
  },
});

const app = service("app", {
  link: [db],
});
