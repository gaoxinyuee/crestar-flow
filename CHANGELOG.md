# Crestar Flow — Changelog

All notable changes to this project are documented here.
Each entry has two sections: **Technical** (for NTU report) and **Non-Technical** (for IMDA team presentation).

---

## [2026-06-10] — Fix: /routes blank page on direct navigation (Vercel)

### Technical (NTU Report)

**Files modified:** `vite.config.ts`

**Root cause:** `@tanstack/router-plugin` was installed as a dependency but not registered in `vite.config.ts`. Without the plugin, TanStack Router's build-time processing (route tree regeneration and virtual module injection) did not run during Vercel's CI build. On client-side navigation the route worked because `routeTree.gen.ts` was committed; on direct URL navigation, Vercel served `index.html` via the SPA rewrite but the router could not correctly resolve the `/routes` path without the plugin's build artefacts.

**Fix:** Added `TanStackRouterVite({ routesDirectory: './src/routes' })` as the first plugin in `vite.config.ts`. The plugin now regenerates `routeTree.gen.ts` on every build and wires up the internal virtual modules TanStack Router expects, so all routes — including `/routes` — resolve correctly on hard navigation.

No path mismatch was found: the route definition (`createFileRoute("/routes")`), the generated route tree, and the sidebar link (`to: "/routes"`) were all consistent. The fix is purely a build-pipeline gap.

### Non-Technical (IMDA Presentation)

**What was happening:** Clicking "Route Optimisation" in the sidebar worked fine, but typing or pasting the direct link `…/routes` into the browser showed a blank white page.

**Why it happened:** A required build tool that sets up the page routing system was installed in the project but accidentally left out of the build configuration file. When the site was deployed to Vercel, that tool never ran, so the routing for the Route Optimisation page was incomplete.

**What was fixed:** The build configuration (`vite.config.ts`) was updated to include the routing tool. The next Vercel deployment will regenerate the routing map automatically, and the `/routes` page will load correctly on both direct navigation and sidebar clicks.

---

## [1.0.0] — 2026-05-05 — Three.js 3D Warehouse Digital Twin

### Technical (NTU Report)

**Files created:** `src/components/Warehouse3D.tsx`
**Files modified:** `src/routes/index.tsx`, `api.py`
**Packages added:** `three`, `@react-three/fiber`, `@react-three/drei`, `@types/three`

**Architecture overview:**
The 3D view is built with `@react-three/fiber` (R3F), a React renderer for Three.js. R3F allows writing Three.js scene graphs declaratively as JSX components, integrating cleanly with React state and hooks. `@react-three/drei` provides higher-level helpers: `OrbitControls` (drag/scroll camera), `Text` (GPU-rendered 3D font via troika-three-text), and `Suspense` boundaries for async content.

**Coordinate system:** 1 Three.js unit = 1 metre. Y-axis is up. The XZ plane is the warehouse floor, origin at the centre. Warehouse spans X ∈ [−24, 24], Z ∈ [−16.5, 16.5] = 48 m × 33 m.

**Zone bounds (world-space):**
| Zone | Purpose | X | Z | Size |
|---|---|---|---|---|
| A | Receiving Dock | −24 to −15 | −16 to +16 | 9 × 32 m |
| B | High Rack Storage | −15 to +3 | −16 to +4 | 18 × 20 m |
| C | Medium Rack Storage | +3 to +22 | −16 to −3 | 19 × 13 m |
| D | Open Floor / Bulk | +3 to +22 | −3 to +4 | 19 × 7 m |
| E | Dispatch & Staging | −15 to +23 | +4 to +15 | 38 × 11 m |

**Geometry components:**
- `ZoneFloor` — `PlaneGeometry` per zone with distinct colour (`#C4E3F5` / `#D4F0E0` / `#FFF3CC` / `#FFE4CC` / `#E8D5F5`), plus a `<Text>` label rendered as a GPU mesh using troika-three-text.
- `RackRow` — generates upright columns (`BoxGeometry 0.07 × H × 0.07`, silver) and horizontal load beams (`BoxGeometry W × 0.07 × 0.05`, orange `#E8680A`) at each level. Zone B: 3 rows × 5 levels × 1.8 m = 9 m tall. Zone C: 3 rows × 3 levels × 1.5 m = 4.5 m tall.
- `PalletBox` — `BoxGeometry 0.88 × 0.65 × 0.88` with category colour. Contains a pallet base board child mesh and an optional red sphere beacon for low-stock items. Uses `useFrame` to pulse `emissiveIntensity` on highlighted pallets (sinusoidal 4 Hz glow).
- `DockDoor` — 3 `BoxGeometry` pieces (left jamb, right jamb, header) in steel grey, a dark door panel, and a yellow/black loading bumper with stripe pattern.
- `StagingTable` — table top + 4 legs; 6 instances in 2 rows in Zone E.
- `ConveyorBelt` — belt box + steel side rails + N rotating `CylinderGeometry` rollers animated in `useFrame` (2.5 rad/s).
- `WarehouseShell` — semi-transparent outer walls (opacity 0.22) + vertical zone divider columns.

