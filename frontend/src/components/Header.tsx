"use client";

// ─── Deep Insight AI — Header ─────────────────────────────────────────────────

import { motion } from "framer-motion";
import Link from "next/link";

export default function Header() {
  return (
    <motion.header
      id="header-navbar"
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="fixed top-0 right-0 left-0 z-50 border-b border-white/[0.06] bg-[#0a0a0f]/70 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        {/* Logo / brand */}
        <Link href="/" id="header-logo-link" className="flex items-center gap-3">
          {/* Icon */}
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-teal-400 shadow-lg shadow-violet-500/20">
            <svg
              className="h-5 w-5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714a2.25 2.25 0 0 0 .659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-1.341 4.023A2.25 2.25 0 0 1 15.523 20H8.477a2.25 2.25 0 0 1-2.136-1.477L5 14.5m14 0H5"
              />
            </svg>
          </div>

          {/* Text */}
          <span className="font-outfit text-xl font-semibold tracking-tight">
            <span className="bg-gradient-to-r from-violet-400 via-purple-300 to-teal-400 bg-clip-text text-transparent">
              Deep Insight
            </span>{" "}
            <span className="text-white/80">AI</span>
          </span>
        </Link>

      </div>
    </motion.header>
  );
}
