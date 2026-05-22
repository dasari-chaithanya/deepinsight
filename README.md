# Deep Insight AI

Deep Insight AI is a powerful full-stack application that transforms any YouTube video into structured insights, detailed explanations, and actionable takeaways using AI.

## Features

- 🎥 **Real YouTube Processing**: Supports any public video using `yt-dlp` and `ffmpeg`
- 🎙️ **High-Quality Transcription**: Uses Groq Whisper API for extremely fast and accurate transcripts, with automatic chunking for long videos and fallback to YouTube captions
- 🧠 **AI Analysis**: Uses Google Gemini 2.5 Flash to generate executive summaries, timestamped sections, key insights, important quotes, and actionable takeaways
- 💾 **Smart Caching & Reuse**: Persists jobs in SQLite. Automatically reuses transcripts and caches finished analyses to save API costs
- 📄 **Professional PDF Export**: Generates beautifully formatted multi-page PDFs locally using `@react-pdf/renderer`
- 🎨 **Premium UI**: Dark glassmorphism interface built with Next.js 15, Tailwind CSS v4, and Framer Motion
- ⏱️ **Robust Queuing**: Background task processing with `asyncio.Queue` ensures the backend remains responsive

## Prerequisites

- **Python 3.12+**
- **Node.js 18+**
- **ffmpeg** installed on your system (required for audio extraction)
- API Keys:
  - **Groq API Key**: Get it at [console.groq.com](https://console.groq.com)
  - **Google Gemini API Key**: Get it at [aistudio.google.com](https://aistudio.google.com)

## Backend Setup (FastAPI)

1. Navigate to the backend directory:
   ```powershell
   cd backend
   ```
2. Create and activate a virtual environment (Windows PowerShell):
   ```powershell
   python -m venv venv
   .\venv\Scripts\activate
   ```
   *(Note: If you get an execution policy error, run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` first)*
3. Install dependencies:
   ```powershell
   pip install -r requirements.txt
   ```
4. Set up environment variables:
   Copy `.env.example` to `.env` and fill in your API keys.
5. Run the server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

## Frontend Setup (Next.js)

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   Copy `.env.example` to `.env` (it defaults to `http://localhost:8000`).
4. Run the development server:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment

### Backend (Railway)
The backend is designed to be easily deployed on Railway using the provided `Dockerfile` and `railway.toml`. The Docker container automatically installs `ffmpeg`.

### Frontend (Vercel)
The frontend is a standard Next.js application that can be deployed directly to Vercel with zero configuration.

## Architecture Decisions

- **SQLite Database**: Used for job tracking and caching to avoid unnecessary cloud DB complexity.
- **Audio Chunking**: Videos longer than ~20MB are chunked into 10-minute segments before sending to the Whisper API.
- **Video Limits**: Maximum video duration defaults to 90 minutes to prevent API cost explosions.
- **Robust Parsing**: Includes automatic retry and schema validation when extracting structured JSON from the Gemini API.
