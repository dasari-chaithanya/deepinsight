"use client";

// ─── Deep Insight AI — URL Input ──────────────────────────────────────────────

import { motion } from "framer-motion";
import { useState, useCallback, type FormEvent } from "react";

/** YouTube URL regex — supports various youtube.com & youtu.be formats. */
const YT_REGEX =
  /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)[\w-]{11}(?:[?&][\w=&%-]*)?$/;

interface URLInputProps {
  onSubmit: (url: string) => void;
  isLoading?: boolean;
}

export default function URLInput({ onSubmit, isLoading = false }: URLInputProps) {
  const [url, setUrl] = useState("");
  const [touched, setTouched] = useState(false);

  const isValid = YT_REGEX.test(url.trim());
  const showError = touched && url.length > 0 && !isValid;

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      setTouched(true);
      if (isValid && !isLoading) {
        onSubmit(url.trim());
      }
    },
    [isValid, isLoading, url, onSubmit]
  );

  return (
    <motion.form
      id="url-input-form"
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.3, ease: "easeOut" }}
      className="relative mx-auto w-full max-w-2xl"
    >
      {/* Outer glow */}
      <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-violet-500/20 via-purple-500/10 to-teal-500/20 opacity-60 blur-sm" />

      {/* Glass container */}
      <div className="relative flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-2 backdrop-blur-xl sm:flex-row sm:items-center sm:p-2">
        {/* Input */}
        <div className="relative flex-1">
          {/* YouTube icon */}
          <div className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-white/30">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a2.994 2.994 0 0 0-2.107-2.117C19.534 3.545 12 3.545 12 3.545s-7.534 0-9.391.524A2.994 2.994 0 0 0 .502 6.186 31.28 31.28 0 0 0 0 12a31.28 31.28 0 0 0 .502 5.814 2.994 2.994 0 0 0 2.107 2.117c1.857.524 9.391.524 9.391.524s7.534 0 9.391-.524a2.994 2.994 0 0 0 2.107-2.117A31.28 31.28 0 0 0 24 12a31.28 31.28 0 0 0-.502-5.814zM9.546 15.568V8.432L15.818 12l-6.272 3.568z" />
            </svg>
          </div>

          <input
            id="youtube-url-input"
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (!touched) setTouched(true);
            }}
            placeholder="Paste a YouTube URL to analyze…"
            disabled={isLoading}
            autoComplete="off"
            className={`
              w-full rounded-xl bg-white/[0.04] py-4 pr-4 pl-12
              text-base text-white/90 placeholder-white/30
              outline-none transition-all duration-200
              focus:bg-white/[0.06] focus:ring-1 focus:ring-violet-500/40
              disabled:cursor-not-allowed disabled:opacity-50
              ${showError ? "ring-1 ring-red-500/50" : ""}
            `}
          />
        </div>

        {/* Submit button */}
        <motion.button
          id="analyze-submit-button"
          type="submit"
          disabled={!isValid || isLoading}
          whileHover={{ scale: isValid && !isLoading ? 1.03 : 1 }}
          whileTap={{ scale: isValid && !isLoading ? 0.97 : 1 }}
          className={`
            relative overflow-hidden rounded-xl px-8 py-4 text-base font-semibold
            transition-all duration-300 sm:min-w-[160px]
            ${
              isValid && !isLoading
                ? "bg-gradient-to-r from-violet-600 to-violet-500 text-white shadow-lg shadow-violet-600/25 hover:shadow-violet-600/40"
                : "cursor-not-allowed bg-white/[0.06] text-white/30"
            }
          `}
        >
          {/* Pulse ring on valid */}
          {isValid && !isLoading && (
            <motion.span
              className="absolute inset-0 rounded-xl border-2 border-violet-400/40"
              animate={{ scale: [1, 1.08, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
          )}

          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <motion.span
                className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
              />
              Analyzing…
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z"
                />
              </svg>
              Analyze
            </span>
          )}
        </motion.button>
      </div>

      {/* Validation error */}
      {showError && (
        <motion.p
          id="url-validation-error"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 pl-2 text-sm text-red-400/80"
        >
          Please enter a valid YouTube URL
        </motion.p>
      )}
    </motion.form>
  );
}