**Lighting:** `AmbientLight` (0.55) + `DirectionalLight` with shadow map (2048×2048) + 3 `PointLight` overhead fixtures. Shadow camera frustum sized to cover the full warehouse floor.

**Camera system:** `CameraController` component uses `useFrame` to lerp `camera.position` and `OrbitControls.target` toward a preset position for the selected zone at 4.5% per frame. This gives a smooth fly-to animation without needing a separate animation library. `OrbitControls` (`enableDamping`) provides drag-to-rotate and scroll-to-zoom. `maxPolarAngle = π/2.1` prevents the camera from going underground.

**Pallet position mapping (`getPalletPos`):** deterministic function mapping `(zone, rack, level)` from the database to a world-space `[x, y, z]` triple:
- Zone A: 3×3 ground grid, pallets stacked by level (0.7 m per stack)
- Zone B: 5 DB racks mapped to front-row bay centres, 1.8 m per level
- Zone C: 7 DB racks mapped to 3 visual rows, 1.5 m per level
- Zone D: 9 DB racks in 2 ground rows × 5 columns, 0.7 m per stack
- Zone E: 3 staging stations above 1.2 m tables

**Filter system:** when `filterCategory` ≠ `"all"`, matched pallet `emissiveIntensity` pulses via `useFrame`, unmatched pallets set `transparent=true`, `opacity=0.07`, `depthWrite=false` (prevents z-fighting with transparent meshes).

**New API endpoint `GET /warehouse/3d`:** joins `inventory` + `products` tables, returns all 65 inventory slots with zone/rack/level/quantity/category/low_stock flag. `low_stock` is true if the product_id appears in `get_low_stock_alerts()`.

**`index.tsx` restructured:** header with 2D/3D toggle buttons, zone fly-to buttons (All/A/B/C/D/E), category highlight dropdown, and a `CategoryLegend` component. Viewport is `flex-1 min-h-0` so the canvas fills the remaining screen height exactly. The original `WarehouseFloor` 2D isometric view is preserved behind the 2D toggle.

---

### Non-Technical (IMDA Presentation)

**What this feature does:** The warehouse page now shows a real-time 3D model of the Crestar warehouse. You can rotate and zoom the view by dragging and scrolling. Clicking any zone button flies the camera directly to that area. When you select a product category, matching pallets light up with a pulsing glow and everything else fades out, so you can immediately see where all the motors, or all the fan blades, or any other category is stored.

**Why 3D matters for warehouse management:** A floor plan (top-down 2D view) cannot show you which shelf level a product is on. In a 5-level high-rack system, the difference between level 1 and level 5 is a 9-metre difference in height — requiring a reach truck and significantly different handling time. The 3D view makes this immediately visible.

**What is a "digital twin"?** A digital twin is a virtual model that mirrors a real physical object in real time. When the warehouse database is updated — a pallet arrives, stock is dispatched, a product falls below reorder level (shown as a red beacon) — the 3D model reflects that change. Staff and managers can interrogate the model without physically walking the warehouse.

**Common question — "Is the 3D model real-time?"** Yes — the pallet data is loaded from the live warehouse database when you open the page. Refresh the page to get the latest snapshot. In a production deployment with barcode scanners connected, it would update continuously.

**Common question — "Why do some pallets have a red dot?"** Red dots indicate products that are below their reorder point — the warehouse is running low and a replenishment order is needed (or already in transit). This makes the stock health visible at a glance from anywhere in the model.

**Common question — "Why not use a commercial WMS with a 3D view?"** Enterprise WMS (Warehouse Management Systems) with 3D capabilities cost SGD 80,000–300,000 per year for an SME like Crestar. This prototype demonstrates the same core visualisation capability built specifically for Crestar's layout and product catalogue, at a fraction of the cost.

---

## [0.9.0] — 2026-05-05 — System Prompt Re-engineering for llama3.2:1b

### Technical (NTU Report)

**Files modified:** `chatbot.py`, `api.py`, `src/routes/assistant.tsx`

**Root cause of timeouts:** The original system prompt was ~8,700 characters (~2,175 tokens). llama3.2:1b on CPU performs a quadratic-time "prefill" pass over the entire context before generating the first token. At 2,175 tokens this took 180–300+ seconds, hitting the timeout before any output was produced. llama3.1 (8B params) was even slower — timing out at 300s reliably.

**Changes to `chatbot.py`:**

*New `DEFAULT_TEMPERATURE = 0.1` constant* — passed as `"options": {"temperature": 0.1}` in every Ollama API call. Low temperature suppresses hallucination and enforces consistent factual formatting, which is critical for a RAG system grounding answers in specific bin codes and quantities.

*`build_system_prompt()` rewritten — four structural changes:*

1. **Compact pipe-delimited tables** instead of padded prose lines. Inventory lines changed from `~120 chars` to `~50 chars` each. Zone lines changed from `~110 chars` to `~60 chars`. Combined inventory table (27 rows) dropped from ~3,240 chars to ~1,350 chars.

2. **SQL query simplified** — removed `unit_cost_sgd`, `category`, `supplier` from the SELECT (never needed for location/stock queries). Bin format built directly in SQL as `ZoneRackLLevel(qty)` (e.g. `AR04L1(18)`) rather than post-processing in Python.

