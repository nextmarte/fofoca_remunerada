import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

const execPromise = promisify(exec);

export interface AudioChunk {
  buffer: Buffer;
  startTime: number;
  endTime: number;
  duration: number;
}

/**
 * Verifica se FFmpeg está disponível no sistema
 */
export async function checkFFmpegAvailable(): Promise<boolean> {
  try {
    await execPromise("ffmpeg -version");
    await execPromise("ffprobe -version");
    return true;
  } catch {
    return false;
  }
}

/**
 * Divide um arquivo de áudio em chunks menores usando FFmpeg
 * @param audioBuffer Buffer do áudio original
 * @param filename Nome do arquivo original
 * @param chunkDurationSeconds Duração de cada chunk em segundos (padrão: 10 minutos)
 * @returns Array de chunks com seus buffers e timestamps
 */
export async function chunkAudioFile(
  audioBuffer: Buffer,
  filename: string,
  chunkDurationSeconds: number = 600 // 10 minutos por chunk
): Promise<AudioChunk[]> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "audio-chunk-"));
  const inputPath = path.join(tempDir, filename);
  
  try {
    // Salvar buffer temporariamente
    await fs.writeFile(inputPath, audioBuffer);

    // Obter duração total do áudio
    const { stdout: durationOutput } = await execPromise(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`
    );
    const totalDuration = parseFloat(durationOutput.trim());

    console.log(`[AudioChunker] Áudio total: ${totalDuration.toFixed(2)}s`);

    // Calcular número de chunks necessários
    const numChunks = Math.ceil(totalDuration / chunkDurationSeconds);
    console.log(`[AudioChunker] Dividindo em ${numChunks} chunks de ${chunkDurationSeconds}s`);

    const chunks: AudioChunk[] = [];

    // Dividir o áudio em chunks
    for (let i = 0; i < numChunks; i++) {
      const startTime = i * chunkDurationSeconds;
      const chunkPath = path.join(tempDir, `chunk_${i}.mp3`);

      // Usar FFmpeg para extrair o chunk
      await execPromise(
        `ffmpeg -i "${inputPath}" -ss ${startTime} -t ${chunkDurationSeconds} -c:a libmp3lame -q:a 2 "${chunkPath}"`
      );

      // Ler o chunk
      const chunkBuffer = await fs.readFile(chunkPath);
      const endTime = Math.min(startTime + chunkDurationSeconds, totalDuration);

      chunks.push({
        buffer: chunkBuffer,
        startTime,
        endTime,
        duration: endTime - startTime,
      });

      console.log(
        `[AudioChunker] Chunk ${i + 1}/${numChunks}: ${startTime.toFixed(2)}s - ${endTime.toFixed(2)}s (${(chunkBuffer.length / 1024 / 1024).toFixed(2)}MB)`
      );
    }

    return chunks;
  } finally {
    // Limpar arquivos temporários
    await fs.rm(tempDir, { recursive: true, force: true }).catch(console.error);
  }
}
