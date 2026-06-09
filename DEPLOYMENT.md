# Deployment

This repo deploys cleanly as two services:

- Frontend: Vercel
- Backend API: Render

## Backend on Render

Create a new Render web service from this repo. Render can read `render.yaml`.

Set these environment variables in Render:

```env
OPENAI_API_KEY=sk-your-openai-key
OPENAI_MARKET_MODEL=gpt-4.1-mini
ALLOWED_ORIGINS=https://your-vercel-app.vercel.app
```

Build command:

```bash
pip install -r requirements.txt
```

Start command:

```bash
uvicorn api:app --host 0.0.0.0 --port $PORT
```

The demo SQLite database is generated automatically on first API access if
`warehouse.db` is not present on the host.

## Frontend on Vercel

Import this repo into Vercel and use the Vite preset.

Set this environment variable in Vercel:

```env
VITE_API_BASE_URL=https://your-render-api.onrender.com
```

Build command:

```bash
npm run build
```

Output directory:

```bash
dist
```

After both services are live, update Render's `ALLOWED_ORIGINS` with the final
Vercel URL, redeploy the backend, then test the Predictive Analytics page.