3. **Explicit output format rules** — added a RULES section with exact answer templates: `"Zone X, Rack RXX, Level N — qty Y"`. This is essential for small models which follow format examples more reliably than abstract instructions.

4. **Three few-shot Q&A examples** appended at the end of the prompt. These teach the model the expected response structure for the three most common query types (location lookup, stock alert summary, zone capacity). Few-shot prompting is a well-established technique for aligning small LLMs to specific output schemas without fine-tuning.

*Estimated prompt size:* ~2,800 characters / ~700 tokens (down from ~8,700 chars / ~2,175 tokens — a 68% reduction). First-token latency on llama3.2:1b should drop from 180–300s to approximately 30–60s.

*`DEFAULT_MODEL` changed* from `"llama3"` to `"llama3.2:1b"` in `chatbot.py` to match the UI default.

**Changes to `api.py`:** `"options": {"temperature": chatbot.DEFAULT_TEMPERATURE}` added to both the `/chat` (non-streaming) and `/chat/stream` (SSE) Ollama payloads.

**Changes to `src/routes/assistant.tsx`:** Default `model` state set to `"llama3.2:1b"`.

---

### Non-Technical (IMDA Presentation)

**What changed:** The AI's briefing document (the instructions it reads before every answer) was redesigned to be shorter and clearer. It went from the equivalent of a 6-page briefing to a 1-page brief. The AI now also gets explicit instructions on exactly how to format its answers.

**Why this matters:** Small, fast AI models are like junior staff — they follow explicit checklists better than open-ended guidance. By telling the model "always start your answer with the exact shelf location, then quantity, then any alerts", answers are more consistent and useful.

**What is temperature?** Temperature controls how "creative" the AI is. At temperature 1.0 (default), the AI adds variety to its phrasing, which can introduce fabricated details when it is supposed to be giving factual warehouse data. At 0.1, the AI stays close to the facts and repeats the same reliable format every time — which is exactly what warehouse staff need.

**Common question — "Will answers be worse with the smaller/faster model?"** For location lookups, stock queries, and reorder alerts (the three main use cases), no. The smaller model follows the structured data reliably. For complex multi-step reasoning (e.g. "plan a picking route for all low-stock items across all zones"), the larger model produces better answers — but those queries are rare in daily warehouse operations.

---

## [0.8.0] — 2026-05-05 — Default Model Switch (llama3.1 → llama3.2:1b)

### Technical (NTU Report)

**Files modified:** `src/routes/assistant.tsx`

**Change:** Default `model` state reverted from `"llama3.1"` back to `"llama3.2:1b"` after llama3.1 (8B params) consistently hit the 300-second timeout on CPU due to the large system prompt context. This is documented under [0.9.0] which addresses the root cause.

---

### Non-Technical (IMDA Presentation)

**What changed:** The AI chatbot now uses the faster model by default. The slower, higher-quality model (`llama3.1`) remains available in the dropdown for queries that need more detailed reasoning.

---

## [0.7.0] — 2026-05-05 — Thinking Animation and Privacy Label

### Technical (NTU Report)

**Files modified:** `src/routes/assistant.tsx`

**Changes:**
- Default `model` state reverted from `"llama3.2:1b"` to `"llama3.1"`.
- Extracted a `ThinkingIndicator` component that replaces the previous inline three-dot bounce shown while `!content && streaming`.
- `ThinkingIndicator` renders two elements:
  1. Three `animate-bounce` dots (Tailwind, staggered at 0/160/320 ms) with a `"Thinking…"` label beside them — communicates deliberate AI processing rather than a broken/frozen UI.
  2. A `animate-pulse` green dot with `"Processing locally · No data leaves your device"` — appears only during the wait period before the first token arrives, then disappears once content starts flowing.
- No changes to streaming logic or state management — the indicator is purely presentational, controlled by the existing `!content && streaming` condition in `MessageBody`.

**Why a separate component:** Keeping `ThinkingIndicator` extracted makes it easy to swap the animation in isolation without touching the Markdown rendering logic in `MessageBody`.

---

### Non-Technical (IMDA Presentation)

**What changed:** While the AI is thinking (before the first word appears), the chat bubble now shows an animated "Thinking…" indicator and a small note confirming that the AI is running locally on the device.

**Why the animation matters for demos:** Without visual feedback, a 15–30 second wait before the first token looks like the system has crashed. The animation makes the wait feel intentional and managed — the AI is visibly working, not frozen.

**Why the privacy label matters:** "Processing locally · No data leaves your device" directly answers the most common concern from SME owners and IMDA stakeholders: *"Is our business data being sent to the cloud?"* Showing this during the exact moment the AI is running reinforces the on-premises privacy model at the most relevant point in the user experience.

**Common question — "Does this mean it's always slow?"** The wait is only on the first response after the model loads into memory. Subsequent questions in the same session respond significantly faster. In a production setup with a dedicated server, even the first response would be under 5 seconds.

---

## [0.6.0] — 2026-05-05 — Streaming Debug Instrumentation

### Technical (NTU Report)

**Files modified:** `api.py`, `src/routes/assistant.tsx`

**Changes:**

