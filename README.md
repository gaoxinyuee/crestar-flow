# Crestar Flow

Crestar Flow is a warehouse intelligence prototype for Crestar's fan-parts operations. It combines a React dashboard, a 3D warehouse digital twin, inventory and forecasting views, route optimisation tools, and an AI assistant grounded in warehouse data.

The project is split into a Vite/React frontend and a FastAPI backend. The backend serves warehouse KPIs, inventory data, forecast data, traffic incidents, market signals, and AI chat responses.

## Features

- 3D warehouse digital twin with zone navigation, category highlighting, and low-stock indicators
- Inventory dashboard with warehouse locations, quantities, reorder points, and stock health
- Inbound and outbound workflow pages for warehouse operations
- Forecasting page for demand trends, reorder recommendations, and market signals
- Route optimisation page with map-based delivery planning and traffic context
- AI warehouse assistant powered by OpenAI when configured, with Ollama fallback support
- Demo SQLite database generated automatically when `warehouse.db` is missing

## Tech Stack

- Frontend: React 19, Vite, TypeScript, TanStack Router, TanStack Query
- UI: Tailwind CSS, Radix UI, shadcn-style components, Lucide icons
- 3D: Three.js, React Three Fiber, Drei
- Maps and charts: Leaflet, React Leaflet, Recharts
- Backend: FastAPI, Uvicorn, SQLite, Python
- AI: OpenAI Responses API, Anthropic/Ollama fallback paths in the backend
- Deployment: Vercel for frontend, Render for backend

## Project Structure

```text
.
├── src/                    # React frontend
│   ├── components/          # Layout, 3D warehouse, UI components
│   ├── lib/                 # API base URL and shared helpers
│   ├── routes/              # TanStack Router pages
│   └── integrations/        # Supabase client scaffolding
├── api.py                  # FastAPI backend
├── app.py                  # Streamlit prototype/dashboard
├── chatbot.py              # AI assistant prompt and provider logic
├── database.py             # SQLite access and demo data helpers
├── forecasting.py          # Forecasting helpers
├── lta.py                  # Traffic/incident integration helpers
├── create_db.py            # Database creation script
├── requirements.txt        # Python dependencies
├── package.json            # Frontend dependencies and scripts
├── render.yaml             # Render backend deployment config
├── vercel.json             # Vercel frontend deployment config
└── DEPLOYMENT.md           # Extra deployment notes
```

## Prerequisites

- Node.js 20 or newer
- npm
- Python 3.11 or newer
- An OpenAI API key for hosted AI chat and market-signal generation

## Environment Variables

Create a local `.env` file from the example:

```bash
cp .env.example .env
```

Available variables:

```env
OPENAI_API_KEY=sk-your-openai-key
OPENAI_CHAT_MODEL=gpt-4.1-mini
OPENAI_MARKET_MODEL=gpt-4.1-mini
ALLOWED_ORIGINS=http://localhost:5173
VITE_API_BASE_URL=http://localhost:8000
```

`VITE_API_BASE_URL` is used by the React frontend. The other variables are used by the FastAPI backend.

## Local Development

Install frontend dependencies:

```bash
npm install
```

Install backend dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Start the backend API:

```bash
uvicorn api:app --reload --port 8000
```

Start the frontend in a second terminal:

```bash
npm run dev
```

Open the app at:

```text
http://localhost:5173
```

Check the backend health endpoint at:

```text
http://localhost:8000/health
```

## Useful Commands

```bash
npm run dev        # Start the Vite development server
npm run build      # Build the frontend for production
npm run preview    # Preview the production build locally
npm run lint       # Run ESLint
npm run format     # Format files with Prettier
```

Backend:

```bash
uvicorn api:app --reload --port 8000
python create_db.py
streamlit run app.py
```

## API Overview

Common backend endpoints:

- `GET /health` - API, AI provider, and database status
- `GET /warehouse/kpis` - dashboard KPIs
- `GET /warehouse/alerts` - low-stock alerts
- `GET /warehouse/inventory` - inventory rows
- `GET /warehouse/3d` - 3D warehouse slot data
- `GET /api/warehouse/zones` - zone-level warehouse summary
- `GET /traffic/incidents` - route traffic context
- `GET /forecast` - forecast summary
- `GET /forecast/{product_id}` - product forecast
- `POST /forecast/run` - run forecasting workflow
- `GET /api/market-signals` - AI-generated demand signals
- `POST /chat` - non-streaming AI assistant response
- `POST /chat/stream` - streaming AI assistant response

## Deployment

This repo is designed for two services:

- Frontend on Vercel
- Backend API on Render

For Render, use `render.yaml` or configure:

```bash
pip install -r requirements.txt
uvicorn api:app --host 0.0.0.0 --port $PORT
```

Set Render environment variables:

```env
OPENAI_API_KEY=sk-your-openai-key
OPENAI_MARKET_MODEL=gpt-4.1-mini
ALLOWED_ORIGINS=https://your-vercel-app.vercel.app
```

For Vercel, use the Vite preset with:

```bash
npm run build
```

Output directory:

```text
dist
```

Set Vercel environment variables:

```env
VITE_API_BASE_URL=https://your-render-api.onrender.com
```

After both services are live, update Render's `ALLOWED_ORIGINS` with the final Vercel URL and redeploy the backend.

## Notes

- The demo database is SQLite-based and can be regenerated with `create_db.py`.
- If no hosted AI key is configured, the backend contains fallback paths for local Ollama usage.
- `DEPLOYMENT.md` contains a shorter deployment checklist.
