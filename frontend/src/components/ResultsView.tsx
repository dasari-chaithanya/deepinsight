"use client";

import { motion } from "framer-motion";
import type { JobResponse, TimelineSection } from "@/lib/types";
import PDFExport from "./PDFExport";
import { useState, useEffect, useRef, useMemo, useCallback, ReactNode } from "react";
import { startAnalysis } from "@/lib/api";
import { useRouter } from "next/navigation";

// ─── Utilities ───────────────────────────────────────────────────────────────

/** Parse transcript text into timestamped blocks for rendering */
function parseTranscriptBlocks(raw: string): { timestamp: string; text: string }[] {
  if (!raw) return [];

  // Match patterns like [00:12 - 00:15] or [0:12] or timestamps at line start
  const regex = /\[(\d{1,2}:\d{2}(?:\s*-\s*\d{1,2}:\d{2})?)\]\s*/g;
  const blocks: { timestamp: string; text: string }[] = [];
  let lastIndex = 0;
  let lastTimestamp = "";
  let match: RegExpExecArray | null;

  while ((match = regex.exec(raw)) !== null) {
    if (lastIndex > 0 || lastTimestamp) {
      const text = raw.slice(lastIndex, match.index).trim();
      if (text) blocks.push({ timestamp: lastTimestamp, text });
    }
    lastTimestamp = match[1];
    lastIndex = match.index + match[0].length;
  }
  const remaining = raw.slice(lastIndex).trim();
  if (remaining && (blocks.length > 0 || lastTimestamp)) {
    blocks.push({ timestamp: lastTimestamp || "", text: remaining });
  }

  // If we found timestamped blocks, return them
  if (blocks.length > 0) return blocks;

  // ─── Fallback: plain text without timestamp markers ───────────────
  // First try splitting by double newlines
  const paragraphs = raw.split(/\n\n+/).filter((s) => s.trim());
  if (paragraphs.length > 1) {
    return paragraphs.map((text) => ({ timestamp: "", text: text.trim() }));
  }

  // If it's one big blob, split into chunks of ~3-4 sentences
  const sentences = raw.split(/(?<=[.!?])\s+/);
  const SENTENCES_PER_BLOCK = 3;
  const result: { timestamp: string; text: string }[] = [];

  for (let i = 0; i < sentences.length; i += SENTENCES_PER_BLOCK) {
    const chunk = sentences.slice(i, i + SENTENCES_PER_BLOCK).join(" ").trim();
    if (chunk) {
      result.push({ timestamp: "", text: chunk });
    }
  }

  return result.length > 0 ? result : [{ timestamp: "", text: raw.trim() }];
}

/** Check if an array has meaningful content */
function hasContent(arr: unknown[] | undefined | null): boolean {
  return Array.isArray(arr) && arr.length > 0;
}

/** Safe array accessor */
function safeArr<T>(arr: T[] | undefined | null): T[] {
  return Array.isArray(arr) ? arr : [];
}

