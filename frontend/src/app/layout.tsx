import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Deep Insight AI — YouTube Video Analysis",
  description:
    "Transform any YouTube video into structured insights, summaries, and actionable takeaways using AI.",
  keywords: ["YouTube", "AI", "analysis", "transcript", "summary", "insights"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable}`} data-scroll-behavior="smooth">
      <body className="min-h-screen bg-[#0a0a0f] font-sans text-white antialiased">
        {children}
      </body>
    </html>
  );
}