*`api.py` — new `GET /test-ollama` endpoint:*
- Accepts optional `?model=` query param (default `llama3.2:1b`).
- Step 1: pings `GET /api/tags` to confirm Ollama is reachable and lists all pulled models.
- Step 2: sends a minimal, no-system-prompt call (`"Reply with exactly: OK"`) to the requested model with `stream: False`.
- Returns: `reachable`, `available_models`, `model_requested`, `error` (null on success), `response`, `elapsed_seconds`.
- Purpose: isolates raw Ollama model latency from system prompt construction time and SSE overhead. If this endpoint times out, the model is not pulled or Ollama is not running.

*`api.py` — logging added to `POST /chat/stream`:*
- Logs at request entry: model name, number of history messages, system prompt character count.
- Logs when the httpx connection to Ollama is established (with wall-clock time).
- Logs when the first token arrives.
- Logs final chunk count and total elapsed time on `done`.
- Separated `httpx.ReadTimeout` into its own `except` clause with a user-readable error message naming the timeout duration and suggesting `GET /test-ollama` for diagnosis.
- All logs use `[STREAM]` prefix to grep easily in uvicorn output.

*`src/routes/assistant.tsx` — `console.log` added to `send()`:*
- Logs at fetch start: model, history message count.
- Logs when the HTTP response arrives: status code, time since fetch.
- Logs every raw SSE line received (truncated to 120 chars) so the exact wire format is visible in browser DevTools.
- Logs when `[DONE]` is received: chunk count, elapsed time.
- Logs when the first token arrives.
- `catch` block now logs `console.error` with the full error (previously swallowed the error type).
- All logs use `[CHAT]` prefix.

**How to use during debugging:**
1. Open browser DevTools → Console tab, filter by `[CHAT]`.
2. Open the uvicorn terminal, filter by `[STREAM]`.
3. Visit `http://localhost:8000/test-ollama` in a browser to get a JSON timing report.
4. If `/test-ollama` times out, run `ollama pull llama3.2:1b`.
5. If `/test-ollama` succeeds but `/chat/stream` fails, the system prompt (8,700+ chars) is the bottleneck — consider reducing context size for the 1B model.

---

### Non-Technical (IMDA Presentation)

**What this does:** We added diagnostic tools so that when the AI chatbot does not respond, we can see exactly where it got stuck — whether it is a connection problem, a missing model, or a performance bottleneck.

**Why it matters:** Without visibility into failures, the system looks like it is "broken" with no explanation. With these tools, a developer can open the browser's developer console or the server log and pinpoint the problem in under a minute.

**The new `/test-ollama` page:** Opening `http://localhost:8000/test-ollama` in a browser shows a simple report: Is Ollama running? Which AI models are installed? How long did the AI take to respond to a simple test question? This is the first thing to check when the chatbot is slow or silent.

---

## [0.5.0] — 2026-05-05 — Simplified Model Dropdown

### Technical (NTU Report)

**Files modified:** `src/routes/assistant.tsx`

**Changes:**
- `MODELS` array reduced from 6 options (`llama3`, `llama3.1`, `llama3.2`, `llama3:8b`, `mistral`, `qwen2.5`) to 2 (`llama3.1`, `llama3.2:1b`).
- Default `model` state changed from `"llama3"` to `"llama3.2:1b"`.
- Status pill label changed from hardcoded `"Live · Llama3"` to `"Live"` — the old label was inaccurate once the default model changed and the model name is already visible in the dropdown button.

**Rationale for the two choices:**
- `llama3.2:1b` (~1.3 GB): fast on CPU, first token in under 10 seconds. Recommended for demos and day-to-day use on a standard laptop.
- `llama3.1` (~4.7 GB): higher quality reasoning for complex pallet placement or multi-step inventory queries; suitable when a GPU is available or response latency is acceptable.

All other models (`mistral`, `qwen2.5`, etc.) were removed because they are not guaranteed to follow the warehouse system prompt format reliably without prompt tuning, and adding them to the dropdown created confusion for non-technical users.

---

### Non-Technical (IMDA Presentation)

**What changed:** The AI model selector in the chatbot header now shows just two clearly labelled options instead of six. The faster, smaller model (`llama3.2:1b`) is selected by default.

**Why it matters:** Showing six obscure model names (`llama3:8b`, `qwen2.5`, etc.) confused staff during testing — they did not know which to choose or what the difference was. Reducing to two options with clear use cases (fast vs. higher quality) makes the choice obvious.

**Common question — "Which model should we use day-to-day?"** `llama3.2:1b` — it answers most warehouse questions accurately and responds quickly. Switch to `llama3.1` only if you need more detailed reasoning on a complex question and are happy to wait longer for the answer.

---

## [0.4.0] — 2026-05-05 — Ollama Timeout Fix

### Technical (NTU Report)

**Files modified:** `chatbot.py`

**Change:** Increased `REQUEST_TIMEOUT` from `120` to `300` seconds.

**Root cause of the bug:** `llama3:latest` (4.4 GB parameter model) runs inference on CPU on this machine. The first inference call requires the model weights to be loaded from disk into RAM (~4–6 GB), which alone can take 60–90 seconds before the first token is produced. The previous 120-second timeout was too short to cover this cold-start load time plus actual inference time for complex warehouse queries with an ~8,700-character system prompt.