/** Escape regex special chars for search highlighting */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionWrapper({
  id,
  children,
  className = "",
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-28 ${className}`}>
      {children}
    </section>
  );
}

function SectionHeading({ children, icon }: { children: ReactNode; icon?: string }) {
  return (
    <h3 className="font-outfit text-xl font-bold text-white/90 mb-6 flex items-center gap-3">
      {icon && <span className="text-lg">{icon}</span>}
      {children}
    </h3>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface ResultsViewProps {
  data: JobResponse;
}

export default function ResultsView({ data }: ResultsViewProps) {
  const result = data.result;
  const router = useRouter();

  // State
  const [mode, setMode] = useState<"workspace" | "reading">("workspace");
  const [activeTimelineIdx, setActiveTimelineIdx] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [highlightedTranscriptIdx, setHighlightedTranscriptIdx] = useState<number | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Refs
  const timelineSectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const transcriptBlockRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Derived data
  const timeline = useMemo(() => safeArr(result?.timeline), [result?.timeline]);
  const knowledgeNotes = result?.knowledge_notes;
  const revisionNotes = useMemo(() => safeArr(result?.quick_revision_notes), [result?.quick_revision_notes]);
  const detailedSummary = result?.detailed_summary || "";

  const transcriptBlocks = useMemo(
    () => parseTranscriptBlocks(data.transcript || ""),
    [data.transcript]
  );

  // Build navigation items from actual page sections
  const navSections = useMemo(() => {
    const sections: { id: string; label: string; icon: string }[] = [];
    if (detailedSummary) sections.push({ id: "sec-summary", label: "Detailed Summary", icon: "📝" });
    sections.push({ id: "sec-overview", label: "Overview", icon: "📖" });
    if (hasContent(knowledgeNotes?.core_concepts)) sections.push({ id: "sec-concepts", label: "Core Concepts", icon: "🎯" });
    if (hasContent(knowledgeNotes?.key_insights)) sections.push({ id: "sec-insights", label: "Key Insights", icon: "✦" });
    if (hasContent(knowledgeNotes?.actionable_takeaways)) sections.push({ id: "sec-takeaways", label: "Takeaways", icon: "⚡" });
    if (hasContent(knowledgeNotes?.important_quotes)) sections.push({ id: "sec-quotes", label: "Quotes", icon: "💬" });
    if (hasContent(knowledgeNotes?.technical_terms)) sections.push({ id: "sec-glossary", label: "Glossary", icon: "📚" });
    if (timeline.length > 0) sections.push({ id: "sec-timeline", label: "Timeline", icon: "🕐" });
    if (transcriptBlocks.length > 0) sections.push({ id: "sec-transcript", label: "Transcript", icon: "📄" });
    return sections;
  }, [detailedSummary, knowledgeNotes, timeline, transcriptBlocks]);

  // ─── Scroll spy for timeline sections ──────────────────────────────────────
  useEffect(() => {
    if (timeline.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute("data-timeline-idx"));
            if (!isNaN(idx)) setActiveTimelineIdx(idx);
          }
        }
      },
      { rootMargin: "-15% 0px -65% 0px", threshold: 0 }
    );

    timelineSectionRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [timeline]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleReanalyze = async () => {
    if (!data.video_url) return;
    setIsReanalyzing(true);
    try {
      const res = await startAnalysis(data.video_url);
      router.push(`/results/${res.job_id}`);
    } catch (err) {
      console.error(err);
      setIsReanalyzing(false);
    }
  };

  const scrollToTimelineSection = useCallback((idx: number) => {
    timelineSectionRefs.current[idx]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    setActiveTimelineIdx(idx);
    setMobileNavOpen(false);
  }, []);

  const scrollToNavSection = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    setMobileNavOpen(false);
  }, []);

  /** Clicking a timeline item → highlight + scroll to matching transcript block */
  const handleTimelineTranscriptSync = useCallback(
    (timelineIdx: number) => {
      scrollToTimelineSection(timelineIdx);

      // Try to find transcript block whose timestamp matches
      const section = timeline[timelineIdx];
      if (!section || transcriptBlocks.length === 0) return;

      const targetTs = section.timestamp?.replace(/\s/g, "");
      const matchIdx = transcriptBlocks.findIndex((b) =>
        b.timestamp.replace(/\s/g, "").startsWith(targetTs?.split("-")[0] || "NOMATCH")
      );

      if (matchIdx >= 0) {
        setHighlightedTranscriptIdx(matchIdx);
        if (showTranscript) {
          setTimeout(() => {
            transcriptBlockRefs.current[matchIdx]?.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
          }, 100);
        }
        // Clear highlight after 3s
        setTimeout(() => setHighlightedTranscriptIdx(null), 3000);
      }
    },
    [timeline, transcriptBlocks, showTranscript, scrollToTimelineSection]
  );

  const highlightText = useCallback(
    (text: string, query: string): ReactNode => {
      if (!query || query.length < 2) return text;
      try {
        const parts = text.split(new RegExp(`(${escapeRegex(query)})`, "gi"));
        return parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={i} className="bg-amber-400/30 text-amber-200 rounded px-0.5">
              {part}
            </mark>
          ) : (
            part
          )
        );
      } catch {
        return text;
      }
    },
    []
  );

  // ─── Guard: no result ──────────────────────────────────────────────────────

  if (!result) return null;

  // ─── Guard: legacy schema ──────────────────────────────────────────────────

  if (!result.timeline && !result.knowledge_notes) {
    return (
      <div className="mx-auto max-w-2xl py-32 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/5 border border-white/10 mb-6 text-2xl">
          ⚠️
        </div>
        <h2 className="text-2xl font-bold text-white mb-4">Legacy Analysis Detected</h2>
        <p className="text-white/60 mb-8 leading-relaxed">
          This video was analyzed with an older pipeline. Click below to upgrade.
        </p>
        <button
          onClick={handleReanalyze}
          disabled={isReanalyzing}
          className="rounded-xl bg-violet-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
        >
          {isReanalyzing ? "Upgrading…" : "Upgrade & Re-Analyze"}
        </button>
      </div>
    );
  }

  // ─── Formatters ────────────────────────────────────────────────────────────

  const durationStr = data.metadata?.duration
    ? `${Math.floor(data.metadata.duration / 60)}:${String(Math.floor(data.metadata.duration % 60)).padStart(2, "0")}`
    : "";

  // ─── Render ────────────────────────────────────────────────────────────────

  const isReading = mode === "reading";

  return (
    <div className="mx-auto max-w-[1440px] pb-32 pt-6 px-2 sm:px-4">
      {/* ═══════════════════════════════════════════════════════════════════
          VIDEO CONTEXT HEADER
          ═══════════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex flex-col gap-5 md:flex-row md:items-start md:justify-between rounded-2xl bg-white/[0.02] border border-white/5 p-5 sm:p-6 backdrop-blur-md"
      >
        <div className="flex flex-col sm:flex-row gap-5 items-start min-w-0">
          {data.metadata?.thumbnail && (
            <div className="relative overflow-hidden rounded-xl w-full sm:w-44 aspect-video flex-shrink-0 border border-white/10 shadow-lg">
              <img src={data.metadata.thumbnail} alt="" className="object-cover w-full h-full" />
              {durationStr && (
                <div className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-2 py-0.5 text-[11px] font-mono font-bold text-white">
                  {durationStr}
                </div>
              )}
            </div>
          )}
          <div className="flex flex-col gap-1.5 min-w-0">
            <h1 className="font-outfit text-xl sm:text-2xl font-bold text-white leading-tight line-clamp-2">
              {data.metadata?.title || "Video Analysis"}
            </h1>
            <div className="flex flex-wrap items-center gap-2.5 text-sm text-white/45">
              {data.metadata?.channel && <span>{data.metadata.channel}</span>}
              {data.metadata?.channel && <span className="text-white/20">·</span>}
              <span>Analyzed {new Date(data.completed_at || Date.now()).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
          {/* Mode toggle */}
          <div className="flex rounded-lg border border-white/10 bg-black/30 p-0.5">
            <button
              onClick={() => setMode("workspace")}
              className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
                !isReading ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/70"
              }`}
            >
              Workspace
            </button>
            <button
              onClick={() => setMode("reading")}
              className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
                isReading ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/70"
              }`}
            >
              Reading
            </button>
          </div>
          <PDFExport data={data} />
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════════
          MOBILE NAV TOGGLE
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="lg:hidden mb-4">
        <button
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white/70"
        >
          <span>📍 Navigation</span>
          <svg
            className={`w-4 h-4 transition-transform ${mobileNavOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {mobileNavOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-2 rounded-xl border border-white/10 bg-[#0c0c14] p-4 space-y-2"
          >
            {navSections.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollToNavSection(s.id)}
                className="flex items-center gap-3 w-full text-left px-3 py-2 rounded-lg text-sm text-white/60 hover:bg-white/5 hover:text-white/90 transition-colors"
              >
                <span>{s.icon}</span>
                <span>{s.label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          MAIN LAYOUT
          ═══════════════════════════════════════════════════════════════════ */}
      <div
        className={
          isReading
            ? "max-w-3xl mx-auto"
            : "flex flex-col lg:flex-row lg:items-start gap-8"
        }
      >
        {/* ─── LEFT SIDEBAR (Workspace mode, desktop) ─────────────────── */}
        {!isReading && (
          <aside className="hidden lg:block w-72 xl:w-80 flex-shrink-0 lg:sticky lg:top-24 space-y-5 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2 scrollbar-thin">
            {/* Page navigation */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
              <h3 className="font-outfit text-sm font-bold text-white/50 mb-4 uppercase tracking-wider">
                Navigate
              </h3>
              <nav className="space-y-1">
                {navSections.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => scrollToNavSection(s.id)}
                    className="flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-sm text-white/55 hover:bg-white/5 hover:text-white/90 transition-colors"
                  >
                    <span className="text-xs">{s.icon}</span>
                    <span>{s.label}</span>
                  </button>
                ))}
              </nav>
            </div>

            {/* Timeline nav */}
            {timeline.length > 0 && (
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                <h3 className="font-outfit text-sm font-bold text-white/50 mb-4 uppercase tracking-wider">
                  Timeline
                </h3>
                <div className="relative pl-4 space-y-4">
                  <div className="absolute left-[7px] top-1 bottom-1 w-px bg-gradient-to-b from-violet-500/30 via-white/5 to-transparent" />
                  {timeline.map((section, i) => (
                    <button
                      key={i}
                      onClick={() => handleTimelineTranscriptSync(i)}
                      className="relative w-full text-left group pl-4"
                    >
                      <div
                        className={`absolute left-[-8px] top-1 h-2 w-2 rounded-full border-[1.5px] transition-all ${
                          activeTimelineIdx === i
                            ? "border-violet-400 bg-violet-400 shadow-[0_0_8px_rgba(139,92,246,0.6)]"
                            : "border-white/20 bg-[#0a0a0f] group-hover:border-violet-400/40"
                        }`}
                      />
                      <div
                        className={`font-mono text-[10px] font-bold mb-0.5 transition-colors ${
                          activeTimelineIdx === i ? "text-violet-400" : "text-white/30"
                        }`}
                      >
                        {section.timestamp}
                      </div>
                      <div
                        className={`text-xs font-medium leading-snug transition-colors ${
                          activeTimelineIdx === i
                            ? "text-white"
                            : "text-white/50 group-hover:text-white/75"
                        }`}
                      >
                        {section.title}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick revision */}
            {revisionNotes.length > 0 && (
              <div className="rounded-2xl border border-violet-500/15 bg-violet-500/[0.03] p-5 relative overflow-hidden">
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-violet-500/10 blur-2xl" />
                <h3 className="font-outfit text-xs font-bold text-violet-300/80 mb-3 uppercase tracking-wider">
                  ⚡ Quick Review
                </h3>
                <ul className="space-y-2.5">
                  {revisionNotes.map((bullet, i) => (
                    <li key={i} className="flex gap-2.5 text-white/65 text-[11px] leading-relaxed">
                      <span className="mt-[5px] flex h-1 w-1 shrink-0 rounded-full bg-violet-400/40" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        )}

        {/* ─── MAIN CONTENT ───────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 space-y-10">
          {/* ── Detailed Summary ──────────────────────────────────────── */}
          {detailedSummary && (
            <SectionWrapper id="sec-summary">
              <div className="rounded-2xl bg-teal-500/[0.04] border border-teal-500/15 p-6 sm:p-8">
                <SectionHeading icon="📝">Detailed Summary</SectionHeading>
                <div className="text-white/75 text-[15px] sm:text-base leading-[1.8] space-y-4">
                  {detailedSummary.split(/\n\n+/).map((p: string, i: number) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </div>
            </SectionWrapper>
          )}
          {/* ── Overview ──────────────────────────────────────────────── */}
          <SectionWrapper id="sec-overview">
            <div className="space-y-3">
              <h2 className="font-outfit text-2xl sm:text-3xl font-bold text-white leading-tight">
                {knowledgeNotes?.main_topic || data.metadata?.title || "Analysis"}
              </h2>
              {knowledgeNotes?.final_summary && (
                <p className="text-base sm:text-lg text-white/60 leading-relaxed max-w-3xl">
                  {knowledgeNotes.final_summary}
                </p>
              )}
            </div>
          </SectionWrapper>

          {/* ── Core Concepts + Key Insights ───────────────────────────── */}
          {(hasContent(knowledgeNotes?.core_concepts) || hasContent(knowledgeNotes?.key_insights)) && (
            <div className={`grid gap-6 ${hasContent(knowledgeNotes?.core_concepts) && hasContent(knowledgeNotes?.key_insights) ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
              {hasContent(knowledgeNotes?.core_concepts) && (
                <SectionWrapper id="sec-concepts">
                  <div className="rounded-2xl border border-white/5 bg-white/[0.015] p-6 sm:p-7 h-full">
                    <SectionHeading icon="🎯">Core Concepts</SectionHeading>
                    <ul className="space-y-3.5">
                      {safeArr(knowledgeNotes?.core_concepts).map((c, i) => (
                        <li key={i} className="flex gap-3 text-white/75 text-sm leading-relaxed">
                          <span className="mt-[7px] flex h-1.5 w-1.5 shrink-0 rounded-full bg-teal-400/50" />
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </SectionWrapper>
              )}

              {hasContent(knowledgeNotes?.key_insights) && (
                <SectionWrapper id="sec-insights">
                  <div className="rounded-2xl border border-white/5 bg-white/[0.015] p-6 sm:p-7 h-full">
                    <SectionHeading icon="✦">Key Insights</SectionHeading>
                    <ul className="space-y-3.5">
                      {safeArr(knowledgeNotes?.key_insights).map((ins, i) => (
                        <li key={i} className="flex gap-3 text-white/75 text-sm leading-relaxed">
                          <span className="mt-[7px] flex h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400/50" />
                          <span>{ins}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </SectionWrapper>
              )}
            </div>
          )}

          {/* ── Actionable Takeaways ───────────────────────────────────── */}
          {hasContent(knowledgeNotes?.actionable_takeaways) && (
            <SectionWrapper id="sec-takeaways">
              <SectionHeading icon="⚡">Actionable Takeaways</SectionHeading>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {safeArr(knowledgeNotes?.actionable_takeaways).map((t, i) => (
                  <div
                    key={i}
                    className="rounded-xl bg-gradient-to-br from-white/[0.04] to-transparent border border-white/[0.06] p-5 hover:border-white/10 transition-colors"
                  >
                    <span className="text-2xl font-black text-white/[0.06] mb-2 block font-mono">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <p className="text-sm text-white/70 leading-relaxed">{t}</p>
                  </div>
                ))}
              </div>
            </SectionWrapper>
          )}

          {/* ── Quotes ────────────────────────────────────────────────── */}
          {hasContent(knowledgeNotes?.important_quotes) && (
            <SectionWrapper id="sec-quotes">
              <div className="rounded-2xl bg-violet-500/[0.03] border border-violet-500/15 p-6 sm:p-8">
                <SectionHeading icon="💬">Notable Quotes</SectionHeading>
                <div className="space-y-5">
                  {safeArr(knowledgeNotes?.important_quotes).map((q, i) => (
                    <blockquote
                      key={i}
                      className="text-base sm:text-lg italic text-white/60 border-l-[3px] border-violet-500/40 pl-5 leading-relaxed"
                    >
                      &ldquo;{q}&rdquo;
                    </blockquote>
                  ))}
                </div>
              </div>
            </SectionWrapper>
          )}

          {/* ── Glossary / Technical Terms ─────────────────────────────── */}
          {hasContent(knowledgeNotes?.technical_terms) && (
            <SectionWrapper id="sec-glossary">
              <SectionHeading icon="📚">Glossary</SectionHeading>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {safeArr(knowledgeNotes?.technical_terms).map((t, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-white/5 bg-white/[0.015] p-5 hover:border-teal-500/20 transition-colors"
                  >
                    <h4 className="font-semibold text-teal-300 text-sm mb-1.5">{t.term}</h4>
                    <p className="text-xs text-white/50 leading-relaxed">{t.definition}</p>
                  </div>
                ))}
              </div>
            </SectionWrapper>
          )}

          {/* ═══════════════════════════════════════════════════════════
              TIMELINE DEEP DIVE
              ═══════════════════════════════════════════════════════════ */}
          {timeline.length > 0 && (
            <SectionWrapper id="sec-timeline">
              <div className="border-t border-white/[0.06] pt-10">
                <SectionHeading icon="🕐">Video Timeline</SectionHeading>
                <div className="space-y-10 mt-6">
                  {timeline.map((section, i) => (
                    <div
                      key={i}
                      ref={(el) => {
                        timelineSectionRefs.current[i] = el;
                      }}
                      data-timeline-idx={i}
                      className="scroll-mt-28 group"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-violet-400 bg-violet-400/10 px-3 py-1 rounded-full">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
                          </svg>
                          {section.timestamp}
                        </span>
                        {section.speaker && (
                          <span className="text-[11px] font-medium text-white/30 uppercase tracking-wider bg-white/[0.03] px-2 py-0.5 rounded">
                            {section.speaker}
                          </span>
                        )}
                      </div>
                      <h4 className="font-outfit text-lg sm:text-xl font-bold text-white/85 mb-3 leading-snug">
                        {section.title}
                      </h4>
                      <p className="text-sm sm:text-[15px] text-white/55 leading-[1.8] max-w-3xl">
                        {section.explanation}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </SectionWrapper>
          )}

          {/* ═══════════════════════════════════════════════════════════
              TRANSCRIPT
              ═══════════════════════════════════════════════════════════ */}
          {transcriptBlocks.length > 0 && (
            <SectionWrapper id="sec-transcript">
              <div className="border-t border-white/[0.06] pt-10">
                <div className="flex items-center justify-between mb-6">
                  <SectionHeading icon="📝">Full Transcript</SectionHeading>
                  <button
                    onClick={() => setShowTranscript(!showTranscript)}
                    className="text-xs font-semibold text-violet-400 hover:text-violet-300 transition-colors px-3 py-1.5 rounded-lg border border-violet-500/20 hover:border-violet-500/40 bg-violet-500/[0.05]"
                  >
                    {showTranscript ? "Collapse" : "Expand"}
                  </button>
                </div>

                {showTranscript && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-white/5 bg-[#080810] overflow-hidden"
                  >
                    {/* Search bar */}
                    <div className="p-3 sm:p-4 border-b border-white/5 bg-white/[0.015]">
                      <div className="relative max-w-sm">
                        <svg
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                        <input
                          type="text"
                          placeholder="Search transcript…"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-black/30 border border-white/[0.06] rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-white/25 focus:outline-none focus:border-violet-500/40 transition-colors"
                        />
                      </div>
                    </div>

                    {/* Transcript blocks */}
                    <div className="p-4 sm:p-6 max-h-[65vh] overflow-y-auto space-y-1">
                      {transcriptBlocks.map((block, i) => {
                        const isHighlighted = highlightedTranscriptIdx === i;
                        const matchesSearch =
                          searchQuery.length >= 2 &&
                          block.text.toLowerCase().includes(searchQuery.toLowerCase());

                        return (
                          <div
                            key={i}
                            ref={(el) => {
                              transcriptBlockRefs.current[i] = el;
                            }}
                            className={`group flex gap-3 sm:gap-4 rounded-lg px-3 py-2 transition-all ${
                              isHighlighted
                                ? "bg-violet-500/10 border border-violet-500/20"
                                : matchesSearch
                                ? "bg-amber-500/[0.06] border border-amber-500/10"
                                : "border border-transparent hover:bg-white/[0.02]"
                            }`}
                          >
                            {block.timestamp && (
                              <span className="flex-shrink-0 font-mono text-[10px] font-bold text-white/25 pt-0.5 min-w-[50px] text-right select-none">
                                {block.timestamp}
                              </span>
                            )}
                            <p className="text-xs sm:text-[13px] text-white/50 leading-[1.7] group-hover:text-white/65 transition-colors">
                              {highlightText(block.text, searchQuery)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </div>
            </SectionWrapper>
          )}

          {/* ── Reading mode: Revision Notes at bottom ─────────────────── */}
          {isReading && revisionNotes.length > 0 && (
            <div className="border-t border-white/[0.06] pt-10">
              <div className="rounded-2xl border border-violet-500/15 bg-violet-500/[0.03] p-6 sm:p-8">
                <SectionHeading icon="⚡">Quick Revision Notes</SectionHeading>
                <ul className="space-y-3 columns-1 sm:columns-2 gap-8">
                  {revisionNotes.map((b, i) => (
                    <li key={i} className="flex gap-3 text-sm text-white/70 leading-relaxed break-inside-avoid mb-3">
                      <span className="mt-[6px] flex h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400/40" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
