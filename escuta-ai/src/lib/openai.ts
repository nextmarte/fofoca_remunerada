import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string
): Promise<{
  text: string;
  duration?: number;
  language?: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}> {
  const uint8Array = new Uint8Array(audioBuffer);
  const file = new File([uint8Array], filename, { type: "audio/webm" });

  const response = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });

  return {
    text: response.text,
    duration: response.duration,
    language: response.language,
    segments: response.segments?.map((seg) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text,
    })),
  };
}
