"""
api.py
FastAPI server — Crestar Warehouse AI chatbot endpoint.

Run:
    uvicorn api:app --reload --port 8000

Endpoints:
    GET  /health                 — Ollama + DB status
    GET  /warehouse/context      — Live system prompt (debug)
    GET  /warehouse/alerts       — Low-stock alerts JSON
    GET  /warehouse/kpis         — Dashboard KPIs JSON
    POST /chat                   — Non-streaming response
    POST /chat/stream            — SSE streaming response
"""

import json
import time
from datetime import datetime
from typing import AsyncIterator

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import chatbot
import database
import forecasting
import lta

# ─── App setup ─────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Crestar Warehouse AI API",
    description=(
        "Ollama/Llama3-powered warehouse assistant grounded in live warehouse.db data. "
        "Answers questions about inventory locations, reorder alerts, and pallet placement."
    ),
    version="1.0.0",
)

# Allow all localhost origins so the React dev server and Streamlit can both call this.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite / React dev server
        "http://localhost:3000",   # CRA / Next.js
        "http://localhost:8080",   # alternative dev server
        "http://localhost:8501",   # Streamlit
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8501",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Request / response models ─────────────────────────────────────────────────

class Message(BaseModel):
    role: str       # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[Message]
    model: str = "llama3"


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _to_ollama_messages(req: ChatRequest) -> list[dict]:
    """Prepend the live system prompt and convert Pydantic models to dicts."""
    sys_prompt = chatbot.build_system_prompt()
    msgs = [{"role": "system", "content": sys_prompt}]
    msgs += [{"role": m.role, "content": m.content} for m in req.messages]
    return msgs


async def _ollama_available() -> bool:
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            r = await client.get(chatbot.OLLAMA_TAGS)
            return r.status_code == 200
    except Exception:
        return False


# ─── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    """Health check — returns Ollama status and headline warehouse KPIs."""
    ollama_ok = await _ollama_available()
    kpis = database.get_dashboard_kpis()

    available_models: list[str] = []
    if ollama_ok:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(chatbot.OLLAMA_TAGS)
                available_models = [m["name"] for m in r.json().get("models", [])]
        except Exception:
            pass

    return {
        "status": "ok",
        "ollama": {
            "status": "connected" if ollama_ok else "unavailable",
            "url": chatbot.OLLAMA_BASE,
            "models": available_models,
        },
        "database": "connected",
        "warehouse": {
            "total_skus":              kpis["total_skus"],
            "total_units_on_hand":     kpis["total_units"],
            "low_stock_alerts":        kpis["low_stock_count"],
            "warehouse_occupancy_pct": kpis["warehouse_occupancy_pct"],
            "inbound_shipments":       kpis["inbound_pending"],
            "active_orders":           kpis["outbound_active"],
        },
    }


@app.get("/warehouse/context")
async def warehouse_context():
    """Return the current live system prompt — useful for debugging grounding."""
    return {"context": chatbot.build_system_prompt()}


@app.get("/warehouse/alerts")
async def warehouse_alerts():
    """Return current low-stock alerts from the database."""
    return {"alerts": database.get_low_stock_alerts()}


@app.get("/warehouse/kpis")
async def warehouse_kpis():
    """Return dashboard KPIs."""
    return database.get_dashboard_kpis()


@app.get("/warehouse/3d")
async def warehouse_3d():
    """
    Return all inventory slots for the 3D digital twin.
    Each pallet includes zone, rack, level, quantity, product metadata, and low-stock flag.
    """
    with database.get_db() as conn:
        rows = conn.execute("""
            SELECT i.zone, i.rack, i.level, i.quantity,
                   p.product_id, p.name AS product_name, p.category
            FROM inventory i
            JOIN products p USING (product_id)
            ORDER BY i.zone, i.rack, i.level
        """).fetchall()

    low_stock_ids = {a["product_id"] for a in database.get_low_stock_alerts()}
    pallets = []
    for r in rows:
        d = dict(r)
        d["low_stock"] = d["product_id"] in low_stock_ids
        pallets.append(d)
    return {"pallets": pallets}


@app.get("/warehouse/inventory")
async def warehouse_inventory():
    """
    Full inventory from warehouse.db — all 27 SKUs with live quantities,
    primary zone, bin locations, reorder status. No hardcoded data.
    """
    with database.get_db() as conn:
        rows = conn.execute("""
            SELECT
                p.product_id, p.name, p.category,
                p.reorder_point, p.weight_kg,
                p.length_cm, p.width_cm, p.height_cm,
                COALESCE(SUM(i.quantity), 0) AS total_qty,
                GROUP_CONCAT(
                    i.zone || i.rack || ' L' || i.level || ' (' || i.quantity || ' units)',
                    ', '
                ) AS bin_locations,
                (
                    SELECT ii.zone FROM inventory ii
                    WHERE ii.product_id = p.product_id
                    GROUP BY ii.zone ORDER BY SUM(ii.quantity) DESC LIMIT 1
                ) AS primary_zone
            FROM products p
            LEFT JOIN inventory i USING (product_id)
            GROUP BY p.product_id
            ORDER BY p.category, p.name
        """).fetchall()

    low_ids = {a["product_id"] for a in database.get_low_stock_alerts()}
    result = []
    for r in rows:
        d = dict(r)
        qty, rp = d["total_qty"], d["reorder_point"]
        d["status"] = "Critical" if (qty == 0 or qty <= rp * 0.5) else ("Low" if qty < rp else "Healthy")
        d["low_stock"] = d["product_id"] in low_ids
        result.append(d)

    return {
        "inventory":   result,
        "total_skus":  len(result),
        "total_units": sum(r["total_qty"] for r in result),
    }


