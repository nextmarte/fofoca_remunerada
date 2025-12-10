"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";

interface UploadFormProps {
  onUploadComplete: (file: File) => Promise<void> | void;
}

export function UploadForm({ onUploadComplete }: UploadFormProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const allowedTypes = useMemo(() => [
    "audio/mp3",
    "audio/mpeg",
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a",
    "audio/wav",
    "audio/webm",
    "audio/ogg",
    "video/mp4",
    "video/webm",
  ], []);

  // Proteger contra fechamento/navegação durante upload
  useEffect(() => {
    if (!uploading) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [uploading]);

  const validateFileType = useCallback((type: string): boolean => {
    // Aceitar tipos exatos
    if (allowedTypes.includes(type)) return true;
    
    // Aceitar por extensão se type estiver vazio ou genérico
    if (!type || type === "application/octet-stream") return false;
    
    return false;
  }, [allowedTypes]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const validateAndSetFile = useCallback((file: File) => {
    // Validar tipo - também aceitar por extensão
    const isValidType = validateFileType(file.type) || 
      /\.(mp3|mp4|m4a|wav|webm|ogg|flac)$/i.test(file.name);
    
    if (!isValidType) {
      alert(
        "Formato não suportado. Use: MP3, WAV, M4A, WEBM, OGG ou MP4"
      );
      return;
    }

    // Validar tamanho (500MB)
    if (file.size > 500 * 1024 * 1024) {
      alert("Arquivo muito grande. Limite de 500MB");
      return;
    }

    setSelectedFile(file);
  }, [validateFileType]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (uploading) return;
    const files = e.target.files;
    if (files && files.length > 0) {
      validateAndSetFile(files[0]);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (uploading) return;
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      validateAndSetFile(files[0]);
    }
  }, [validateAndSetFile, uploading]);

  const handleSubmit = async () => {
    // Prevenir duplo submit
    if (!selectedFile || uploading || isSubmitting) {
      console.warn("[UploadForm] Submit bloqueado - uploading:", uploading, "isSubmitting:", isSubmitting);
      return;
    }

    console.log("[UploadForm] Iniciando submit...");
    setIsSubmitting(true);
    setUploading(true);
    setUploadProgress(0);

    try {
      await onUploadComplete(selectedFile);
      setSelectedFile(null);
      console.log("[UploadForm] ✅ Submit concluído");
    } catch (error) {
      console.error("[UploadForm] ❌ Erro no upload:", error);
    } finally {
      setIsSubmitting(false);
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div className="w-full max-w-xl">
      {/* Drop zone */}
      <div
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
          isDragging
            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
            : "border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,video/mp4,video/webm"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-blue-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>

          <div>
            <p className="text-lg font-medium text-gray-700 dark:text-gray-200">
              Arraste um arquivo de áudio aqui
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              ou clique para selecionar
            </p>
          </div>

          <p className="text-xs text-gray-400">
            MP3, WAV, M4A, WEBM, OGG, MP4 • Máx. 500MB
          </p>
        </div>
      </div>

      {/* Arquivo selecionado */}
      {selectedFile && (
        <div className="mt-6 p-4 bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-blue-500"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800 dark:text-white truncate">
                {selectedFile.name}
              </p>
              <p className="text-sm text-gray-500">
                {formatFileSize(selectedFile.size)}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedFile(null);
              }}
              disabled={uploading}
              className="p-2 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>
          
          {/* Barra de progresso durante upload */}
          {uploading && (
            <div className="mt-4">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                <span>Enviando...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-2 transition-all duration-300 animate-pulse"
                  style={{ width: `${uploadProgress || 10}%` }}
                />
              </div>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={uploading || isSubmitting}
            className="w-full mt-4 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-blue-400"
          >
            {uploading || isSubmitting ? "Enviando..." : "Iniciar Transcrição"}
          </button>
        </div>
      )}
    </div>
  );
}
