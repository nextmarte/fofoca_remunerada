/**
 * Cliente para API de transcrição com diarização
 * https://devel.cid-uff.net/api/docs#/Transcription/transcription_api_transcribe_with_speakers
 */

export interface WhisperDiarizationSegment {
  start: number;
  end: number;
  text: string;
  confidence: number;
  speaker: string;
}

export interface WhisperDiarizationSpeaker {
  speaker_id: string;
  speaking_time: number;
  num_segments: number;
}

export interface WhisperDiarizationResponse {
  success: boolean;
  transcription: {
    text: string;
    segments: WhisperDiarizationSegment[];
    language: string;
    duration: number;
    speakers: WhisperDiarizationSpeaker[];
    num_speakers: number;
  };
  processing_time: number;
  timing_metrics: {
    conversion_time?: number;
    model_load_time?: number;
    transcription_time: number;
    diarization_time: number;
    post_processing_time?: number;
    total_time: number;
  };
  audio_info?: {
    format: string;
    duration: number;
    sample_rate: number;
    channels: number;
    file_size_mb: number;
  };
  error?: string;
  cached?: boolean;
}

export interface TranscribeWithSpeakersOptions {
  file: Buffer;
  filename: string;
  language?: string;
  model?: "tiny" | "base" | "small" | "medium" | "large";
  min_speakers?: number;
  max_speakers?: number;
}

const API_BASE_URL = process.env.WHISPER_DIARIZATION_API_URL || "https://devel.cid-uff.net/api";

/**
 * Transcreve áudio com identificação automática de speakers
 */
export async function transcribeWithSpeakers(
  options: TranscribeWithSpeakersOptions
): Promise<WhisperDiarizationResponse> {
  const {
    file,
    filename,
    language = "pt",
    model = "medium",
    min_speakers = 2,
    max_speakers = 2,
  } = options;

  console.log(`[WhisperDiarization] Enviando arquivo: ${filename} (${(file.length / 1024 / 1024).toFixed(2)}MB)`);
  console.log(`[WhisperDiarization] Modelo: ${model}, Idioma: ${language}`);
  console.log(`[WhisperDiarization] Speakers esperados: ${min_speakers}-${max_speakers}`);

  const formData = new FormData();
  const blob = new Blob([file]);
  formData.append("file", blob, filename);
  formData.append("language", language);
  formData.append("model", model);
  formData.append("min_speakers", min_speakers.toString());
  formData.append("max_speakers", max_speakers.toString());

  const startTime = Date.now();

  try {
    const response = await fetch(`${API_BASE_URL}/transcribe/with-speakers`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const result: WhisperDiarizationResponse = await response.json();

    if (!result.success) {
      throw new Error(result.error || "Transcription failed");
    }

    const elapsedTime = (Date.now() - startTime) / 1000;
    console.log(`[WhisperDiarization] Sucesso! Processado em ${elapsedTime.toFixed(2)}s`);
    console.log(`[WhisperDiarization] Speakers encontrados: ${result.transcription.num_speakers}`);
    console.log(`[WhisperDiarization] Segmentos: ${result.transcription.segments.length}`);

    return result;
  } catch (error) {
    console.error(`[WhisperDiarization] Erro:`, error);
    throw error;
  }
}

/**
 * Converte resposta da API para formato interno do banco
 */
export function convertToInternalFormat(response: WhisperDiarizationResponse) {
  return {
    text: response.transcription.text,
    language: response.transcription.language,
    duration: Math.round(response.transcription.duration),
    segments: response.transcription.segments.map((seg) => ({
      startTime: seg.start,
      endTime: seg.end,
      text: seg.text,
      confidence: seg.confidence,
      speakerId: seg.speaker,
    })),
    speakers: response.transcription.speakers.map((speaker) => ({
      speakerId: speaker.speaker_id,
      name: null, // Será atribuído pelo LLM depois se necessário
      segmentCount: speaker.num_segments,
      totalDuration: speaker.speaking_time,
    })),
    processingTime: response.processing_time * 1000, // converter para ms
    timingMetrics: response.timing_metrics,
  };
}
