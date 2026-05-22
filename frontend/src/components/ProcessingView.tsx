"use client";

// ─── Deep Insight AI — Processing View ────────────────────────────────────────

import { motion } from "framer-motion";
import type { JobResponse } from "@/lib/types";

const STAGES = [
  { key: "queued", label: "Validating", icon: "⏳" },
  { key: "metadata", label: "Extracting Metadata", icon: "🔍" },
  { key: "downloading", label: "Downloading Audio", icon: "⬇️" },
  { key: "transcribing", label: "Transcribing", icon: "🎙️" },
  { key: "analyzing", label: "Analyzing with AI", icon: "🧠" },
  { key: "completed", label: "Complete", icon: "✅" },
];

function getStageIndex(progress: number): number {
  if (progress <= 5) return 0;
  if (progress <= 20) return 1;
  if (progress <= 35) return 2;
  if (progress <= 55) return 3;
  if (progress <= 90) return 4;
  return 5;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatViews(views: number | null): string {
  if (!views) return "";
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M views`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K views`;
  return `${views} views`;
}

interface ProcessingViewProps {
  data: JobResponse;
}

export default function ProcessingView({ data }: ProcessingViewProps) {
  const currentStage = getStageIndex(data.progress);

  return (
    <div className="mx-auto max-w-2xl">
      {/* Progress bar */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-10"
      >
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="text-white/50">Processing…</span>
          <span className="font-mono text-violet-400">{data.progress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-teal-400"
            initial={{ width: 0 }}
            animate={{ width: `${data.progress}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
        <p className="mt-2 text-sm text-white/40">{data.progress_message}</p>
      </motion.div>

      {/* Pipeline stages */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="glass mb-10 rounded-2xl p-6"
      >
        <div className="space-y-4">
          {STAGES.map((stage, i) => {
            const isActive = i === currentStage;
            const isDone = i < currentStage;

            return (
              <motion.div
                key={stage.key}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * i }}
                className="flex items-center gap-4"
              >
                {/* Status indicator */}
                <div className="relative flex h-8 w-8 items-center justify-center">
                  {isDone ? (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/20 text-teal-400"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    </motion.div>
                  ) : isActive ? (
                    <div className="relative flex h-8 w-8 items-center justify-center">
                      <motion.div
                        className="absolute inset-0 rounded-full border-2 border-violet-500/40"
                        animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                      <div className="h-3 w-3 rounded-full bg-violet-500 shadow-lg shadow-violet-500/40" />
                    </div>
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.04]">
                      <div className="h-2 w-2 rounded-full bg-white/20" />
                    </div>
                  )}
                </div>

                {/* Label */}
                <div className="flex items-center gap-2">
                  <span className="text-base">{stage.icon}</span>
                  <span
                    className={`text-sm font-medium transition-colors ${
                      isDone
                        ? "text-white/60"
                        : isActive
                        ? "text-white/90"
                        : "text-white/25"
                    }`}
                  >
                    {stage.label}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Metadata card (shown once available) */}
      {data.metadata && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="glass rounded-2xl p-5"
        >
          <div className="flex gap-5">
            {data.metadata.thumbnail && (
              <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded-xl bg-white/[0.04]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={data.metadata.thumbnail}
                  alt={data.metadata.title}
                  className="h-full w-full object-cover"
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h3 className="font-outfit mb-1 truncate text-base font-semibold text-white/90">
                {data.metadata.title}
              </h3>
              <p className="mb-2 text-sm text-white/40">{data.metadata.channel}</p>
              <div className="flex flex-wrap gap-3 text-xs text-white/30">
                {data.metadata.duration > 0 && (
                  <span>{formatDuration(data.metadata.duration)}</span>
                )}
                {data.metadata.view_count && (
                  <span>{formatViews(data.metadata.view_count)}</span>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Animated spinner */}
      <div className="mt-10 flex justify-center">
        <motion.div
          className="h-10 w-10 rounded-full border-2 border-white/10 border-t-violet-500"
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
        />
      </div>
    </div>
  );
}