@app.get("/test-ollama")
async def test_ollama(model: str = "llama3.2:1b"):
    """
    Debug endpoint — calls Ollama directly with a minimal prompt (no system prompt,
    no warehouse context) and returns the raw response plus timing.

    Usage:
        GET /test-ollama                    — test llama3.2:1b
        GET /test-ollama?model=llama3.1     — test a specific model

    Returns:
        available_models  — models currently pulled in Ollama
        model_requested   — model name used for the test
        reachable         — whether Ollama responded to /api/tags
        error             — error message if the call failed, else null
        response          — raw content from the model
        elapsed_seconds   — wall-clock time for the Ollama call
    """
    # 1. Check reachability and list pulled models
    available_models: list[str] = []
    reachable = False
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(chatbot.OLLAMA_TAGS)
            reachable = r.status_code == 200
            available_models = [m["name"] for m in r.json().get("models", [])]
    except Exception as e:
        return {
            "reachable": False,
            "available_models": [],
            "model_requested": model,
            "error": f"Cannot reach Ollama at {chatbot.OLLAMA_BASE}: {e}",
            "response": None,
            "elapsed_seconds": None,
        }

    print(f"[TEST-OLLAMA] Ollama reachable={reachable}, models={available_models}")
    print(f"[TEST-OLLAMA] Sending minimal test prompt to model={model} ...")

    # 2. Send a minimal, no-system-prompt call so we isolate pure model latency
    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=chatbot.REQUEST_TIMEOUT) as client:
            resp = await client.post(
                chatbot.OLLAMA_CHAT,
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": "Reply with exactly: OK"}],
                    "stream": False,
                },
            )
            resp.raise_for_status()
            elapsed = round(time.monotonic() - start, 2)
            content = resp.json()["message"]["content"]
            print(f"[TEST-OLLAMA] Response in {elapsed}s: {content!r}")
            return {
                "reachable": True,
                "available_models": available_models,
                "model_requested": model,
                "error": None,
                "response": content,
                "elapsed_seconds": elapsed,
            }
    except httpx.HTTPStatusError as e:
        elapsed = round(time.monotonic() - start, 2)
        detail = f"HTTP {e.response.status_code}: {e.response.text[:300]}"
        print(f"[TEST-OLLAMA] HTTP error after {elapsed}s: {detail}")
        return {
            "reachable": True,
            "available_models": available_models,
            "model_requested": model,
            "error": detail,
            "response": None,
            "elapsed_seconds": elapsed,
        }
    except Exception as e:
        elapsed = round(time.monotonic() - start, 2)
        print(f"[TEST-OLLAMA] Error after {elapsed}s: {e}")
        return {
            "reachable": True,
            "available_models": available_models,
            "model_requested": model,
            "error": str(e),
            "response": None,
            "elapsed_seconds": elapsed,
        }


@app.get("/traffic/incidents")
async def traffic_incidents():
    """
    Fetch live traffic incidents from LTA DataMall and return structured list.
    Each incident includes type, severity (heavy/moderate), road message,
    lat/lng, approximate SVG map coordinates, and matched delivery district.
    Returns an empty incidents list if the LTA API is unreachable.
    """
    incidents = lta.get_incidents()
    affected  = lta.get_affected_districts(incidents)
    return {
        "incidents":          incidents,
        "count":              len(incidents),
        "affected_districts": affected,
        "fetched_at":         datetime.utcnow().isoformat() + "Z",
    }


@app.get("/forecast")
async def forecast_all():
    """
    Return forecast summary for all 27 SKUs, sorted by urgency (red → amber → green).
    Used to populate the recommendations panel and SKU dropdown.
    """
    return {"forecasts": forecasting.get_all_forecasts()}


@app.get("/forecast/{product_id}")
async def forecast_product(product_id: str):
    """
    Full historical + 3-month Holt's forecast for a single SKU.
    Runs the forecast model on first call if the table is empty.
    """
    result = forecasting.get_forecast(product_id)
    if not result or "error" in result:
        raise HTTPException(status_code=404, detail=f"No forecast data for {product_id}")
    return result


@app.post("/forecast/run")
async def forecast_run():
    """Re-run Holt's linear trend model for all SKUs and refresh the forecasts table."""
    results = forecasting.run_forecasts()
    return {"status": "ok", "skus_forecasted": len(results)}