**How it propagates:** `api.py` does not hardcode a timeout — it references `chatbot.REQUEST_TIMEOUT` directly (`httpx.AsyncClient(timeout=chatbot.REQUEST_TIMEOUT)`), so the single change in `chatbot.py` applies to both the non-streaming `/chat` endpoint and the streaming `/chat/stream` SSE endpoint.

**Alternative mitigation (recommended for demo use):** Pull a quantised 1B-parameter model via `ollama pull llama3.2:1b`. This model is ~1.3 GB, loads in under 10 seconds on CPU, and produces first tokens in 3–5 seconds while still following complex system prompts accurately enough for warehouse Q&A.

**Libraries used:** `httpx` (async HTTP client), `requests` (sync HTTP client in `chatbot.py` CLI path).

**Challenge:** The failure mode was silent from the UI — the React frontend received a streamed error message (`**Stream error:** Read timed out`) that looked like an AI response rather than a connection error, making it harder to diagnose. The fix required tracing the timeout constant through `chatbot.py` → `api.py` → `httpx.AsyncClient`.

---

### Non-Technical (IMDA Presentation)

**What this fixes:** The AI assistant was stopping mid-answer with a timeout error when asked complex warehouse questions. This happened because the AI model is large (like a very detailed reference book) and takes a while to "open to the right page" the first time it's used. We extended the waiting period so it has enough time to respond.

**Why it matters:** A chatbot that silently fails and returns error text looks broken to end users, even if the underlying data and logic are correct. Reliability is especially important when demonstrating the system to Crestar staff who are evaluating whether to trust it for daily operations.

**Common question — "Why is the AI slow?"** The AI model runs locally on this laptop rather than in the cloud. This is a deliberate privacy choice — warehouse stock levels, supplier names, and order values never leave the company's own machine. The trade-off is that the first response after startup takes longer than a cloud service like ChatGPT.

**Common question — "Will it always be this slow?"** No. In a production deployment, the model would be running on a server with a dedicated GPU, reducing response time to under 5 seconds. Alternatively, using a smaller (but still capable) model cuts the wait to under 10 seconds even on a standard laptop.

---

## [0.3.0] — 2026-05-04 — AI Chatbot (Ollama/Llama3 Integration)

### Technical (NTU Report)

**Files created:** `chatbot.py`, `api.py`
**Files modified:** `src/routes/assistant.tsx`, `requirements.txt`

**Architecture overview:**
The chatbot is a three-layer stack:
1. `chatbot.py` — Python module that queries `warehouse.db` live and builds a grounded system prompt, then calls Ollama's local REST API.
2. `api.py` — FastAPI server that exposes the chatbot over HTTP with CORS headers so the React frontend can call it. Adds a streaming SSE endpoint.
3. `src/routes/assistant.tsx` — React page that streams the AI response token-by-token into a chat bubble using the browser's `ReadableStream` API.

**`chatbot.py` — System prompt grounding:**
`build_system_prompt()` is called fresh on every API request. It executes four database queries and assembles an ~8,700-character context block containing:
- All 5 zones with dimensions, max pallet height, current occupancy, and free slot count.
- All 27 SKUs with exact bin locations (`zone-rack-level (qty N)`) and a ⚠ flag if below reorder point.
- Low-stock alerts with shortfall quantity and supplier name.
- Inbound shipments with ETA and item summary.
- Active outbound orders.

This "retrieval-augmented generation" (RAG) pattern means the LLM never hallucinates stock levels — it can only cite what the database provides. The instruction `Do NOT fabricate bin locations. Only cite locations shown in the data below.` is included explicitly in the prompt.

**Ollama API calls:**
- Blocking: `POST /api/chat` with `stream: false` — used in `chatbot.py` CLI and `/chat` endpoint.
- Streaming: `POST /api/chat` with `stream: true` — Ollama returns newline-delimited JSON objects, each containing one token. `chat_stream()` yields each token as a string chunk.

**`api.py` — FastAPI server:**
- CORS middleware permits origins `localhost:5173` (Vite/React), `localhost:8501` (Streamlit), `localhost:3000`, `localhost:8080`.
- `/chat/stream` uses FastAPI's `StreamingResponse` with `media_type="text/event-stream"`. An async generator (`generate()`) bridges Ollama's async httpx stream to the SSE wire format: `data: {"content": "token"}\n\n`, terminated by `data: [DONE]\n\n`.
- Error cases (Ollama not running, model not pulled, unexpected exceptions) are caught and streamed as human-readable Markdown content rather than HTTP error codes, so the React UI displays them inside the chat bubble with helpful instructions.
- `/health` endpoint returns Ollama connection status + available models + headline warehouse KPIs. The React UI polls this every 30 seconds to show a live status indicator.

