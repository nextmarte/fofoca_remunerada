import { Queue } from "bullmq";
import { redis } from "./redis";

export const transcriptionQueue = new Queue("transcription", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export interface TranscriptionJobData {
  transcriptionId: string;
  audioBase64: string;
  filename: string;
  userId: string;
}

export async function addTranscriptionJob(data: TranscriptionJobData) {
  return transcriptionQueue.add("transcribe", data, {
    priority: 1,
  });
}
