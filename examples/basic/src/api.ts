import { serve } from "@hono/node-server";
import { env } from "@vyft/client";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../drizzle/db.ts";
import { jobs } from "../drizzle/schema.ts";
import { jobQueue } from "./queue.ts";

import "../drizzle/migrate.ts";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

app.post("/jobs", async (c) => {
  const { type, payload } = await c.req.json();
  const [job] = await db.insert(jobs).values({ type, payload }).returning();
  await jobQueue.add(type, { jobId: job.id, ...payload });
  return c.json(job, 201);
});

app.get("/jobs/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  if (!job) return c.json({ error: "not found" }, 404);
  return c.json(job);
});

app.get("/jobs", async (c) => {
  const result = await db
    .select()
    .from(jobs)
    .orderBy(desc(jobs.createdAt))
    .limit(50);
  return c.json(result);
});

serve({ fetch: app.fetch, port: env.PORT });
