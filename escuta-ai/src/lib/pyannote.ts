/**
 * Pyannote API Client para Diarização Neural
 * 
 * Integração com a API do Pyannote para identificação de speakers.
 * Fluxo:
 * 1. Upload do áudio para storage temporário do Pyannote (media://)
 * 2. Submeter job de diarização
 * 3. Aguardar resultado (quem fala quando)
 * 4. Fazer merge com transcrição do Whisper
 * 
 * Limite padrão: 90 minutos (1h30) por usuário não-admin.
 */

const PYANNOTE_API_KEY = process.env.PYANNOTE_API_KEY;
const PYANNOTE_API_URL = "https://api.pyannote.ai/v1";

// Limite padrão de diarização para usuários não-admin (90 minutos)
export const DEFAULT_DIARIZATION_LIMIT_MINUTES = 90;

// Interface para segmento de diarização do Pyannote
export interface PyannoteDiarizationSegment {
  speaker: string;  // "SPEAKER_00", "SPEAKER_01", etc.
  start: number;    // tempo em segundos
  end: number;      // tempo em segundos
  confidence?: Record<string, number>;
}

// Interface para resultado do job
export interface PyannoteJobResult {
  jobId: string;
  status: "pending" | "created" | "succeeded" | "canceled" | "failed" | "running";
  createdAt?: string;
  updatedAt?: string;
  output?: {
    diarization: PyannoteDiarizationSegment[];
    exclusiveDiarization?: PyannoteDiarizationSegment[];
    error?: string;
    warning?: string;
  };
}

// Interface para resultado de análise de speakers (compatível com outros providers)
export interface SpeakerAnalysisResult {
  speakers: Array<{
    id: string;
    name: string | null;
    characteristics?: Record<string, unknown>;
    confidence: number;
  }>;
  diarized_transcript: Array<{
    segmentId: string;
    speaker_id: string;
    speaker_name: string | null;
    text: string;
    start_time: number;
    end_time: number;
  }>;
  analysis_confidence: number;
}

/**
 * Step 1: Cria um storage temporário e obtém URL pre-signed para upload
 */
