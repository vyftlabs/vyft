import { secret, service, std } from "vyft";

const password = secret(
  std.crypto.randomString("password", {
    length: 16,
  }),
);

service("db", {
  image: "postgres:16",
  port: 5432,
  env: {
    POSTGRES_USER: "postgres",
    POSTGRES_PASSWORD: password,
  },
});

service("app");
