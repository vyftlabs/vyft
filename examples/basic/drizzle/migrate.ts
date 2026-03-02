import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./db.ts";

await migrate(db, { migrationsFolder: import.meta.dirname ?? "." });
