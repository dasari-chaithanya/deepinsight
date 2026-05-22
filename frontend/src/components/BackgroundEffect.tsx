"use client";

// ─── Deep Insight AI — Background Effect ──────────────────────────────────────

import { motion } from "framer-motion";

export default function BackgroundEffect() {
  return (
    <div
      id="background-effect-container"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden="true"
    >
      {/* Base gradient */}
      <div className="absolute inset-0 bg-[#0a0a0f]" />

      {/* Gradient mesh layer */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(139,92,246,0.12) 0%, transparent 60%), " +
            "radial-gradient(ellipse 60% 50% at 80% 50%, rgba(20,184,166,0.08) 0%, transparent 50%), " +
            "radial-gradient(ellipse 60% 40% at 10% 80%, rgba(139,92,246,0.06) 0%, transparent 50%)",
        }}
      />

      {/* Floating orb — top‑right, purple */}
      <motion.div
        id="floating-orb-purple"
        className="absolute top-[-10%] right-[-5%] h-[500px] w-[500px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(139,92,246,0.15) 0%, rgba(139,92,246,0.05) 40%, transparent 70%)",
          filter: "blur(60px)",
        }}
        animate={{
          x: [0, 30, -20, 0],
          y: [0, 40, -10, 0],
          scale: [1, 1.08, 0.95, 1],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Floating orb — bottom‑left, teal */}
      <motion.div
        id="floating-orb-teal"
        className="absolute bottom-[-15%] left-[-10%] h-[450px] w-[450px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(20,184,166,0.12) 0%, rgba(20,184,166,0.04) 40%, transparent 70%)",
          filter: "blur(60px)",
        }}
        animate={{
          x: [0, -25, 35, 0],
          y: [0, -30, 20, 0],
          scale: [1, 1.06, 0.97, 1],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Floating orb — centre, faint violet */}
      <motion.div
        id="floating-orb-center"
        className="absolute top-[40%] left-[50%] h-[350px] w-[350px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(167,139,250,0.07) 0%, transparent 60%)",
          filter: "blur(80px)",
        }}
        animate={{
          x: ["-50%", "-45%", "-55%", "-50%"],
          y: ["-50%", "-45%", "-55%", "-50%"],
          scale: [1, 1.1, 0.92, 1],
        }}
        transition={{
          duration: 30,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Subtle noise texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
          backgroundRepeat: "repeat",
          backgroundSize: "128px 128px",
        }}
      />
    </div>
  );
}
