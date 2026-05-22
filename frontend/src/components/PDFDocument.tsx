import React from "react";
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import type { JobResponse } from "@/lib/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeArr<T>(arr: T[] | undefined | null): T[] {
  return Array.isArray(arr) ? arr : [];
}

function hasContent(arr: unknown[] | undefined | null): boolean {
  return Array.isArray(arr) && arr.length > 0;
}

function parseTranscriptBlocks(raw: string): { timestamp: string; text: string }[] {
  if (!raw) return [];

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

  if (blocks.length > 0) return blocks;

  const paragraphs = raw.split(/\n\n+/).filter((s) => s.trim());
  if (paragraphs.length > 1) {
    return paragraphs.map((text) => ({ timestamp: "", text: text.trim() }));
  }

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

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#ffffff",
    paddingTop: 50,
    paddingBottom: 60,
    paddingHorizontal: 50,
    fontFamily: "Helvetica",
  },
  titlePageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  mainTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 16,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 40,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  metadataBox: {
    padding: 20,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    width: "80%",
  },
  metadataRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  metadataLabel: {
    width: 80,
    fontSize: 10,
    fontWeight: "bold",
    color: "#4b5563",
    textTransform: "uppercase",
  },
  metadataValue: {
    flex: 1,
    fontSize: 10,
    color: "#111827",
  },
  pageHeader: {
    position: "absolute",
    top: 25,
    left: 50,
    right: 50,
    fontSize: 9,
    color: "#9ca3af",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    paddingBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  pageFooter: {
    position: "absolute",
    bottom: 30,
    left: 50,
    right: 50,
    fontSize: 9,
    color: "#9ca3af",
    textAlign: "center",
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    paddingTop: 10,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: "#8b5cf6",
  },
  subSectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#4b5563",
    textTransform: "uppercase",
    marginBottom: 6,
    marginTop: 10,
  },
  text: {
    fontSize: 10,
    color: "#374151",
    lineHeight: 1.6,
    marginBottom: 6,
  },
  listItem: {
    flexDirection: "row",
    marginBottom: 5,
  },
  bullet: {
    width: 14,
    fontSize: 10,
    color: "#8b5cf6",
    fontWeight: "bold",
  },
  number: {
    width: 18,
    fontSize: 10,
    color: "#14b8a6",
    fontWeight: "bold",
  },
  listItemContent: {
    flex: 1,
    fontSize: 10,
    color: "#374151",
    lineHeight: 1.5,
  },
  quoteBox: {
    backgroundColor: "#f5f3ff",
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: "#8b5cf6",
    marginBottom: 10,
  },
  quoteText: {
    fontSize: 10,
    color: "#4c1d95",
    fontStyle: "italic",
    lineHeight: 1.5,
  },
  calloutBox: {
    backgroundColor: "#f0fdfa",
    padding: 10,
    borderWidth: 1,
    borderColor: "#ccfbf1",
    borderRadius: 6,
    marginBottom: 12,
  },
  timelineRow: {
    flexDirection: "row",
    marginBottom: 10,
  },
  timelineTime: {
    width: 45,
    fontSize: 9,
    fontWeight: "bold",
    color: "#8b5cf6",
    marginTop: 2,
  },
  timelineContent: {
    flex: 1,
    paddingLeft: 10,
    borderLeftWidth: 1,
    borderLeftColor: "#e5e7eb",
  },
  timelineTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 3,
  },
  timelineDesc: {
    fontSize: 9,
    color: "#4b5563",
    lineHeight: 1.5,
  },
  defItem: {
    marginBottom: 6,
  },
  defTerm: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#111827",
  },
  defDesc: {
    fontSize: 10,
    color: "#4b5563",
    lineHeight: 1.5,
  },
});

// ─── Component ───────────────────────────────────────────────────────────────

