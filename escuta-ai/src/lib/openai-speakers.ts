import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Interface para resultado de análise de speakers
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

interface SpeakerAssignment {
  segment_index: number;
  speaker_id: string;
}

interface Speaker {
  id: string;
  name: string | null;
  confidence: number;
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

// Função auxiliar para processar chunks de segmentos
async function analyzeChunk(
  segments: Array<{
    id: string;
    startTime: number;
    endTime: number;
    text: string;
    confidence?: number;
  }>,
  transcriptionLanguage: string,
  existingSpeakers?: Array<{ id: string; name: string | null; confidence: number }>
): Promise<SpeakerAnalysisResult> {
  const formattedTranscription = segments
    .map((seg, idx) => `[${idx}] ${formatTime(seg.startTime)}-${formatTime(seg.endTime)}: ${seg.text}`)
    .join("\n");

  const speakerContext = existingSpeakers && existingSpeakers.length > 0
    ? `\n\nSpeakers já identificados:\n${existingSpeakers.map(s => `- ${s.id}: ${s.name || "Desconhecido"}`).join("\n")}\nUSE OS MESMOS IDs PARA OS SPEAKERS JÁ IDENTIFICADOS.`
    : "";

  const systemPrompt = `Você é um especialista em análise de transcrições de áudio e identificação de interlocutores.
Sua tarefa é identificar os interlocutores em uma transcrição.

INSTRUÇÕES:
1. Identifique os interlocutores (geralmente 1 ou 2 pessoas)
2. Atribua nomes genéricos como "Pessoa 1" e "Pessoa 2" (ou Entrevistador/Entrevistado se claro)
3. Associe cada segmento de texto ao seu interlocutor${speakerContext}

IMPORTANTE:
- Retorne APENAS JSON válido
- Todos os segmentos DEVEM ter uma atribuição de speaker`;

  const userPrompt = `Transcrição com ${segments.length} segmentos (${transcriptionLanguage})

TRANSCRIÇÃO:
${formattedTranscription}

RETORNE ESTE JSON:
{
  "speakers": [
    {
      "id": "Speaker_1",
      "name": "Pessoa 1",
      "confidence": 0.95
    },
    {
      "id": "Speaker_2",
      "name": "Pessoa 2",
      "confidence": 0.90
    }
  ],
  "speaker_assignments": [
    {"segment_index": 0, "speaker_id": "Speaker_1"},
    {"segment_index": 1, "speaker_id": "Speaker_2"}
  ],
  "analysis_confidence": 0.92
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 50000,
  });

  const content = response.choices[0].message.content;
  if (!content) {
    throw new Error("Empty response from OpenAI API");
  }

  const analysisData = JSON.parse(content);

  // Construir resultado
  const diarized_transcript = segments.map((seg, index) => {
    const assignment = (analysisData.speaker_assignments as SpeakerAssignment[] | undefined)?.find(
      (a) => a.segment_index === index
    );
    const speakerId = assignment?.speaker_id || "Speaker_1";
    const speaker = (analysisData.speakers as Speaker[] | undefined)?.find((s) => s.id === speakerId);

    return {
      segmentId: seg.id,
      speaker_id: speakerId,
      speaker_name: speaker?.name || null,
      text: seg.text,
      start_time: seg.startTime,
      end_time: seg.endTime,
    };
  });

  return {
    speakers: analysisData.speakers || [],
    diarized_transcript,
    analysis_confidence: analysisData.analysis_confidence || 0.85,
  };
}

// Função principal para análise de speakers com GPT-4o (com chunking)
export async function analyzeSpeakersWithOpenAI(
  transcriptionSegments: Array<{
    id: string;
    startTime: number;
    endTime: number;
    text: string;
    confidence?: number;
  }>,
  transcriptionLanguage: string = "pt-BR"
): Promise<SpeakerAnalysisResult> {
  if (transcriptionSegments.length === 0) {
    return {
      speakers: [],
      diarized_transcript: [],
      analysis_confidence: 0,
    };
  }

  const CHUNK_SIZE = 100; // Processar 100 segmentos por vez
  
  // Se for pequeno, processar tudo de uma vez
  if (transcriptionSegments.length <= CHUNK_SIZE) {
    return analyzeChunk(transcriptionSegments, transcriptionLanguage);
  }

  // Dividir em chunks
  console.log(`[OpenAI] Processando ${transcriptionSegments.length} segmentos em chunks de ${CHUNK_SIZE}...`);
  
  const chunks: Array<typeof transcriptionSegments> = [];
  for (let i = 0; i < transcriptionSegments.length; i += CHUNK_SIZE) {
    chunks.push(transcriptionSegments.slice(i, i + CHUNK_SIZE));
  }

  // Processar primeiro chunk para identificar speakers
  const firstResult = await analyzeChunk(chunks[0], transcriptionLanguage);
  
  const allSpeakers = new Map(firstResult.speakers.map(s => [s.id, s]));
  const allDiarizedTranscript = [...firstResult.diarized_transcript];

  // Processar chunks restantes usando speakers já identificados
  for (let i = 1; i < chunks.length; i++) {
    console.log(`[OpenAI] Processando chunk ${i + 1}/${chunks.length}...`);
    
    const chunkResult = await analyzeChunk(
      chunks[i],
      transcriptionLanguage,
      Array.from(allSpeakers.values())
    );

    // Consolidar speakers (pode haver novos speakers em chunks posteriores)
    for (const speaker of chunkResult.speakers) {
      if (!allSpeakers.has(speaker.id)) {
        allSpeakers.set(speaker.id, speaker);
      }
    }

    allDiarizedTranscript.push(...chunkResult.diarized_transcript);
  }

  console.log(`[OpenAI] Processamento completo: ${allSpeakers.size} speakers identificados`);

  return {
    speakers: Array.from(allSpeakers.values()),
    diarized_transcript: allDiarizedTranscript,
    analysis_confidence: 0.85,
  };
}
