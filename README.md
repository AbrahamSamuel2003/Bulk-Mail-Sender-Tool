# AI-Powered Bulk Email Outreach & Follow-Up Management System

Lightweight, single-user internal web application for managing outreach campaigns, Excel/CSV lead imports, AI-generated follow-ups (Stages 1–3), controlled bulk sending via Gmail API, and reply/bounce/unsubscribe suppression.

## Tech Stack
- **Frontend**: Next.js (App Router), TypeScript, Tailwind CSS (Microsoft Fluent 2 UI)
- **Backend**: Python FastAPI, SQLAlchemy, Alembic + built-in lightweight `asyncio` background scheduler (zero Docker, zero Redis)
- **Database**: PostgreSQL (local or Supabase Cloud)
- **AI Providers**: Groq (free tier), Google Gemini (free tier), or OpenAI
- **Email Provider**: Gmail API (OAuth 2.0)
- **File Processing**: OpenPyXL / CSV

## One-Command Startup

From the project root:

```powershell
.\start.ps1
```

This starts both:
- **Frontend UI**: `http://localhost:3000`
- **Backend API & Docs**: `http://localhost:8000/api/docs` (including the built-in 15s email queue dispatcher and 2-minute Gmail reply/bounce poller)

## First-Time Setup

1. Copy `.env.example` to `.env` and fill in `DATABASE_URL`, `TOKEN_ENCRYPTION_KEY`, `GROQ_API_KEY` (or `GEMINI_API_KEY`), and Google OAuth credentials.
2. Run database migrations:
   ```powershell
   cd backend
   .\.venv\Scripts\alembic.exe upgrade head
   ```
3. Start the app with `.\start.ps1`, open `http://localhost:3000/settings`, and click **Connect Gmail Account**.
