import OpenAI from "openai";

// Cliente Nebius Token Factory (compatível com OpenAI API)
export const nebius = new OpenAI({
  baseURL: "https://api.tokenfactory.nebius.com/v1/",
  apiKey: process.env.NEBIUS_API_KEY,
});

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
  analysis_notes?: string;
}

// Função principal para análise de speakers com LLM
export async function analyzeSpeakersWithLLM(
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

  // Formatar transcrição para análise com mais contexto
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
      (seg) => `[${seg.index}] ${seg.time} (conf: ${seg.confidence.toFixed(2)}): ${seg.text}`
    )
    .join("\n");

  // Análise pré-processada de padrões
  const segmentCount = transcriptionSegments.length;
  const avgSegmentLength = transcriptionSegments.reduce((a, b) => a + b.text.length, 0) / segmentCount;

  const systemPrompt = `Você é um especialista em análise de transcrições de áudio e identificação de interlocutores.
Sua tarefa é identificar os interlocutores em uma transcrição.

INSTRUÇÕES:
1. Identifique os interlocutores (geralmente 1 ou 2 pessoas)
2. Atribua nomes genéricos como "Pessoa 1" e "Pessoa 2" (ou Entrevistador/Entrevistado se claro)
3. Associe cada segmento de texto ao seu interlocutor

IMPORTANTE:
- Retorne APENAS JSON válido
- Todos os segmentos DEVEM ter uma atribuição de speaker`;

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

  try {
    console.log(`[Nebius] Tentando modelo: zai-org/GLM-4.5`);
    const response = await nebius.chat.completions.create({
      model: "zai-org/GLM-4.5",
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
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 32000,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from Nebius API");
    }

    // Extrair JSON da resposta (com múltiplas tentativas)
    let analysisData;
    try {
      // Remove markdown code blocks se existirem
      const cleanContent = content
        .replace(/^```json\s*\n?/, '')
        .replace(/^```\s*\n?/, '')
        .replace(/\n?```$/, '')
        .trim();

      // Procurar por JSON completo entre chaves
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      let jsonStr = jsonMatch[0];

      // Tentar parse direto
      try {
        analysisData = JSON.parse(jsonStr);
      } catch {
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

    if (!analysisData.speaker_assignments || !Array.isArray(analysisData.speaker_assignments)) {
      throw new Error("Invalid response structure: missing speaker_assignments");
    }

    // Validar que todos os segmentos têm atribuição
    const assignedIndices = new Set(
      (analysisData.speaker_assignments as Array<{segment_index: number; speaker_id: string}>).map((a) => a.segment_index)
    );
    const missingIndices = [];
    for (let i = 0; i < transcriptionSegments.length; i++) {
      if (!assignedIndices.has(i)) {
        missingIndices.push(i);
      }
    }

    // Se houver segmentos não atribuídos, atribuir para o speaker mais recente
    if (missingIndices.length > 0) {
      console.warn(`${missingIndices.length} segmentos sem atribuição, preenchendo...`);
      let lastSpeakerId = "Speaker_1";
      
      for (const idx of missingIndices) {
        // Encontrar o speaker mais próximo anterior
        for (let j = idx - 1; j >= 0; j--) {
          const prevAssignment = (analysisData.speaker_assignments as Array<{segment_index: number; speaker_id: string}>).find(
            (a) => a.segment_index === j
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

    // Construir resultado diarizado
    const diarized_transcript = transcriptionSegments.map(
      (seg, index) => {
        const assignment = (analysisData.speaker_assignments as Array<{segment_index: number; speaker_id: string}> | undefined)?.find(
          (a) => a.segment_index === index
        );
        const speakerId = assignment?.speaker_id || "Speaker_1";
        const speaker = (analysisData.speakers as Array<{id: string; name: string | null}> | undefined)?.find(
          (s) => s.id === speakerId
        );

        return {
          segmentId: seg.id,
          speaker_id: speakerId,
          speaker_name: speaker?.name || null,
          text: seg.text,
          start_time: seg.startTime,
          end_time: seg.endTime,
        };
      }
    );

    return {
      speakers: analysisData.speakers || [],
      diarized_transcript,
      analysis_confidence: analysisData.analysis_confidence || 0.7,
      analysis_notes: analysisData.analysis_notes || undefined,
    };
  } catch (error) {
    console.error("Error analyzing speakers with Nebius LLM:", error);
    
    // Log específico para erro 404
    if (error instanceof Error && error.message.includes('404')) {
      console.error(
        "[Nebius] ERRO 404: Modelo 'zai-org/GLM-4.5' não encontrado.",
        "Verifique se o nome está correto ou teste modelos alternativos."
      );
    }
    
    // Fallback: usar heurística simples para detectar mudanças de falante
    console.log("[Fallback] Usando heurística simples de diarização...");
    
    const speakers: Array<{ id: string; name: null; characteristics: Record<string, unknown>; confidence: number }> = [];
    const assignments: Array<{ segment_index: number; speaker_id: string }> = [];
    let currentSpeakerId = "Speaker_1";
    speakers.push({ id: "Speaker_1", name: null, characteristics: {}, confidence: 0.4 });

    transcriptionSegments.forEach((seg, idx) => {
      // Heurística: se o segmento é muito diferente do anterior, pode ser novo falante
      const shouldSwitch =
        idx > 0 &&
        (
          // Mudança abrupta de comprimento (resposta curta após texto longo)
          (seg.text.length < 30 && transcriptionSegments[idx - 1].text.length > 100) ||
          // Pergunta seguida por resposta
          (/\?$/.test(transcriptionSegments[idx - 1].text) && idx % 2 === 0) ||
          // Mudança de tom (todas maiúsculas vs minúsculas)
          (/^[A-Z\s]+$/.test(seg.text) && !/^[A-Z\s]+$/.test(transcriptionSegments[idx - 1].text)) ||
          // Início com interjection (Ah, Ok, Sim, Então)
          /^(ah|ok|sim|então|certo|exato|verdade|claro|entendo|hm+|uau|wow)/i.test(seg.text)
        );

      if (shouldSwitch && speakers.length < 2) {
        currentSpeakerId = `Speaker_${speakers.length + 1}`;
        speakers.push({
          id: currentSpeakerId,
          name: null,
          characteristics: {},
          confidence: 0.3,
        });
      }

      assignments.push({
        segment_index: idx,
        speaker_id: currentSpeakerId,
      });
    });

    const diarized_transcript = transcriptionSegments.map((seg, index) => {
      // Procurar o assignment correto para este índice
      const assignment = assignments.find(a => a.segment_index === index);
      const speakerId = assignment?.speaker_id || "Speaker_1";
      
      return {
        segmentId: seg.id,  // CRÍTICO: Necessário para o worker atualizar os segmentos
        speaker_id: speakerId,  // Usar o speaker_id correto do assignment
        speaker_name: null,
        text: seg.text,
        start_time: seg.startTime,
        end_time: seg.endTime,
      };
    });

    return {
      speakers,
      diarized_transcript,
      analysis_confidence: 0.4,
      analysis_notes: "Fallback: heurística simples (LLM falhou)",
    };
  }
}

// Função auxiliar para formatar tempo
function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}
