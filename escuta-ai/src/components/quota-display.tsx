"use client";

import { useEffect, useState } from "react";
import { formatMinutes } from "@/lib/utils";

interface QuotaData {
  limit: number;
  used: number;
  remaining: number;
  totalTranscriptions: number;
  resetDate: string;
}

export function QuotaDisplay() {
  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/quota")
      .then((res) => res.json())
      .then(setQuota)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-20 rounded-xl" />
    );
  }

  if (!quota) return null;

  const percentage = (quota.used / quota.limit) * 100;
  const resetDate = new Date(quota.resetDate).toLocaleDateString("pt-BR");

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800 dark:text-white">
          Sua Quota Mensal
        </h3>
        <span className="text-sm text-gray-500">
          Renova em {resetDate}
        </span>
      </div>

      {/* Barra de progresso */}
      <div className="relative h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`absolute h-full transition-all duration-500 ${
            percentage > 90
              ? "bg-red-500"
              : percentage > 70
                ? "bg-yellow-500"
                : "bg-green-500"
          }`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>

      <div className="flex justify-between mt-3 text-sm">
        <span className="text-gray-600 dark:text-gray-300">
          <strong>{formatMinutes(quota.used)}</strong> usados
        </span>
        <span className="text-gray-500">
          {formatMinutes(quota.remaining)} restantes
        </span>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
          </svg>
          <span>{quota.totalTranscriptions} transcrições realizadas</span>
        </div>
      </div>
    </div>
  );
}