export default function PDFDocument({ data }: { data: JobResponse }) {
  const result = data.result;
  if (!result) return null;

  const kn = result.knowledge_notes;
  const docTitle = data.metadata?.title || "Video Analysis Notes";

  const renderHeader = () => (
    <View style={styles.pageHeader} fixed>
      <Text>{docTitle.substring(0, 50)}{docTitle.length > 50 ? "…" : ""}</Text>
      <Text>Deep Insight AI</Text>
    </View>
  );

  const renderFooter = () => (
    <Text
      style={styles.pageFooter}
      render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      fixed
    />
  );

  return (
    <Document>
      {/* ─── TITLE PAGE ───────────────────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <View style={styles.titlePageContainer}>
          <Text style={styles.mainTitle}>{docTitle}</Text>
          <Text style={styles.subtitle}>AI-Generated Study Notes</Text>
          <View style={styles.metadataBox}>
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Channel</Text>
              <Text style={styles.metadataValue}>{data.metadata?.channel || "Unknown"}</Text>
            </View>
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Duration</Text>
              <Text style={styles.metadataValue}>
                {data.metadata?.duration
                  ? `${Math.floor(data.metadata.duration / 60)}m ${Math.floor(data.metadata.duration % 60)}s`
                  : "Unknown"}
              </Text>
            </View>
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Generated</Text>
              <Text style={styles.metadataValue}>{new Date().toLocaleDateString()}</Text>
            </View>
          </View>
        </View>
      </Page>

      {/* ─── OVERVIEW & REVISION ──────────────────────────────────────── */}
      <Page size="A4" style={styles.page} wrap>
        {renderHeader()}

        {/* Summary */}
        {kn?.main_topic && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{kn.main_topic}</Text>
            {kn.final_summary && <Text style={styles.text}>{kn.final_summary}</Text>}
          </View>
        )}

        {/* Quick Revision */}
        {hasContent(result.quick_revision_notes) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Revision Notes</Text>
            <View style={styles.calloutBox}>
              {safeArr(result.quick_revision_notes).map((bullet, i) => (
                <View key={i} style={styles.listItem}>
                  <Text style={styles.bullet}>•</Text>
                  <Text style={styles.listItemContent}>{bullet}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Detailed Summary */}
        {result.detailed_summary && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Detailed Summary</Text>
            {result.detailed_summary.split("\n\n").map((para, i) => (
              <Text key={i} style={styles.text}>{para}</Text>
            ))}
          </View>
        )}

        {renderFooter()}
      </Page>

      {/* ─── KNOWLEDGE NOTES ──────────────────────────────────────────── */}
      <Page size="A4" style={styles.page} wrap>
        {renderHeader()}

        {hasContent(kn?.core_concepts) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Core Concepts</Text>
            {safeArr(kn?.core_concepts).map((c, i) => (
              <View key={i} style={styles.listItem}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.listItemContent}>{c}</Text>
              </View>
            ))}
          </View>
        )}

        {hasContent(kn?.key_insights) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Key Insights</Text>
            {safeArr(kn?.key_insights).map((ins, i) => (
              <View key={i} style={styles.listItem}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.listItemContent}>{ins}</Text>
              </View>
            ))}
          </View>
        )}

        {hasContent(kn?.actionable_takeaways) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Actionable Takeaways</Text>
            {safeArr(kn?.actionable_takeaways).map((t, i) => (
              <View key={i} style={styles.listItem}>
                <Text style={styles.number}>{i + 1}.</Text>
                <Text style={styles.listItemContent}>{t}</Text>
              </View>
            ))}
          </View>
        )}

        {hasContent(kn?.important_examples) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Important Examples</Text>
            {safeArr(kn?.important_examples).filter(x => typeof x === 'string' && x.trim() !== "").map((ex, i) => (
              <View key={i} style={styles.listItem}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.listItemContent}>{ex}</Text>
              </View>
            ))}
          </View>
        )}

        {renderFooter()}
      </Page>

      {/* ─── QUOTES, TERMS, MISTAKES ──────────────────────────────────── */}
      {(hasContent(kn?.important_quotes) || hasContent(kn?.technical_terms) || hasContent(kn?.common_mistakes)) && (
        <Page size="A4" style={styles.page} wrap>
          {renderHeader()}

          {hasContent(kn?.important_quotes) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Notable Quotes</Text>
              {safeArr(kn?.important_quotes).filter(x => typeof x === 'string' && x.trim() !== "").map((q, i) => (
                <View key={i} style={styles.quoteBox}>
                  <Text style={styles.quoteText}>&ldquo;{q}&rdquo;</Text>
                </View>
              ))}
            </View>
          )}

          {hasContent(kn?.technical_terms) && safeArr(kn?.technical_terms).filter((t: any) => t && t.term && t.term.trim() !== "").length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Glossary</Text>
              {safeArr(kn?.technical_terms).filter((t: any) => t && t.term && t.term.trim() !== "").map((t, i) => (
                <View key={i} style={styles.defItem}>
                  <Text style={styles.defTerm}>{t.term}</Text>
                  <Text style={styles.defDesc}>{t.definition}</Text>
                </View>
              ))}
            </View>
          )}

          {hasContent(kn?.common_mistakes) && safeArr(kn?.common_mistakes).filter(x => typeof x === 'string' && x.trim() !== "").length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Common Mistakes to Avoid</Text>
              {safeArr(kn?.common_mistakes).filter(x => typeof x === 'string' && x.trim() !== "").map((m, i) => (
                <View key={i} style={styles.listItem}>
                  <Text style={styles.bullet}>✗</Text>
                  <Text style={styles.listItemContent}>{m}</Text>
                </View>
              ))}
            </View>
          )}

          {renderFooter()}
        </Page>
      )}

      {/* ─── TIMELINE ─────────────────────────────────────────────────── */}
      {hasContent(result.timeline) && safeArr(result.timeline).filter((t: any) => t && t.title && t.title.trim() !== "").length > 0 && (
        <Page size="A4" style={styles.page} wrap>
          {renderHeader()}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Video Timeline</Text>
            {safeArr(result.timeline).map((section, i) => (
              <View key={i} style={styles.timelineRow}>
                <Text style={styles.timelineTime}>{section.timestamp}</Text>
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineTitle}>
                    {section.title}{section.speaker ? ` (${section.speaker})` : ""}
                  </Text>
                  <Text style={styles.timelineDesc}>{section.explanation}</Text>
                </View>
              </View>
            ))}
          </View>
          {renderFooter()}
        </Page>
      )}

      {/* ─── TRANSCRIPT ───────────────────────────────────────────────── */}
      {data.transcript && data.transcript.trim() !== "" && (
        <Page size="A4" style={styles.page} wrap>
          {renderHeader()}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Full Transcript</Text>
            {parseTranscriptBlocks(data.transcript).map((block, i) => (
              <View key={i} style={[styles.timelineRow, { marginBottom: 6 }]}>
                {block.timestamp ? (
                  <Text style={[styles.timelineTime, { width: 45, color: "#9ca3af" }]}>
                    {block.timestamp}
                  </Text>
                ) : (
                  <Text style={{ width: 0 }} />
                )}
                <View style={[styles.timelineContent, { borderLeftWidth: block.timestamp ? 1 : 0, paddingLeft: block.timestamp ? 10 : 0 }]}>
                  <Text style={[styles.text, { marginBottom: 0, color: "#4b5563" }]}>
                    {block.text}
                  </Text>
                </View>
              </View>
            ))}
          </View>
          {renderFooter()}
        </Page>
      )}
    </Document>
  );
}