export async function createMediaUploadUrl(objectKey: string): Promise<string> {
  if (!PYANNOTE_API_KEY) {
    throw new Error("PYANNOTE_API_KEY não configurada");
  }

  const response = await fetch(`${PYANNOTE_API_URL}/media/input`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${PYANNOTE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: `media://${objectKey}`,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erro ao criar URL de upload: ${response.status} - ${error}`);
  }

  const result = await response.json();
  return result.url; // URL pre-signed para PUT
}

/**
 * Step 2: Faz upload do áudio para o storage temporário do Pyannote
 */
export async function uploadAudioToPyannote(
  audioBuffer: Buffer,
  objectKey: string
): Promise<string> {
  console.log(`[Pyannote] Criando URL de upload para ${objectKey}...`);
  
  const presignedUrl = await createMediaUploadUrl(objectKey);
  
  console.log(`[Pyannote] Fazendo upload do áudio (${audioBuffer.length} bytes)...`);
  
  const uploadResponse = await fetch(presignedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
    },
    body: new Uint8Array(audioBuffer),
  });

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text();
    throw new Error(`Erro ao fazer upload: ${uploadResponse.status} - ${error}`);
  }

  console.log(`[Pyannote] Upload concluído com sucesso!`);
  
  // Retorna a media key para usar na diarização
  return `media://${objectKey}`;
}

/**
 * Step 3: Submete job de diarização
 */
export async function submitDiarizationJob(
  mediaUrl: string,
  options?: {
    numSpeakers?: number;
    minSpeakers?: number;
    maxSpeakers?: number;
    model?: "precision-1" | "precision-2" | "community-1";
    exclusive?: boolean;
  }
): Promise<string> {
  if (!PYANNOTE_API_KEY) {
    throw new Error("PYANNOTE_API_KEY não configurada");
  }

  console.log(`[Pyannote] Submetendo job de diarização para ${mediaUrl}...`);

  const body: Record<string, unknown> = {
    url: mediaUrl,
    model: options?.model || "precision-2",
    exclusive: options?.exclusive ?? true, // Usar exclusive para evitar overlaps
  };

  if (options?.numSpeakers) body.numSpeakers = options.numSpeakers;
  if (options?.minSpeakers) body.minSpeakers = options.minSpeakers;
  if (options?.maxSpeakers) body.maxSpeakers = options.maxSpeakers;

  const response = await fetch(`${PYANNOTE_API_URL}/diarize`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${PYANNOTE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erro ao submeter diarização: ${response.status} - ${error}`);
  }

  const result = await response.json();
  console.log(`[Pyannote] Job criado: ${result.jobId} (status: ${result.status})`);
  
  return result.jobId;
}

/**
 * Step 4: Verifica status do job
 */
export async function getJobResult(jobId: string): Promise<PyannoteJobResult> {
  if (!PYANNOTE_API_KEY) {
    throw new Error("PYANNOTE_API_KEY não configurada");
  }

  const response = await fetch(`${PYANNOTE_API_URL}/jobs/${jobId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${PYANNOTE_API_KEY}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erro ao verificar job: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Step 5: Aguarda conclusão do job (polling)
 */
export async function waitForDiarizationJob(
  jobId: string,
  maxWaitMs: number = 300000, // 5 minutos
  pollIntervalMs: number = 5000 // 5 segundos
): Promise<PyannoteDiarizationSegment[]> {
  console.log(`[Pyannote] Aguardando resultado do job ${jobId}...`);
  
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const result = await getJobResult(jobId);
    
    console.log(`[Pyannote] Status: ${result.status}`);

    if (result.status === "succeeded") {
      // Preferir exclusiveDiarization se disponível (sem overlaps)
      const diarization = result.output?.exclusiveDiarization || result.output?.diarization || [];
      console.log(`[Pyannote] Diarização concluída: ${diarization.length} segmentos`);
      return diarization;
    }

    if (result.status === "failed") {
      throw new Error(`Job de diarização falhou: ${result.output?.error || "Erro desconhecido"}`);
    }

    if (result.status === "canceled") {
      throw new Error(`Job de diarização foi cancelado`);
    }

    // Aguardar antes do próximo poll
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Timeout aguardando diarização: ${jobId}`);
}

/**
 * Step 6: Faz merge da diarização com os segmentos de transcrição
 * 
 * Alinha os segmentos de transcrição (Whisper) com a diarização (Pyannote)
 * baseado na sobreposição de timestamps
 */
export function mergeDiarizationWithTranscription(
  diarization: PyannoteDiarizationSegment[],
  transcriptionSegments: Array<{
    id: string;
    startTime: number;
    endTime: number;
    text: string;
    confidence?: number;
  }>
): SpeakerAnalysisResult {
  console.log(`[Pyannote] Fazendo merge de ${diarization.length} segmentos de diarização com ${transcriptionSegments.length} segmentos de transcrição...`);

  // Identificar speakers únicos
  const uniqueSpeakers = [...new Set(diarization.map(d => d.speaker))].sort();
  
  const speakers = uniqueSpeakers.map((speakerId, index) => ({
    id: speakerId,
    name: `Pessoa ${index + 1}`,
    confidence: 0.95,
  }));

  // Para cada segmento de transcrição, encontrar o speaker com maior sobreposição
  const diarized_transcript = transcriptionSegments.map(segment => {
    let bestSpeaker = uniqueSpeakers[0] || "SPEAKER_00";
    let maxOverlap = 0;

    for (const diarSeg of diarization) {
      // Calcular sobreposição
      const overlapStart = Math.max(segment.startTime, diarSeg.start);
      const overlapEnd = Math.min(segment.endTime, diarSeg.end);
      const overlap = Math.max(0, overlapEnd - overlapStart);

      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestSpeaker = diarSeg.speaker;
      }
    }

    const speaker = speakers.find(s => s.id === bestSpeaker);

    return {
      segmentId: segment.id,
      speaker_id: bestSpeaker,
      speaker_name: speaker?.name || null,
      text: segment.text,
      start_time: segment.startTime,
      end_time: segment.endTime,
    };
  });

  console.log(`[Pyannote] Merge concluído: ${speakers.length} speakers identificados`);

  return {
    speakers,
    diarized_transcript,
    analysis_confidence: 0.95,
  };
}

/**
 * Função principal: Processa áudio com Pyannote para diarização
 * 
 * @param audioBuffer - Buffer do áudio
 * @param transcriptionId - ID único para o arquivo
 * @param transcriptionSegments - Segmentos já transcritos pelo Whisper
 */
export async function analyzeSpeakersWithPyannote(
  audioBuffer: Buffer,
  transcriptionId: string,
  transcriptionSegments: Array<{
    id: string;
    startTime: number;
    endTime: number;
    text: string;
    confidence?: number;
  }>,
  options?: {
    numSpeakers?: number;
    minSpeakers?: number;
    maxSpeakers?: number;
  }
): Promise<SpeakerAnalysisResult> {
  // 1. Upload do áudio
  const objectKey = `transcription-${transcriptionId}-${Date.now()}`;
  const mediaUrl = await uploadAudioToPyannote(audioBuffer, objectKey);

  // 2. Submeter diarização
  const jobId = await submitDiarizationJob(mediaUrl, {
    ...options,
    exclusive: true, // Sem overlaps para facilitar merge
  });

  // 3. Aguardar resultado
  const diarization = await waitForDiarizationJob(jobId);

  // 4. Fazer merge com transcrição
  return mergeDiarizationWithTranscription(diarization, transcriptionSegments);
}

/**
 * Verifica se o usuário tem quota de diarização disponível
 */
export function checkDiarizationQuota(
  usedMinutes: number,
  limitMinutes: number,
  audioDurationMinutes: number
): { allowed: boolean; remainingMinutes: number; message?: string } {
  const remainingMinutes = limitMinutes - usedMinutes;
  
  if (audioDurationMinutes > remainingMinutes) {
    return {
      allowed: false,
      remainingMinutes,
      message: `Limite de diarização excedido. Restam ${remainingMinutes.toFixed(1)} minutos, mas o áudio tem ${audioDurationMinutes.toFixed(1)} minutos.`,
    };
  }

  return {
    allowed: true,
    remainingMinutes: remainingMinutes - audioDurationMinutes,
  };
}
