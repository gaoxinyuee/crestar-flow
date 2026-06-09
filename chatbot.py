"""
chatbot.py
Ollama / Llama3 warehouse chatbot grounded in live warehouse.db data.

Standalone test (requires Ollama running and llama3 pulled):
    python chatbot.py "Where are the walnut fan blades?"
    python chatbot.py "Which zones have space for large pallets?"
    python chatbot.py "I have 20 Motor 45W DC pallets (120x80x100 cm). Where do I put them?"
"""

import json
import os
import sys
from typing import Iterator

import requests
from dotenv import load_dotenv

import database

load_dotenv()   # loads .env into os.environ if present

# ─── Config ────────────────────────────────────────────────────────────────────

OLLAMA_BASE          = "http://localhost:11434"
OLLAMA_CHAT          = f"{OLLAMA_BASE}/api/chat"
OLLAMA_TAGS          = f"{OLLAMA_BASE}/api/tags"
DEFAULT_MODEL        = "llama3.2:1b"
DEFAULT_TEMPERATURE  = 0.1   # low = factual, consistent; high = creative
REQUEST_TIMEOUT      = 60    # seconds — 60 s cap; llama3.2:1b on CPU should respond well within this

CLAUDE_MODEL         = "claude-haiku-4-5-20251001"


def _use_claude() -> bool:
    """True when ANTHROPIC_API_KEY is set — routes all chat calls through Claude."""
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


# ─── System prompt ─────────────────────────────────────────────────────────────

def build_system_prompt() -> str:
    """
    Grounding prompt with full slot-level inventory data from warehouse.db.
    Every product shows its exact Zone, Rack, and Level — never placeholder text.
    """

    # ── Zones ──────────────────────────────────────────────────────────────────
    zones_df = database.get_zone_stats()
    zone_lines = []
    for _, z in zones_df.iterrows():
        free = int(z["capacity_slots"] - z["current_occupancy"])
        zone_lines.append(
            f"Zone {z['zone_id']} ({z['zone_type']}) "
            f"{int(z['current_occupancy'])}/{int(z['capacity_slots'])} slots, "
            f"{free} free, maxH {z['max_pallet_height_m']}m, primary: {z['primary_category']}"
        )

    # ── Full slot-level inventory — one row per product, all locations ──────────
    with database.get_db() as conn:
        inv_rows = conn.execute("""
            SELECT
                p.product_id,
                p.name,
                p.reorder_point,
                COALESCE(SUM(i.quantity), 0) AS total_qty,
                GROUP_CONCAT(
                    'Zone ' || i.zone || ' ' || i.rack || ' Level ' || i.level
                    || ' (' || i.quantity || ' units)',
                    '; '
                ) AS locations
            FROM products p
            LEFT JOIN inventory i USING (product_id)
            GROUP BY p.product_id, p.name, p.reorder_point
            ORDER BY p.category, p.name
        """).fetchall()

        # ── Inbound ETA per product_id (direct join, not via name) ─────────────
        eta_rows = conn.execute("""
            SELECT si.product_id, MIN(s.expected_date) AS eta
            FROM   inbound_shipment_items si
            JOIN   inbound_shipments s USING (shipment_id)
            WHERE  s.status IN ('Ordered', 'In Transit')
            GROUP  BY si.product_id
        """).fetchall()
    eta_map = {r[0]: r[1] for r in eta_rows}

    inv_lines = []
    for pid, name, rp, qty, locations in inv_rows:
        status = " [REORDER]" if qty < rp else ""
        loc_str = locations if locations else "NOT IN STOCK"
        line = f"{pid} | {name} | on-hand: {int(qty)} (reorder at {rp}){status} | {loc_str}"
        if qty < rp and pid in eta_map:
            line += f" | restock ETA {eta_map[pid]}"
        inv_lines.append(line)

    NL = "\n"
    return f"""You are Crestar Warehouse AI. Answer questions using ONLY the data below.
When asked where a product is, quote the exact Zone, Rack, and Level from the INVENTORY table.
Do not use placeholder text like "Zone X" or "Rack RXX" — always use the real values.

ZONES:
{NL.join(zone_lines)}

INVENTORY (product | on-hand qty | exact storage locations):
{NL.join(inv_lines)}
"""


# ─── Ollama helpers ────────────────────────────────────────────────────────────