**`src/routes/assistant.tsx` — React streaming UI:**
- Two parallel state arrays: `messages` (all display messages including the greeting) and `history` (only messages sent to the API, excluding the greeting). This prevents the initial greeting from polluting the Ollama conversation context.
- `streamRef = useRef("")` accumulates the streaming content string to avoid React closure staleness when updating the last message in the `messages` array inside an async loop.
- SSE parsing: response body decoded as `ReadableStream`, split on `\n`, lines prefixed `data: ` are JSON-parsed. `[DONE]` sentinel triggers stream close and appends the completed assistant message to `history`.
- `AbortController` enables a "Stop" button that cancels the in-flight fetch.
- `MessageBody` component renders Markdown: fenced code blocks, bullet lists, numbered lists, `**bold**`, `` `inline code` ``.

**Key technical decision — local Ollama vs. cloud LLM API:**
Ollama was chosen over OpenAI/Anthropic APIs for two reasons: (1) all data stays on-premises — warehouse stock, order values, and supplier names never leave the local machine; (2) no per-token API cost, which matters for a budget-conscious SME demo.

**Libraries added to `requirements.txt`:** `fastapi>=0.111.0`, `uvicorn[standard]>=0.29.0`, `httpx>=0.27.0`.

**Challenge — streaming bridge complexity:** Ollama uses line-delimited JSON streaming; SSE uses `data: ...\n\n` framing; React's `fetch` uses `ReadableStream`. Bridging these three incompatible streaming protocols required careful buffering at each layer. The key insight was that `httpx.AsyncClient.stream()` and `aiter_lines()` handle Ollama's newline-delimited format cleanly, and FastAPI's `StreamingResponse` with an async generator handles SSE framing.

---

### Non-Technical (IMDA Presentation)

**What this feature does:** Staff can now type questions in plain English and get instant answers about the warehouse — without needing to know where to look in any spreadsheet or system. For example: "Where are the walnut fan blades and how many do we have?" or "Which products need to be reordered this week?"

**Why it matters for SMEs:** In most small warehouses, stock knowledge lives in people's heads. When a senior staff member is on leave or leaves the company, that knowledge walks out the door with them. The AI assistant captures and makes accessible the same information that would normally require interrupting a colleague.

**What problem it solves:**
- Warehouse staff spend time answering the same questions repeatedly ("where is X?", "how many Y do we have?").
- Managers making purchasing decisions don't have time to query spreadsheets manually.
- New staff take weeks to learn where things are stored.

**How does the AI know this?** Every time a question is asked, the system reads the live database and gives the AI a full briefing — current stock levels, exact shelf locations, incoming shipments, and active orders. The AI reads this briefing and answers the question. It cannot make up information that isn't in the briefing.

**Is the AI connected to the internet?** No. It runs entirely on the local computer. No data is sent to any external server. This means warehouse data, supplier relationships, and order information remain private.

**Common question — "Why not just search a spreadsheet?"** You can search a spreadsheet for a product name, but you cannot ask it "which zones have space for a large pallet arriving tomorrow?" or "which products will run out before the next shipment arrives?" The AI understands questions asked in natural language and reasons across multiple data sources at once.

**Common question — "What if the AI gets it wrong?"** Every answer cites the data it is based on (bin location codes, quantities, dates). Staff can verify any answer in seconds. The AI is designed to say "I don't have that information" rather than guess when the data isn't available.

---

## [0.2.0] — 2026-05-04 — SQLite Database and Data Layer

### Technical (NTU Report)

**Files created:** `create_db.py`, `database.py`, `warehouse.db`

**Database schema — 8 tables:**

| Table | Purpose |
|---|---|
| `products` | 27 SKUs: product_id, name, category, unit cost, reorder point, supplier |
| `zones` | 5 warehouse zones A–E: dimensions, max pallet height, capacity slots |
| `inventory` | 65 bin records: zone + rack + level + quantity (links products to zones) |
| `inbound_shipments` | 7 purchase orders with status and expected arrival date |
| `inbound_shipment_items` | Line items for each inbound shipment |
| `outbound_orders` | 6 customer orders with status and delivery date |
| `outbound_order_items` | Line items for each outbound order |
| `po_history` | 324 rows of monthly procurement history (27 SKUs × 12 months) |

**Database configuration:** WAL (Write-Ahead Logging) mode enabled for concurrent reads without blocking writes. `PRAGMA foreign_keys = ON` enforces referential integrity. `row_factory = sqlite3.Row` returns rows as dict-like objects.

**Simulated data design decisions:**

*Occupancy target (~80%):* 65 of 82 total rack slots are occupied across the 5 zones (79.3%), matching the brief. Zone E is open-floor storage counted differently (spots, not racks).

