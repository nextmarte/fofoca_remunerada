import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Interface para resultado de análise de speakers
export interface SpeakerAnalysisResult {
  speakers: Array<{
    id: string;
    name: string | null;
    characteristics: Record<string, unknown>;
    confidence: number;
  }>;
  diarized_transcript: Array<{
    speaker_id: string;
    speaker_name: string | null;
    text: string;
    start_time: number;
    end_time: number;
  }>;
  analysis_confidence: number;
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

// Função principal para análise de speakers com GPT-4o
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

  // Formatar transcrição para análise
  const formattedTranscription = transcriptionSegments
    .map((seg, idx) => ({
      index: idx,
      time: `${formatTime(seg.startTime)}-${formatTime(seg.endTime)}`,
      text: seg.text,
      confidence: seg.confidence || 0.9,
      length: seg.text.length,
      hasQuestion: /\?$/.test(seg.text),
      hasExclamation: /!$/.test(seg.text),
      startsWithQuestion: /^(qual|quando|onde|quem|por quê|como|o quê|você|me|meu|minha)/i.test(seg.text),
    }))
    .map(
      (seg) =>
        `[${seg.index}] ${seg.time} (conf: ${seg.confidence.toFixed(2)}): ${seg.text}`
    )
    .join("\n");

  // Análise pré-processada de padrões
  const segmentCount = transcriptionSegments.length;
  const avgSegmentLength =
    transcriptionSegments.reduce((a, b) => a + b.text.length, 0) /
    segmentCount;

  const systemPrompt = `Você é um especialista em análise de transcrições de áudio e identificação de interlocutores.
Sua tarefa é identificar os interlocutores em uma transcrição de entrevista.

INSTRUÇÕES:
1. Identifique quantos interlocutores existem
2. Atribua nomes padronizados: "Entrevistador" e "Entrevistada", ou "Pessoa 1" / "Pessoa 2" caso não seja possível determinar o papel
3. Separe e rotule cada fala, reescrevendo a transcrição em formato organizado e limpo
4. Não resuma nada — apenas organize, rotule e padronize
5. Caso haja interrupções, ruídos ou perguntas encadeadas, mantenha as falas completas enquanto as atribui ao interlocutor correto

IMPORTANTE:
- Retorne APENAS JSON válido, sem explicações
- Todos os segmentos DEVEM ter uma atribuição de speaker
- Seja consistente: use os mesmos nomes de speakers em toda a resposta
- Se não conseguir determinar com certeza, prefira nomes genéricos (Pessoa 1, Pessoa 2, etc)`;

  const userPrompt = `Transcrição com ${segmentCount} segmentos (${transcriptionLanguage})
Comprimento médio: ${avgSegmentLength.toFixed(0)} caracteres/segmento

TRANSCRIÇÃO:
${formattedTranscription}

TAREFAS:
1. Identifique quantos interlocutores existem
2. Atribua nomes padronizados (Entrevistador/Entrevistada ou Pessoa 1/Pessoa 2)
3. Separe e rotule cada fala
4. Mantenha as falas completas
5. Organize de forma limpa e clara

RETORNE ESTE JSON:
{
  "speakers": [
    {
      "id": "Speaker_1",
      "name": "Entrevistador",
      "characteristics": {
        "role": "faz perguntas, conduz entrevista",
        "speech_pattern": "formal/casual",
        "vocabulary_level": "simples/técnico/formal"
      },
      "confidence": 0.95
    }
  ],
  "speaker_assignments": [
    {"segment_index": 0, "speaker_id": "Speaker_1"},
    {"segment_index": 1, "speaker_id": "Speaker_2"}
  ],
  "analysis_notes": "2 interlocutores identificados: Entrevistador e Entrevistada",
  "analysis_confidence": 0.92
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 3000,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from OpenAI API");
    }

    // Extrair JSON da resposta (com múltiplas tentativas)
    let analysisData;
    try {
      // Remove markdown code blocks se existirem
      let cleanContent = content
        .replace(/^```json\s*\n?/, '')
        .replace(/^```\s*\n?/, '')
        .replace(/\n?```$/, '')
        .trim();

      // Procurar por JSON completo entre chaves
      let jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      let jsonStr = jsonMatch[0];

      // Tentar parse direto
      try {
        analysisData = JSON.parse(jsonStr);
      } catch (e) {
        // Se falhar, tentar corrigir problemas comuns
        // Remove trailing commas
        jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
        // Remove comentários
        jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, '');
        // Remove quebras de linha indevidas dentro de strings
        analysisData = JSON.parse(jsonStr);
      }
    } catch (parseError) {
      console.error(
        "Could not parse JSON from response:",
        content.substring(0, 300)
      );
      throw new Error(
        `Invalid JSON response: ${parseError instanceof Error ? parseError.message : String(parseError)}`
      );
    }

    // Validar estrutura de resposta
    if (!analysisData.speakers || !Array.isArray(analysisData.speakers)) {
      throw new Error("Invalid response structure: missing speakers array");
    }

    if (
      !analysisData.speaker_assignments ||
      !Array.isArray(analysisData.speaker_assignments)
    ) {
      throw new Error(
        "Invalid response structure: missing speaker_assignments"
      );
    }

    // Validar que todos os segmentos têm atribuição
    const assignedIndices = new Set(
      analysisData.speaker_assignments.map((a: any) => a.segment_index)
    );
    const missingIndices = [];
    for (let i = 0; i < transcriptionSegments.length; i++) {
      if (!assignedIndices.has(i)) {
        missingIndices.push(i);
      }
    }

    // Se houver segmentos não atribuídos, atribuir para o speaker mais recente
    if (missingIndices.length > 0) {
      console.warn(
        `${missingIndices.length} segmentos sem atribuição, preenchendo...`
      );
      let lastSpeakerId = "Speaker_1";

      for (const idx of missingIndices) {
        // Encontrar o speaker mais próximo anterior
        for (let j = idx - 1; j >= 0; j--) {
          const prevAssignment = analysisData.speaker_assignments.find(
            (a: any) => a.segment_index === j
          );
          if (prevAssignment) {
            lastSpeakerId = prevAssignment.speaker_id;
            break;
          }
        }

        analysisData.speaker_assignments.push({
          segment_index: idx,
          speaker_id: lastSpeakerId,
        });
      }
    }

    // Construir diarized_transcript com informações dos speakers
    const diarized_transcript = analysisData.speaker_assignments.map(
      (assignment: any) => {
        const segment = transcriptionSegments[assignment.segment_index];
        const speaker = analysisData.speakers.find(
          (s: any) => s.id === assignment.speaker_id
        );

        return {
          speaker_id: assignment.speaker_id,
          speaker_name: speaker?.name || assignment.speaker_id,
          text: segment.text,
          start_time: segment.startTime,
          end_time: segment.endTime,
        };
      }
    );

    return {
      speakers: analysisData.speakers,
      diarized_transcript,
      analysis_confidence: analysisData.analysis_confidence || 0.85,
    };
  } catch (error) {
    console.error("Error analyzing speakers with OpenAI:", error);
    throw error;
  }
}
