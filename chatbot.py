"""
chatbot.py
Ollama / Llama3 warehouse chatbot grounded in live warehouse.db data.

Standalone test (requires Ollama running and llama3 pulled):
    python chatbot.py "Where are the walnut fan blades?"
    python chatbot.py "Which zones have space for large pallets?"
    python chatbot.py "I have 20 Motor 45W DC pallets (120x80x100 cm). Where do I put them?"
"""

import json
import sys
from typing import Iterator

import requests

import database

# ─── Config ────────────────────────────────────────────────────────────────────

OLLAMA_BASE          = "http://localhost:11434"
OLLAMA_CHAT          = f"{OLLAMA_BASE}/api/chat"
OLLAMA_TAGS          = f"{OLLAMA_BASE}/api/tags"
DEFAULT_MODEL        = "llama3.2:1b"
DEFAULT_TEMPERATURE  = 0.1   # low = factual, consistent; high = creative
REQUEST_TIMEOUT      = 300   # seconds — large models on CPU can take >2 min for first token


# ─── System prompt ─────────────────────────────────────────────────────────────

def build_system_prompt() -> str:
    """
    Build a compact, structured system prompt from live warehouse.db data.
    Designed to stay under ~600 tokens so llama3.2:1b responds quickly on CPU.
    Called fresh on every request so data is always current.
    """

    # ── Zones ──────────────────────────────────────────────────────────────────
    zones_df = database.get_zone_stats()
    zone_lines = []
    for _, z in zones_df.iterrows():
        free = int(z["capacity_slots"] - z["current_occupancy"])
        zone_lines.append(
            f"Z{z['zone_id']}|{z['zone_type']}|{z['length_m']}x{z['width_m']}x{z['height_m']}m"
            f"|maxH={z['max_pallet_height_m']}m|{int(z['current_occupancy'])}/{int(z['capacity_slots'])}"
            f"|{free}free|{z['primary_category']}"
        )

    # ── Inventory with bin locations ────────────────────────────────────────────
    with database.get_db() as conn:
        inv_rows = conn.execute("""
            SELECT
                p.product_id, p.name, p.reorder_point,
                COALESCE(SUM(i.quantity), 0) AS total_qty,
                GROUP_CONCAT(
                    i.zone || i.rack || 'L' || i.level || '(' || i.quantity || ')',
                    ','
                ) AS bins
            FROM products p
            LEFT JOIN inventory i USING (product_id)
            GROUP BY p.product_id, p.name, p.reorder_point
            ORDER BY p.category, p.name
        """).fetchall()

    inv_lines = []
    for pid, name, rp, qty, bins in inv_rows:
        flag = "⚠" if qty < rp else ""
        inv_lines.append(f"{pid}|{name[:22]}|{int(qty)}/{rp}{flag}|{bins or 'NO STOCK'}")

    # ── Low-stock alerts with inbound ETA ───────────────────────────────────────
    alerts = database.get_low_stock_alerts()

    # Build a quick lookup: product_id → earliest inbound ETA
    inbound_df = database.get_inbound_shipments()
    eta_by_product: dict[str, str] = {}
    for _, row in inbound_df.iterrows():
        for item in str(row["items_summary"]).split(","):
            pid = item.strip().split("×")[0].split("x")[0].strip()
            if pid and pid not in eta_by_product:
                eta_by_product[pid] = str(row["expected_date"])

    alert_lines = []
    for a in alerts:
        eta = eta_by_product.get(a["product_id"], "no ETA")
        alert_lines.append(
            f"{a['product_id']}|{a['name'][:22]}|hand={int(a['total_qty'])}"
            f"|need={int(a['reorder_point'])}|short={int(a['shortfall'])}|inbound ETA {eta}"
        )

    # ── Active outbound orders ──────────────────────────────────────────────────
    outbound_df = database.get_outbound_orders()
    active_orders = outbound_df[outbound_df["status"] != "Delivered"]
    order_lines = [
        f"{r['order_id']}|{r['status']}|{r['customer']}|deliver {r['delivery_date']}|{r['items_summary']}"
        for _, r in active_orders.iterrows()
    ]

    NL = "\n"
    return f"""You are Crestar Warehouse AI, Tuas HQ Singapore. Answer only from the data below. Be brief and factual.

RULES:
- Location answer format: "Zone X, Rack RXX, Level N — qty Y"
- Always cite the exact bin code from the INVENTORY table. Never invent bin codes.
- If a product is ⚠, state the shortfall and inbound ETA from LOW STOCK table.
- Pallet placement: category → preferred zone (see ZONES primary column). Check pallet height ≤ maxH. Overflow to ZE.
- Zone E = open floor; 1 spot fits 4-6 standard pallets (120x80cm footprint).

ZONES: id|type|dims|maxH|used/cap|free|primary
{NL.join(zone_lines)}

INVENTORY: sku|name|qty/reorder|bins(qty)  [⚠=below reorder]
{NL.join(inv_lines)}

LOW STOCK: sku|name|onhand|reorder|shortfall|inbound
{NL.join(alert_lines) if alert_lines else "none"}

ACTIVE ORDERS: id|status|customer|delivery|items
{NL.join(order_lines) if order_lines else "none"}

EXAMPLES:
Q: Where are the Walnut fan blades?
A: Zone A, Rack R04, Level 1 — qty 18. ⚠ Below reorder (need 25, short 7). Restock inbound ETA 2026-05-07.

Q: Which products need reordering?
A: 5 SKUs below reorder point: FB-WD-52 (−7), MT-DC-60 (−8), CT-RC-6 (−5), LT-LED-24 (−10), HW-MK-SLP (−5). All have inbound shipments scheduled.

Q: How many free slots does Zone B have?
A: Zone B has 2 free slots (8 of 10 used). Primary stock: Motors.
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
    Blocking (non-streaming) chat call to Ollama.
    Prepends the grounded system prompt automatically.

    Args:
        messages:      list of {"role": "user"|"assistant", "content": "..."}
        model:         Ollama model name (default: llama3)
        system_prompt: override the auto-built system prompt (optional)

    Returns:
        The assistant reply as a plain string.
    """
    sys_prompt = system_prompt or build_system_prompt()
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
            "```\nollama pull llama3\n```"
        )
    except Exception as e:
        return f"**Error calling Ollama:** {e}"


def chat_stream(
    messages: list[dict],
    model: str = DEFAULT_MODEL,
    system_prompt: str | None = None,
) -> Iterator[str]:
    """
    Streaming chat call to Ollama.
    Yields text chunks as they arrive (token by token).

    Usage:
        for chunk in chat_stream(msgs):
            print(chunk, end="", flush=True)
    """
    sys_prompt = system_prompt or build_system_prompt()
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
            "Run `ollama serve` and ensure `llama3` is pulled."
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
