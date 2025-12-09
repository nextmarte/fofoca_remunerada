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
    const response = await nebius.chat.completions.create({
      model: "Qwen/Qwen3-235B-A22B-Thinking-2507",
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
      temperature: 0.2, // Mais conservador
      max_tokens: 3000,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from Nebius API");
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

    if (!analysisData.speaker_assignments || !Array.isArray(analysisData.speaker_assignments)) {
      throw new Error("Invalid response structure: missing speaker_assignments");
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
      console.warn(`${missingIndices.length} segmentos sem atribuição, preenchendo...`);
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

    // Construir resultado diarizado
    const diarized_transcript = transcriptionSegments.map(
      (seg, index) => {
        const assignment = analysisData.speaker_assignments?.find(
          (a: any) => a.segment_index === index
        );
        const speakerId = assignment?.speaker_id || "Speaker_1";
        const speaker = analysisData.speakers?.find(
          (s: any) => s.id === speakerId
        );

        return {
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

      if (shouldSwitch && speakers.length < 5) {
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

    const diarized_transcript = transcriptionSegments.map((seg, index) => ({
      speaker_id: currentSpeakerId,
      speaker_name: null,
      text: seg.text,
      start_time: seg.startTime,
      end_time: seg.endTime,
    }));

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
