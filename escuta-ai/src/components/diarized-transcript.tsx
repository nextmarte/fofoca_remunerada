"use client";

import { useMemo } from "react";

interface Speaker {
  id: string;
  speakerId: string;
  name: string | null;
  characteristics?: Record<string, unknown>;
  confidence?: number;
}

interface DiarizedSegment {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  speakerId?: string;
  speaker_name?: string;
  confidence?: number;
}

interface DiarizedTranscriptProps {
  segments: DiarizedSegment[];
  speakers: Speaker[];
}

const SPEAKER_COLORS = [
  "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200",
  "bg-green-50 border-green-200 text-green-900 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
  "bg-purple-50 border-purple-200 text-purple-900 dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-200",
  "bg-orange-50 border-orange-200 text-orange-900 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-200",
  "bg-pink-50 border-pink-200 text-pink-900 dark:bg-pink-900/20 dark:border-pink-800 dark:text-pink-200",
  "bg-indigo-50 border-indigo-200 text-indigo-900 dark:bg-indigo-900/20 dark:border-indigo-800 dark:text-indigo-200",
];

function getSpeakerColor(index: number): string {
  return SPEAKER_COLORS[index % SPEAKER_COLORS.length];
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function DiarizedTranscript({
  segments,
  speakers,
}: DiarizedTranscriptProps) {
  // Mapear speaker_id para índice para cor consistente
  const speakerIndexMap = useMemo(() => {
    const map = new Map<string | undefined, number>();
    let index = 0;
    for (const segment of segments) {
      if (
        segment.speakerId &&
        !map.has(segment.speakerId) &&
        map.size < SPEAKER_COLORS.length
      ) {
        map.set(segment.speakerId, index);
        index++;
      }
    }
    return map;
  }, [segments]);

  if (segments.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        Nenhum segmento de transcrição disponível
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Legenda de speakers */}
      {speakers.length > 0 && (
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Interlocutores Identificados
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {speakers.map((speaker, idx) => (
              <div
                key={speaker.id}
                className={`p-2 rounded border ${getSpeakerColor(idx)} text-sm`}
              >
                <div className="font-semibold">
                  {speaker.name || speaker.speakerId}
                </div>
                {speaker.confidence && (
                  <div className="text-xs opacity-75">
                    Confiança: {Math.round(speaker.confidence * 100)}%
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transcrição em formato de chat */}
      <div className="space-y-2 bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        {segments.map((segment) => {
          const speakerIndex = speakerIndexMap.get(segment.speakerId) ?? 0;
          const speaker = speakers.find((s) => s.speakerId === segment.speakerId);
          const speakerName = speaker?.name || segment.speakerId || "Desconhecido";
          const colorClass = getSpeakerColor(speakerIndex);

          return (
            <div key={segment.id} className="flex gap-3 items-start">
              {/* Timestamp */}
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 w-12 flex-shrink-0 text-right">
                {formatTime(segment.startTime)}
              </div>
              
              {/* Message bubble */}
              <div className="flex-1">
                <div className={`inline-block max-w-[85%] rounded-lg px-4 py-2 border ${colorClass}`}>
                  <div className="font-semibold text-sm mb-1">
                    {speakerName}
                  </div>
                  <p className="text-sm leading-relaxed">
                    {segment.text}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