def check_ollama() -> bool:
    """Return True if Ollama is reachable at OLLAMA_BASE."""
    try:
        r = requests.get(OLLAMA_TAGS, timeout=3)
        return r.status_code == 200
    except Exception:
        return False


def list_models() -> list[str]:
    """Return model names currently pulled in Ollama."""
    try:
        r = requests.get(OLLAMA_TAGS, timeout=5)
        r.raise_for_status()
        return [m["name"] for m in r.json().get("models", [])]
    except Exception:
        return []


def chat(
    messages: list[dict],
    model: str = DEFAULT_MODEL,
    system_prompt: str | None = None,
) -> str:
    """
    Blocking chat call — uses Claude when ANTHROPIC_API_KEY is set, else Ollama.

    Args:
        messages:      list of {"role": "user"|"assistant", "content": "..."}
        model:         Ollama model name (ignored when Claude is active)
        system_prompt: override the auto-built system prompt (optional)

    Returns:
        The assistant reply as a plain string.
    """
    sys_prompt = system_prompt or build_system_prompt()

    if _use_claude():
        try:
            import anthropic
            client = anthropic.Anthropic()
            resp = client.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=1024,
                system=sys_prompt,
                messages=messages,
            )
            return resp.content[0].text
        except Exception as e:
            return f"**Claude error:** {e}"

    # ── Ollama fallback ───────────────────────────────────────────────────────
    payload = [{"role": "system", "content": sys_prompt}] + messages
    try:
        resp = requests.post(
            OLLAMA_CHAT,
            json={"model": model, "messages": payload, "stream": False,
                  "options": {"temperature": DEFAULT_TEMPERATURE}},
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()["message"]["content"]
    except requests.exceptions.ConnectionError:
        return (
            "**Cannot connect to Ollama.**\n\n"
            "Make sure it is running:\n"
            "```\nollama serve\n```\n"
            "Then pull the model:\n"
            "```\nollama pull llama3.2:1b\n```"
        )
    except Exception as e:
        return f"**Error calling Ollama:** {e}"


def chat_stream(
    messages: list[dict],
    model: str = DEFAULT_MODEL,
    system_prompt: str | None = None,
) -> Iterator[str]:
    """
    Streaming chat — uses Claude when ANTHROPIC_API_KEY is set, else Ollama.
    Yields text chunks token by token.

    Usage:
        for chunk in chat_stream(msgs):
            print(chunk, end="", flush=True)
    """
    sys_prompt = system_prompt or build_system_prompt()

    if _use_claude():
        try:
            import anthropic
            client = anthropic.Anthropic()
            with client.messages.stream(
                model=CLAUDE_MODEL,
                max_tokens=1024,
                system=sys_prompt,
                messages=messages,
            ) as stream:
                for text in stream.text_stream:
                    yield text
        except Exception as e:
            yield f"**Claude stream error:** {e}"
        return

    # ── Ollama fallback ───────────────────────────────────────────────────────
    payload = [{"role": "system", "content": sys_prompt}] + messages
    try:
        resp = requests.post(
            OLLAMA_CHAT,
            json={"model": model, "messages": payload, "stream": True,
                  "options": {"temperature": DEFAULT_TEMPERATURE}},
            stream=True,
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        for raw_line in resp.iter_lines():
            if not raw_line:
                continue
            data = json.loads(raw_line)
            if data.get("done"):
                return
            content = data.get("message", {}).get("content", "")
            if content:
                yield content

    except requests.exceptions.ConnectionError:
        yield (
            "**Cannot connect to Ollama.** "
            "Run `ollama serve` and ensure `llama3.2:1b` is pulled."
        )
    except Exception as e:
        yield f"**Stream error:** {e}"


# ─── CLI test harness ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    question = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else (
        "Which products are below reorder point and when will they be restocked?"
    )

    print(f"\nQuestion: {question}\n")
    print("─" * 60)

    if not check_ollama():
        print("ERROR: Ollama is not running. Start with:  ollama serve")
        sys.exit(1)

    models = list_models()
    print(f"Ollama models available: {models}")

    model = DEFAULT_MODEL if DEFAULT_MODEL in " ".join(models) else (models[0] if models else DEFAULT_MODEL)
    print(f"Using model: {model}\n")
    print("─" * 60)

    msgs = [{"role": "user", "content": question}]
    print("Answer (streaming):\n")
    for chunk in chat_stream(msgs, model=model):
        print(chunk, end="", flush=True)
    print("\n")
