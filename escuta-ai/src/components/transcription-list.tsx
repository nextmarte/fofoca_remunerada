"use client";

import Link from "next/link";
import { formatDate, formatDuration } from "@/lib/utils";
import { CancelTranscriptionButton } from "./cancel-transcription-button";

interface Transcription {
  id: string;
  title: string | null;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
  duration: number | null;
  language: string | null;
  wordCount: number | null;
  createdAt: string;
  completedAt: string | null;
}

interface TranscriptionListProps {
  transcriptions: Transcription[];
  onDelete?: (id: string) => void;
  onCancelled?: (id: string) => void;
}

const statusConfig = {
  PENDING: {
    label: "Aguardando",
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    icon: "⏳",
  },
  PROCESSING: {
    label: "Processando",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    icon: "🔄",
  },
  COMPLETED: {
    label: "Concluído",
    color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    icon: "✅",
  },
  FAILED: {
    label: "Erro",
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    icon: "❌",
  },
  CANCELLED: {
    label: "Cancelado",
    color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
    icon: "⊘",
  },
};

export function TranscriptionList({
  transcriptions,
  onDelete,
  onCancelled,
}: TranscriptionListProps) {
  if (transcriptions.length === 0) {
    return (
      <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-800 dark:text-white mb-2">
          Nenhuma transcrição ainda
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Grave ou faça upload de um áudio para começar
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {transcriptions.map((transcription) => {
        const status = statusConfig[transcription.status];

        return (
          <div
            key={transcription.id}
            className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <Link
                  href={`/dashboard/transcription/${transcription.id}`}
                  className="block"
                >
                  <h4 className="font-medium text-gray-800 dark:text-white truncate hover:text-blue-500 transition-colors">
                    {transcription.title || "Sem título"}
                  </h4>
                </Link>

                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-500 dark:text-gray-400">
                  <span>{formatDate(transcription.createdAt)}</span>

                  {transcription.duration && (
                    <>
                      <span>•</span>
                      <span>{formatDuration(transcription.duration)}</span>
                    </>
                  )}

                  {transcription.wordCount && (
                    <>
                      <span>•</span>
                      <span>{transcription.wordCount} palavras</span>
                    </>
                  )}

                  {transcription.language && (
                    <>
                      <span>•</span>
                      <span className="uppercase">{transcription.language}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${status.color}`}
                >
                  {status.icon} {status.label}
                </span>

                <CancelTranscriptionButton
                  transcriptionId={transcription.id}
                  status={transcription.status}
                  onCancelled={() => onCancelled?.(transcription.id)}
                />

                {onDelete && transcription.status !== "PROCESSING" && (
                  <button
                    onClick={() => onDelete(transcription.id)}
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                    title="Excluir"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
