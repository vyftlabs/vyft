import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "../drizzle/db.ts";
import { jobs } from "../drizzle/schema.ts";
import { connection } from "./queue.ts";

type Handler = (
  data: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

const handlers: Record<string, Handler> = {
  async email(data) {
    await new Promise((r) => setTimeout(r, 1000));
    return { sent: true, to: data.to };
  },
  async resize(data) {
    await new Promise((r) => setTimeout(r, 2000));
    return { width: data.width, height: data.height };
  },
};

const worker = new Worker(
  "jobs",
  async (job) => {
    const { jobId, ...data } = job.data;

    await db.update(jobs).set({ status: "active" }).where(eq(jobs.id, jobId));

    console.log(`Processing job ${jobId} (${job.name})`);

    const handler = handlers[job.name] ?? (async () => ({ processed: true }));
    const result = await handler(data);

    await db
      .update(jobs)
      .set({ status: "completed", result, completedAt: new Date() })
      .where(eq(jobs.id, jobId));

    console.log(`Completed job ${jobId}:`, result);
    return result;
  },
  { connection },
);

worker.on("failed", async (job, err) => {
  if (!job) return;
  console.error(`Failed job ${job.data.jobId}:`, err.message);
  await db
    .update(jobs)
    .set({ status: "failed", result: { error: err.message } })
    .where(eq(jobs.id, job.data.jobId));
});

console.log("Worker started, waiting for jobs...");
