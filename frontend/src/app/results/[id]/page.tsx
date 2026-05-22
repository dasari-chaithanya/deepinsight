"use client";

import { use } from "react";
import Header from "@/components/Header";
import BackgroundEffect from "@/components/BackgroundEffect";
import ProcessingView from "@/components/ProcessingView";
import ResultsView from "@/components/ResultsView";
import ErrorDisplay from "@/components/ErrorDisplay";
import { useAnalysis } from "@/hooks/useAnalysis";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

export default function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const { data, error, isLoading, retry } = useAnalysis(resolvedParams.id);

  return (
    <>
      <BackgroundEffect />
      <Header />

      <main className="min-h-screen px-6 pt-24">
        {isLoading && !data && (
          <div className="flex min-h-[50vh] items-center justify-center">
            <motion.div
              className="h-10 w-10 rounded-full border-2 border-white/10 border-t-violet-500"
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
            />
          </div>
        )}

        {error && !data && (
          <div className="flex min-h-[50vh] items-center justify-center">
            <ErrorDisplay message={error} onRetry={retry} />
          </div>
        )}

        {data && data.status === "failed" && (
          <div className="flex min-h-[50vh] flex-col items-center justify-center space-y-6">
            <ErrorDisplay 
              message={data.error || "Processing failed"} 
              onRetry={() => router.push("/")} 
            />
          </div>
        )}

        {data && data.status !== "completed" && data.status !== "failed" && (
          <div className="pt-12">
            <ProcessingView data={data} />
          </div>
        )}

        {data && data.status === "completed" && (
          <ResultsView data={data} />
        )}
      </main>
    </>
  );
}
