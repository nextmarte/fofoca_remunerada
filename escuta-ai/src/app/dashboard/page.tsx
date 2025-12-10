"use client";

import { useState, useRef, useEffect } from "react";
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
  const uploadingRef = useRef(false);

  // Debug: detectar remontagem do componente
  useEffect(() => {
    console.log("[Dashboard] Componente montado");
    return () => {
      console.log("[Dashboard] Componente desmontado - uploading:", uploadingRef.current);
      if (uploadingRef.current) {
        console.error("[Dashboard] ⚠️ COMPONENTE DESMONTADO DURANTE UPLOAD!");
      }
    };
  }, []);

  const handleUpload = async (file: File | Blob, customTitle?: string) => {
    // Prevenir duplo submit
    if (uploadingRef.current) {
      console.warn("[Dashboard] ⚠️ Upload já em andamento, ignorando duplicata");
      return;
    }

    uploadingRef.current = true;
    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("audio", file);
      formData.append("title", customTitle || title || "Nova Transcrição");

      console.log(`[Dashboard] Iniciando upload de ${(file.size / 1024 / 1024).toFixed(2)}MB...`);

      const controller = new AbortController();
      const timeout = setTimeout(() => {
        console.error("[Dashboard] ⏱️ Timeout de 5 minutos excedido!");
        controller.abort();
      }, 300000); // 5 minutos

      let res: Response;
      try {
        res = await fetch("/api/transcription", {
          method: "POST",
          body: formData,
          signal: controller.signal,
          keepalive: true, // Manter conexão viva durante HMR
        });
      } catch (fetchError) {
        clearTimeout(timeout);
        throw fetchError;
      }

      clearTimeout(timeout);

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erro ao enviar áudio");
        setUploading(false);
        return;
      }

      // Upload bem-sucedido, manter loading e navegar
      console.log("[Dashboard] ✅ Upload concluído, redirecionando...");
      router.push(`/dashboard/transcription/${data.transcriptionId}`);
    } catch (error: unknown) {
      console.error("[Dashboard] ❌ Erro no upload:", error);
      
      // Verificar tipo específico de erro
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          setError("Upload cancelado: tempo limite excedido (5 minutos).");
        } else if (error.message.includes('ECONNRESET') || error.message.includes('aborted')) {
          setError("Conexão perdida durante upload. O arquivo pode ser muito grande. Tente novamente.");
        } else {
          setError(`Erro ao enviar áudio: ${error.message}`);
        }
      } else {
        setError("Erro ao enviar áudio. Tente novamente.");
      }
      
      uploadingRef.current = false;
      setUploading(false);
    }
  };

  const handleRecordingComplete = (blob: Blob) => {
    handleUpload(blob, title || `Gravação ${new Date().toLocaleDateString("pt-BR")}`);
  };

  const handleFileUpload = async (file: File) => {
    await handleUpload(file, title || file.name.replace(/\.[^/.]+$/, ""));
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
            disabled={uploading}
            placeholder="Ex: Reunião de equipe, Aula de história..."
            className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab("record")}
            disabled={uploading}
            className={`flex-1 py-4 text-center font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              activeTab === "record"
                ? "text-blue-500 border-b-2 border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            🎙️ Gravar Áudio
          </button>
          <button
            onClick={() => setActiveTab("upload")}
            disabled={uploading}
            className={`flex-1 py-4 text-center font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
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
