"use client";

import { useState } from "react";

interface CancelTranscriptionButtonProps {
  transcriptionId: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
  onCancelled?: () => void;
}

export function CancelTranscriptionButton({
  transcriptionId,
  status,
  onCancelled,
}: CancelTranscriptionButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  // Apenas mostrar botão se está PENDING ou PROCESSING
  if (status !== "PENDING" && status !== "PROCESSING") {
    return null;
  }

  const handleCancel = async () => {
    if (!confirm("Tem certeza que deseja cancelar esta transcrição?")) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/transcription/${transcriptionId}/cancel`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        const error = await response.json();
        alert(`Erro: ${error.error || "Erro ao cancelar transcrição"}`);
        throw new Error(error.error || "Erro ao cancelar transcrição");
      }

      alert("Transcrição cancelada com sucesso");
      onCancelled?.();
    } catch (error) {
      console.error("Erro ao cancelar:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleCancel}
      disabled={isLoading}
      className="px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      title="Cancelar transcrição"
    >
      {isLoading ? "Cancelando..." : "Cancelar"}
    </button>
  );
}
