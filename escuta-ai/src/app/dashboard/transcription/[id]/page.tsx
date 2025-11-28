"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDate, formatDuration } from "@/lib/utils";

interface Segment {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
}

interface TranscriptionData {
  id: string;
  title: string | null;
  text: string | null;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  duration: number | null;
  language: string | null;
  wordCount: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  segments: Segment[];
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
  const [copied, setCopied] = useState(false);

  const fetchTranscription = async () => {
    try {
      const res = await fetch(`/api/transcription/${id}`);
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
    }

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${transcription.title || "transcricao"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
          <div className="flex gap-2">
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
