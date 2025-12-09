"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDate, formatDuration } from "@/lib/utils";
import { DiarizedTranscript } from "@/components/diarized-transcript";

interface Segment {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  speakerId?: string;
  speaker_name?: string;
}

interface Speaker {
  id: string;
  speakerId: string;
  name: string;
  characteristics?: Record<string, unknown>;
  confidence?: number;
}

interface TranscriptionData {
  id: string;
  title: string | null;
  text: string | null;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
  duration: number | null;
  language: string | null;
  wordCount: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  segments: Segment[];
  speakers?: Speaker[];
  diarized_segments?: Segment[];
}

export default function TranscriptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [transcription, setTranscription] = useState<TranscriptionData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [showDiarization, setShowDiarization] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessMessage, setReprocessMessage] = useState("");
  const [selectedLLM, setSelectedLLM] = useState<"openai" | "nebius">(
    "openai"
  );
  const [showLLMSelector, setShowLLMSelector] = useState(false);

  const fetchTranscription = async () => {
    try {
      const res = await fetch(`/api/transcription-with-speakers/${id}`);
      if (!res.ok) {
        router.push("/dashboard/history");
        return;
      }
      const data = await res.json();
      setTranscription(data);
    } catch (error) {
      console.error("Erro ao buscar transcrição:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTranscription();
  }, [id]);

  // Polling para transcrições em andamento
  useEffect(() => {
    if (
      transcription?.status === "PENDING" ||
      transcription?.status === "PROCESSING"
    ) {
      const interval = setInterval(fetchTranscription, 3000);
      return () => clearInterval(interval);
    }
  }, [transcription?.status]);

  const copyToClipboard = async () => {
    if (!transcription?.text) return;

    let textToCopy = transcription.text;

    if (showTimestamps && transcription.segments.length > 0) {
      textToCopy = transcription.segments
        .map(
          (seg) =>
            `[${formatDuration(seg.startTime)}] ${seg.text}`
        )
        .join("\n");
    } else if (showDiarization && transcription.diarized_segments?.length) {
      textToCopy = transcription.diarized_segments
        .map(
          (seg) =>
            `[${formatDuration(seg.startTime)}] **${seg.speaker_name}**: ${seg.text}`
        )
        .join("\n");
    }

    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadAsText = () => {
    if (!transcription?.text) return;

    let content = transcription.text;

    if (showTimestamps && transcription.segments.length > 0) {
      content = transcription.segments
        .map(
          (seg) =>
            `[${formatDuration(seg.startTime)}] ${seg.text}`
        )
        .join("\n");
    } else if (showDiarization && transcription.diarized_segments?.length) {
      content = transcription.diarized_segments
        .map(
          (seg) =>
            `[${formatDuration(seg.startTime)}] **${seg.speaker_name}**: ${seg.text}`
        )
        .join("\n");
    }

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${transcription.title || "transcricao"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReprocessSpeakers = async () => {
    try {
      setReprocessing(true);
      setReprocessMessage("Iniciando reprocessamento...");

      const res = await fetch("/api/reprocess-speakers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcriptionId: id,
          llmProvider: selectedLLM,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        setReprocessMessage(
          error.error || "Erro ao reprocessar speakers"
        );
        return;
      }

      setReprocessMessage(
        `Reprocessamento iniciado com ${selectedLLM === "openai" ? "OpenAI GPT-4o" : "Nebius Qwen3"}! Atualizando em breve...`
      );

      // Aguardar um pouco e depois fazer polling
      setTimeout(() => {
        setReprocessMessage("");
        const interval = setInterval(() => {
          fetchTranscription().then(() => {
            // Parar de fazer polling depois de ter dados atualizados
            clearInterval(interval);
          });
        }, 2000);

        // Limpar interval após 60 segundos
        setTimeout(() => clearInterval(interval), 60000);
      }, 1500);
    } catch (error) {
      console.error("Erro:", error);
      setReprocessMessage("Erro ao reprocessar speakers");
    } finally {
      setReprocessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!transcription) {
    return null;
  }

  const isProcessing =
    transcription.status === "PENDING" ||
    transcription.status === "PROCESSING";

  const hasSpeakers =
    transcription.speakers && transcription.speakers.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/dashboard/history"
            className="text-blue-500 hover:text-blue-600 text-sm font-medium mb-2 inline-flex items-center gap-1"
          >
            ← Voltar ao histórico
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {transcription.title || "Transcrição"}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {formatDate(transcription.createdAt)}
            {transcription.duration && (
              <> • {formatDuration(transcription.duration)}</>
            )}
            {transcription.language && (
              <> • {transcription.language.toUpperCase()}</>
            )}
          </p>
        </div>

        {transcription.status === "COMPLETED" && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={copyToClipboard}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
            >
              {copied ? "✓ Copiado!" : "📋 Copiar"}
            </button>
            <button
              onClick={downloadAsText}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              ⬇️ Baixar TXT
            </button>
            {hasSpeakers && (
              <div className="relative">
                <button
                  onClick={() => setShowLLMSelector(!showLLMSelector)}
                  disabled={reprocessing}
                  className="px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  {reprocessing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Reprocessando...
                    </>
                  ) : (
                    <>
                      🔄 Reprocessar Speakers
                    </>
                  )}
                </button>

                {showLLMSelector && !reprocessing && (
                  <div className="absolute top-full right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 z-50 w-64">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">
                      Escolha o modelo de IA:
                    </p>
                    <div className="space-y-2">
                      <button
                        onClick={() => {
                          setSelectedLLM("openai");
                          handleReprocessSpeakers();
                          setShowLLMSelector(false);
                        }}
                        className="w-full text-left px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                      >
                        <p className="font-medium text-blue-900 dark:text-blue-100">
                          🤖 OpenAI GPT-4o
                        </p>
                        <p className="text-xs text-blue-700 dark:text-blue-300">
                          Rápido e confiável
                        </p>
                      </button>

                      <button
                        onClick={() => {
                          setSelectedLLM("nebius");
                          handleReprocessSpeakers();
                          setShowLLMSelector(false);
                        }}
                        className="w-full text-left px-3 py-2 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg text-sm hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors"
                      >
                        <p className="font-medium text-purple-900 dark:text-purple-100">
                          🧠 Nebius Qwen3-235B
                        </p>
                        <p className="text-xs text-purple-700 dark:text-purple-300">
                          Maior modelo, mais preciso
                        </p>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status */}
      {isProcessing && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <div>
              <h3 className="font-semibold text-blue-800 dark:text-blue-200">
                {transcription.status === "PENDING"
                  ? "Aguardando processamento..."
                  : "Transcrevendo áudio..."}
              </h3>
              <p className="text-blue-600 dark:text-blue-300 text-sm">
                Isso pode levar alguns minutos dependendo do tamanho do áudio
              </p>
            </div>
          </div>
        </div>
      )}

      {transcription.status === "FAILED" && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
          <h3 className="font-semibold text-red-800 dark:text-red-200 mb-2">
            ❌ Erro na transcrição
          </h3>
          <p className="text-red-600 dark:text-red-300">
            {transcription.errorMessage || "Ocorreu um erro ao processar o áudio"}
          </p>
        </div>
      )}

      {transcription.status === "CANCELLED" && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-6">
          <h3 className="font-semibold text-yellow-800 dark:text-yellow-200">
            ⏹️ Transcrição cancelada
          </h3>
          <p className="text-yellow-600 dark:text-yellow-300 text-sm mt-1">
            O processamento foi cancelado pelo usuário
          </p>
        </div>
      )}

      {reprocessMessage && (
        <div className={`rounded-xl p-6 ${
          reprocessMessage.includes("Erro")
            ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
            : "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
        }`}>
          <p className={`text-sm font-medium ${
            reprocessMessage.includes("Erro")
              ? "text-red-700 dark:text-red-200"
              : "text-blue-700 dark:text-blue-200"
          }`}>
            {reprocessMessage}
          </p>
        </div>
      )}

      {/* Diarized Transcript (if speakers are available) */}
      {transcription.status === "COMPLETED" &&
        hasSpeakers &&
        transcription.diarized_segments && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showDiarization}
                  onChange={(e) => setShowDiarization(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  Mostrar transcrição diarizada
                </span>
              </label>
            </div>

            {showDiarization && (
              <DiarizedTranscript
                speakers={transcription.speakers || []}
                segments={transcription.diarized_segments}
              />
            )}
          </div>
        )}

      {/* Transcription content */}
      {transcription.status === "COMPLETED" && transcription.text && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Toggle timestamps */}
          {transcription.segments.length > 0 && (
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {transcription.wordCount} palavras
              </span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTimestamps}
                  onChange={(e) => setShowTimestamps(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  Mostrar timestamps
                </span>
              </label>
            </div>
          )}

          <div className="p-6">
            {showTimestamps && transcription.segments.length > 0 ? (
              <div className="space-y-4">
                {transcription.segments.map((segment) => (
                  <div key={segment.id} className="flex gap-4">
                    <span className="text-xs font-mono text-gray-400 dark:text-gray-500 shrink-0 pt-1">
                      {formatDuration(segment.startTime)}
                    </span>
                    <p className="text-gray-800 dark:text-gray-200 leading-relaxed">
                      {segment.text}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                {transcription.text}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
