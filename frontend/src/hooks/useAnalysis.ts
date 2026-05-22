"use client";

// ─── Deep Insight AI — useAnalysis Polling Hook ───────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { getAnalysisStatus } from "@/lib/api";
import type { JobResponse } from "@/lib/types";

const POLL_INTERVAL_MS = 2000;

interface UseAnalysisReturn {
  data: JobResponse | null;
  error: string | null;
  isLoading: boolean;
  retry: () => void;
}

export function useAnalysis(jobId: string | null): UseAnalysisReturn {
  const [data, setData] = useState<JobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Try to load cached data immediately to prevent flash
    if (jobId) {
      try {
        const cached = localStorage.getItem(`deep_insight_job_${jobId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.status === "completed") {
            setData(parsed);
            setIsLoading(false);
          }
        }
      } catch (e) {}
    }
  }, [jobId]);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    if (!jobId) return;
    try {
      const res = await getAnalysisStatus(jobId);
      setData(res);
      setError(null);
      setIsLoading(false);

      if (res.status === "completed" || res.status === "failed") {
        if (res.status === "completed") {
          try {
            localStorage.setItem(`deep_insight_job_${jobId}`, JSON.stringify(res));
          } catch (e) {}
        }
        stopPolling();
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(message);
      setIsLoading(false);
    }
  }, [jobId, stopPolling]);

  const retry = useCallback(() => {
    setError(null);
    setIsLoading(true);
    stopPolling();
    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);
  }, [poll, stopPolling]);

  useEffect(() => {
    if (!jobId) return;
    
    // If we already loaded completed cache, skip polling
    if (data?.status === "completed") return;

    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return stopPolling;
  }, [jobId, poll, stopPolling, data?.status]);

  return { data, error, isLoading, retry };
}