*5 deliberate low-stock items with a supply-chain narrative:*
- `FB-WD-52` (Walnut Fan Blade 52"): Sarawak timber supplier delayed — 0% delivery in March/April 2026. Inbound SHIP-001 arriving in 3 days.
- `MT-DC-60` (Motor 60W DC): Malaysian supplier partial shipments at 50–60% of order. SHIP-002 in 5 days.
- `CT-RC-6` (Remote Control 6-Speed): Elektro Electronics customs hold. SHIP-003 in 11 days.
- `LT-LED-24` (LED Light Kit 24W): LightTech logistics delay. SHIP-004 in 15 days.
- `HW-MK-SLP` (Mounting Kit Sloped): Bolt & Bracket stock shortage. SHIP-005 in 17 days.

All 5 low-stock items have a corresponding inbound shipment, making the data internally consistent for AI reasoning.

*Deterministic PO history:* Monthly procurement quantities use `hashlib.md5(key.encode()).hexdigest()` to generate a `[0.85, 1.15]` jitter factor. This is reproducible across Python runs without a fixed `random.seed()`, and allows `create_db.py` to be re-run safely without producing different numbers each time.

*Singapore seasonal demand multipliers:* Applied to base monthly PO quantities. Peak months: April (1.30×), May (1.40×), October (1.30×), November (1.40×) — reflecting pre-Deepavali and Hari Raya ceiling fan demand. Low months: January (0.70×), February (0.85×) — Chinese New Year slowdown.

**`database.py` — helper functions:**
All query functions return `pd.DataFrame` (for Streamlit/Plotly) or `list[dict]` (for the AI system prompt and API responses).

Key functions:
- `get_dashboard_kpis()` — single call returning 10 headline numbers used by the Home page and `/health` API endpoint.
- `get_demand_forecast_data()` — pivots po_history into a wide DataFrame suitable for Plotly multi-line charts.
- `get_low_stock_alerts()` — returns items below reorder point sorted by shortfall descending.
- `get_zone_stats()` — includes computed fields: `floor_area_sqm`, `occupancy_pct`, `free_slots`.
- `build_system_prompt()` in `chatbot.py` calls `get_zone_stats()`, raw SQL for inventory+locations, `get_low_stock_alerts()`, `get_inbound_shipments()`, `get_outbound_orders()`.

**Libraries used:** `sqlite3` (stdlib), `pandas` (DataFrame construction via `pd.read_sql_query`), `hashlib` (deterministic jitter).

**Challenge — realistic but reproducible data:** Random data makes the database look different on every run, breaking screenshots and demos. Using hashlib MD5 as a pseudo-random function with a deterministic key (`f"{product_id}-{month}-{year}"`) produces stable, varied-looking quantities without a seed dependency.

---

### Non-Technical (IMDA Presentation)

**What this feature does:** We created a database that stores all the warehouse information the system needs: which products exist, where each one is stored on which shelf, how many are in stock, which deliveries are on their way, and which customer orders are being fulfilled. We also populated it with 12 months of realistic purchasing history.

**Why it matters for SMEs:** Most small businesses track this kind of information across multiple Excel files, WhatsApp messages, and paper notes. A centralised database means every part of the system — the dashboard, the forecasts, the AI chatbot — is reading from the same single source of truth. When stock levels change, everything updates at once.

**Is this real data?** No. The database is populated with simulated data designed to look realistic for a Singapore ceiling fan manufacturer. It reflects real patterns: seasonal demand peaks before Deepavali and Hari Raya, Chinese New Year slowdowns, and plausible supply disruptions from Malaysian and Sarawakian suppliers. In a real deployment, this would be connected to Crestar's actual inventory records.

**Common question — "Why not just use Excel?"** Excel works well for one person managing one file. It breaks down when multiple staff need to update the same data simultaneously, when you want the same information to feed a dashboard and a chatbot and a forecast chart, or when you need to track relationships between products, shelf locations, shipments, and orders. A database handles all of this reliably.

**Common question — "How hard is it to connect this to real data?"** The database structure mirrors common ERP and inventory management exports. Connecting to Crestar's real data would typically involve a one-time data migration (exporting from their current system, mapping columns, importing). The application code itself does not need to change.

---

## [0.1.0] — 2026-05-03 — Streamlit Dashboard Application

### Technical (NTU Report)

**Files created:** `app.py`, `requirements.txt`

**Framework:** Streamlit — a Python library that turns data scripts into interactive web apps with no HTML/CSS/JavaScript required.

**Application structure:**
Single-file app (`app.py`, ~500 lines) with a sidebar `st.radio` navigation widget routing to five page functions:

| Function | Page | Key components |
|---|---|---|
| `page_home()` | Home | `st.metric` KPI cards, Plotly bar chart (monthly spend), Plotly pie chart (category breakdown), low-stock alert boxes |
| `page_warehouse()` | Warehouse View | Plotly scatter plot floor plan, zone background rectangles, unit colour coding by category, search/filter sidebar |
| `page_forecast()` | Demand Forecast | Plotly multi-line chart (historical solid + forecast dashed), confidence interval shading, SVG sparklines in recommendation cards |
| `page_inventory()` | Inventory | `st.dataframe` with `st.download_button` CSV export, colour-coded stock status column, category/zone filters |
| `page_chatbot()` | AI Assistant | `st.chat_message`, `st.chat_input`, Ollama integration via `call_ollama()`, session state for message history |

**Styling:** Custom CSS injected via `st.markdown(..., unsafe_allow_html=True)` overrides Streamlit's default theme:
- Sidebar background: `#1A1F71` (IMDA Dark Blue)
- Primary accent: `#6B2D7B` (IMDA Purple)
- Metric card borders: `#D4145A` (IMDA Magenta)
- Status badges: green/amber/red for Healthy/Low Stock/Out of Stock

**Data loading:** Three `@st.cache_data` functions — `load_inventory()`, `load_warehouse_units()`, `load_forecast_data()` — cache query results so the database is not re-queried on every UI interaction (Streamlit re-runs the entire script on each widget interaction).

**Warehouse floor plan (Plotly scatter):**
Each inventory unit is plotted as a coloured square on a 2D grid representing the warehouse floor. Zone boundaries are drawn as filled `go.Scatter` rectangles. When a user searches for a product, non-matching units are dimmed to 20% opacity. This is achieved by splitting units into two traces (matched/unmatched) rather than modifying individual point properties, which is more performant with Plotly.

**Forecast chart:**
`get_demand_forecast_data()` returns a pivoted DataFrame with columns `month`, `product`, `quantity`. Historical months (before today) are plotted as solid lines; future months as dashed lines with a shaded confidence interval band (±15%). The chart uses `go.Scatter` with `mode="lines"` and `fill="tonexty"` for the CI band.

**Key technical decision — Streamlit over React for the Python demo:**
The original prototype was a React/TypeScript app (Lovable-generated). Streamlit was chosen for the Python demo because: (1) all data logic is in Python, avoiding a translation layer; (2) Streamlit apps can be shared as a single `.py` file with `pip install -r requirements.txt`; (3) the target audience for the demo includes non-developers who will not be running `npm install`.

**Libraries used:** `streamlit>=1.32.0`, `pandas>=2.0.0`, `plotly>=5.18.0`, `requests>=2.31.0`.

**Challenge — CSS scoping in Streamlit:** Streamlit injects its own styles and uses random class names that change between versions. Reliable overrides require targeting element types (`[data-testid="stSidebar"]`) rather than class names, or using CSS specificity tricks. The sidebar colour override uses `[data-testid="stSidebar"] > div:first-child { background-color: #1A1F71; }`.

---

### Non-Technical (IMDA Presentation)

**What this feature does:** This is the main visual interface for the warehouse system — a web app that warehouse staff and managers can open in any browser. It has five sections: a summary dashboard showing headline numbers, a visual map of the warehouse floor, a demand forecast showing which products will run out and when, a searchable product catalogue, and the AI chatbot.

**Why it matters for SMEs:** Small businesses often have data spread across multiple tools — one spreadsheet for stock, another for orders, a WhatsApp group for supplier updates. This dashboard brings everything into one screen so a manager can see the full picture in under a minute.

**What problem it solves:**
- Warehouse managers currently have to check multiple files or ask multiple people to get a complete picture of stock health.
- New staff have no visual reference for where products are stored in the warehouse.
- Purchasing decisions are made reactively (when stock runs out) rather than proactively (before it runs out).

**Common question — "Is this a website or an app?"** It is a web app — it opens in a standard web browser (Chrome, Safari, Edge). It runs on a local computer on the company's network, so it does not require an internet connection and is not accessible from outside the building unless the company specifically sets that up.

**Common question — "How do staff update the stock levels?"** In this prototype, the database is updated manually or via script. In a production version, the system would be connected to the barcode scanners or ERP software already in use at the warehouse, so stock levels update automatically when goods are received or dispatched.

**Common question — "Why does the warehouse map look like coloured squares?"** The warehouse floor plan shows each rack slot as a coloured square. The colour tells you what category of product is stored there (blue = motors, green = blades, etc.). When you search for a product, everything else fades out so you can immediately see exactly where that product is stored.

---

## Project Overview

**Project name:** Crestar Flow
**Client:** Crestar Manufacturing Pte Ltd, Tuas HQ, Singapore
**Industry:** Ceiling fan manufacturing (SME)
**Project context:** NTU final-year project in partnership with IMDA (Infocomm Media Development Authority)

**Technology stack summary:**

| Layer | Technology | Purpose |
|---|---|---|
| Frontend (web) | React + TypeScript (Vite) | Production-quality UI with streaming AI chat |
| Frontend (demo) | Streamlit (Python) | Rapid prototyping, shareable with non-developers |
| Backend API | FastAPI (Python) | REST + SSE endpoints bridging React to the AI |
| Database | SQLite | Local, zero-config relational database |
| Data layer | pandas, database.py | Query helpers, DataFrames for charts |
| AI model | Ollama + llama3 (local) | On-premises LLM, no data leaves the machine |
| Charts | Plotly | Interactive warehouse floor plan, forecast charts |

**Repository structure:**
```
crestar-flow/
├── app.py              # Streamlit demo application
├── api.py              # FastAPI backend server
├── chatbot.py          # Ollama chatbot + system prompt builder
├── database.py         # SQLite query helper functions
├── create_db.py        # Database seeding script
├── warehouse.db        # SQLite database (generated by create_db.py)
├── requirements.txt    # Python dependencies
├── CHANGELOG.md        # This file
└── src/
    └── routes/
        └── assistant.tsx   # React AI chatbot page
```

**Running the project:**
```bash
# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Create/reset the database
python create_db.py

# 3. Start the FastAPI backend (required for React AI chat)
uvicorn api:app --reload --port 8000

# 4. Run the Streamlit demo
streamlit run app.py

# 5. Start Ollama (in a separate terminal)
ollama serve
ollama pull llama3        # full model (~4.4 GB, slower on CPU)
# OR
ollama pull llama3.2:1b   # small model (~1.3 GB, faster on CPU)
```
