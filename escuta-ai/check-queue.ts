import { Queue } from "bullmq";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
const queue = new Queue("transcription", { connection: redis });

async function checkQueue() {
  const counts = await queue.getJobCounts();
  console.log("Queue counts:", counts);
  
  const active = await queue.getActive();
  console.log("Active jobs:", active.map(j => j.id));
  
  const waiting = await queue.getWaiting();
  console.log("Waiting jobs:", waiting.map(j => j.id));
  
  const failed = await queue.getFailed();
  console.log("Failed jobs:", failed.map(j => j.id));
}

checkQueue()
  .catch(console.error)
  .finally(() => redis.disconnect());
