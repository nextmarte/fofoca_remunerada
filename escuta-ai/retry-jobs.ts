import { Queue } from "bullmq";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
const queue = new Queue("transcription", { connection: redis });

async function retryStuckJobs() {
  const active = await queue.getActive();
  console.log(`Found ${active.length} active jobs`);
  
  for (const job of active) {
    console.log(`Retrying job ${job.id}...`);
    await job.retry();
    console.log(`Job ${job.id} retried (moved to waiting)`);
  }
}

retryStuckJobs()
  .catch(console.error)
  .finally(() => redis.disconnect());
