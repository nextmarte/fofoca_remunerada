"use client";

import { useEffect, useState } from "react";
import { TranscriptionList } from "@/components/transcription-list";

interface Transcription {
  id: string;
  title: string | null;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  duration: number | null;
  language: string | null;
  wordCount: number | null;
  createdAt: string;
  completedAt: string | null;
}

export default function HistoryPage() {
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTranscriptions = async () => {
    try {
      const res = await fetch("/api/transcriptions");
      const data = await res.json();
      setTranscriptions(data);
    } catch (error) {
      console.error("Erro ao buscar transcrições:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTranscriptions();

    // Atualizar a cada 5 segundos se houver transcrições pendentes
    const interval = setInterval(() => {
      if (
        transcriptions.some(
          (t) => t.status === "PENDING" || t.status === "PROCESSING"
        )
      ) {
        fetchTranscriptions();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [transcriptions]);

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta transcrição?")) return;

    try {
      const res = await fetch(`/api/transcription/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setTranscriptions((prev) => prev.filter((t) => t.id !== id));
      }
    } catch (error) {
      console.error("Erro ao excluir transcrição:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Histórico de Transcrições
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Acesse suas transcrições anteriores
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse bg-gray-200 dark:bg-gray-700 h-24 rounded-xl"
            />
          ))}
        </div>
      ) : (
        <TranscriptionList
          transcriptions={transcriptions}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