@app.post("/chat")
async def chat_endpoint(req: ChatRequest):
    """
    Non-streaming chat. Returns the full assistant response as a JSON object.
    Use /chat/stream for a better UX when the user is waiting for a long response.
    """
    messages = _to_ollama_messages(req)
    try:
        async with httpx.AsyncClient(timeout=chatbot.REQUEST_TIMEOUT) as client:
            resp = await client.post(
                chatbot.OLLAMA_CHAT,
                json={"model": req.model, "messages": messages, "stream": False,
                      "options": {"temperature": chatbot.DEFAULT_TEMPERATURE}},
            )
            resp.raise_for_status()
            data = resp.json()
            return {
                "role": "assistant",
                "content": data["message"]["content"],
                "model": req.model,
            }
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=(
                "Ollama is not running. "
                "Start it with: ollama serve  "
                "Then pull a model: ollama pull llama3"
            ),
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat/stream")
async def chat_stream_endpoint(req: ChatRequest):
    """
    Streaming chat via Server-Sent Events (SSE).

    Each chunk is sent as:
        data: {"content": "token..."}\n\n
    Stream ends with:
        data: [DONE]\n\n

    On error (Ollama unavailable, etc.) the error message is streamed as content
    so the client can display it in the chat bubble.
    """
    messages = _to_ollama_messages(req)
    sys_prompt_len = len(messages[0]["content"]) if messages else 0
    print(f"[STREAM] Request received — model={req.model}, history_msgs={len(req.messages)}, sys_prompt_chars={sys_prompt_len}")

    async def generate() -> AsyncIterator[str]:
        stream_start = time.monotonic()
        chunk_count = 0
        try:
            print(f"[STREAM] Connecting to Ollama ({chatbot.OLLAMA_CHAT}) ...")
            async with httpx.AsyncClient(timeout=chatbot.REQUEST_TIMEOUT) as client:
                async with client.stream(
                    "POST",
                    chatbot.OLLAMA_CHAT,
                    json={"model": req.model, "messages": messages, "stream": True,
                          "options": {"temperature": chatbot.DEFAULT_TEMPERATURE}},
                ) as response:
                    print(f"[STREAM] Ollama responded HTTP {response.status_code} in {time.monotonic()-stream_start:.1f}s")
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        try:
                            data = json.loads(line)
                        except json.JSONDecodeError:
                            print(f"[STREAM] JSON decode error on line: {line[:120]!r}")
                            continue

                        if data.get("done"):
                            elapsed = round(time.monotonic() - stream_start, 2)
                            print(f"[STREAM] Done — {chunk_count} chunks in {elapsed}s")
                            yield "data: [DONE]\n\n"
                            return

                        content = data.get("message", {}).get("content", "")
                        if content:
                            chunk_count += 1
                            if chunk_count == 1:
                                print(f"[STREAM] First token after {time.monotonic()-stream_start:.1f}s")
                            yield f"data: {json.dumps({'content': content})}\n\n"

        except httpx.ConnectError as e:
            print(f"[STREAM] ConnectError: {e}")
            error_msg = (
                "**Ollama is not running.**\n\n"
                "Start it in a terminal:\n"
                "```\nollama serve\n```\n"
                "Then make sure the model is pulled:\n"
                f"```\nollama pull {req.model}\n```"
            )
            yield f"data: {json.dumps({'content': error_msg})}\n\n"
            yield "data: [DONE]\n\n"

        except httpx.ReadTimeout as e:
            elapsed = round(time.monotonic() - stream_start, 2)
            print(f"[STREAM] ReadTimeout after {elapsed}s (REQUEST_TIMEOUT={chatbot.REQUEST_TIMEOUT}s): {e}")
            msg = (
                f"**Timed out waiting for {req.model}** after {elapsed}s.\n\n"
                "Try:\n"
                f"- `ollama pull {req.model}` to ensure the model is downloaded\n"
                "- Use `llama3.2:1b` for faster responses on CPU\n"
                "- Check `GET /test-ollama` to benchmark raw Ollama latency"
            )
            yield f"data: {json.dumps({'content': msg})}\n\n"
            yield "data: [DONE]\n\n"

        except httpx.HTTPStatusError as e:
            print(f"[STREAM] HTTPStatusError {e.response.status_code}: {e.response.text[:200]}")
            msg = f"**Ollama returned an error ({e.response.status_code}).** Check that the model `{req.model}` is pulled."
            yield f"data: {json.dumps({'content': msg})}\n\n"
            yield "data: [DONE]\n\n"

        except Exception as e:
            elapsed = round(time.monotonic() - stream_start, 2)
            print(f"[STREAM] Unexpected error after {elapsed}s: {type(e).__name__}: {e}")
            yield f"data: {json.dumps({'content': f'**Unexpected error:** {type(e).__name__}: {e}'})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",   # prevent Nginx from buffering SSE
        },
    )
