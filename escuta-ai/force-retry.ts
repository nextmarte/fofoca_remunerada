import { Queue } from "bullmq";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
const queue = new Queue("transcription", { connection: redis });

async function forceFailAndRetry() {
  const active = await queue.getActive();
  console.log(`Found ${active.length} active jobs`);
  
  for (const job of active) {
    console.log(`Moving job ${job.id} to failed...`);
    await job.moveToFailed(new Error("Force failed to retry"), "0");
    console.log(`Job ${job.id} moved to failed`);
    
    console.log(`Retrying job ${job.id}...`);
    await job.retry();
    console.log(`Job ${job.id} retried`);
  }
}

forceFailAndRetry()
  .catch(console.error)
  .finally(() => redis.disconnect());
