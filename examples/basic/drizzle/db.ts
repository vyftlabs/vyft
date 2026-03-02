import { bindings } from "@vyft/client";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

const sql = postgres(bindings.db.url, { onnotice: () => null });

export const db = drizzle(sql, { schema });
