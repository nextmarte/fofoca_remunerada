"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AudioRecorder } from "@/components/audio-recorder";
import { UploadForm } from "@/components/upload-form";
import { QuotaDisplay } from "@/components/quota-display";

type Tab = "record" | "upload";

export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("record");
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleUpload = async (file: File | Blob, customTitle?: string) => {
    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("audio", file);
      formData.append("title", customTitle || title || "Nova Transcrição");

      const res = await fetch("/api/transcription", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erro ao enviar áudio");
        return;
      }

      // Redirecionar para a página da transcrição
      router.push(`/dashboard/transcription/${data.transcriptionId}`);
    } catch {
      setError("Erro ao enviar áudio. Tente novamente.");
    } finally {
      setUploading(false);
    }
  };

  const handleRecordingComplete = (blob: Blob) => {
    handleUpload(blob, title || `Gravação ${new Date().toLocaleDateString("pt-BR")}`);
  };

  const handleFileUpload = (file: File) => {
    handleUpload(file, title || file.name.replace(/\.[^/.]+$/, ""));
  };

  return (
    <div className="space-y-8">
      {/* Quota */}
      <QuotaDisplay />

      {/* Nova Transcrição */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Nova Transcrição
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Grave ou faça upload de um áudio para transcrever
          </p>
        </div>

        {/* Título */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Título (opcional)
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Reunião de equipe, Aula de história..."
            className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
          />
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab("record")}
            className={`flex-1 py-4 text-center font-medium transition-colors ${
              activeTab === "record"
                ? "text-blue-500 border-b-2 border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            🎙️ Gravar Áudio
          </button>
          <button
            onClick={() => setActiveTab("upload")}
            className={`flex-1 py-4 text-center font-medium transition-colors ${
              activeTab === "upload"
                ? "text-blue-500 border-b-2 border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            📤 Fazer Upload
          </button>
        </div>

        {/* Content */}
        <div className="p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-center">
              {error}
            </div>
          )}

          {uploading ? (
            <div className="flex flex-col items-center gap-4 py-12">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-600 dark:text-gray-300">
                Enviando áudio para transcrição...
              </p>
            </div>
          ) : activeTab === "record" ? (
            <div className="flex justify-center">
              <AudioRecorder
                onRecordingComplete={handleRecordingComplete}
                maxDuration={3600}
              />
            </div>
          ) : (
            <div className="flex justify-center">
              <UploadForm onUploadComplete={handleFileUpload} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
