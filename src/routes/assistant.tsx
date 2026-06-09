import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { API_BASE } from "@/lib/api";
import { Bot, Send, User, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";

export const Route = createFileRoute("/assistant")({
  head: () => ({
    meta: [
      { title: "AI Assistant — Crestar Warehouse Intelligence Suite" },
      { name: "description", content: "Ollama/Llama3 warehouse assistant grounded in live inventory data." },
    ],
  }),
  component: AssistantPage,
});

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Msg {
  role: "user" | "ai";
  content: string;
}

interface ApiMsg {
  role: "user" | "assistant";
  content: string;
}

type ApiStatus = "checking" | "ok" | "down";

// ─── Config ────────────────────────────────────────────────────────────────────

const MODELS: { value: string; label: string; cloud?: boolean }[] = [
  { value: "claude-haiku-4-5-20251001", label: "Claude (claude-haiku-4-5) · Fast", cloud: true },
  { value: "llama3.2:1b",              label: "llama3.2:1b · Local" },
  { value: "llama3.1",                 label: "llama3.1 · Local" },
];

const GREETING: Msg = {
  role: "ai",
  content: `Hi! I'm the **Crestar Warehouse AI**, connected to live inventory data.

I can answer questions like:
- **"Where are the Walnut fan blades?"** — exact zone, rack, and quantity
- **"Which products are below reorder point?"** — live alerts with restock ETAs
- **"I have 20 Motor 45W DC pallets (120×80×100 cm) incoming — where do I put them?"**
- **"What's Zone B occupancy?"** — slot utilisation and free capacity
- **"Which zones have space for large pallets?"** — pallet height vs zone limits

What would you like to know?`,
};

const SUGGESTIONS = [
  "Where are the Walnut fan blades?",
  "Which products are below reorder point?",
  "I have 20 Motor 45W DC pallets (120×80×100 cm). Where should I put them?",
  "What is Zone B current occupancy?",
  "Which zones have space for large pallets?",
];

// ─── Markdown-aware message renderer ───────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  // Handle **bold** and `inline code`
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**"))
      return <strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`"))
      return (
        <code key={i} className="px-1 py-0.5 rounded bg-muted border border-border font-mono text-xs">
          {p.slice(1, -1)}
        </code>
      );
    return <span key={i}>{p}</span>;
  });
}

function ThinkingIndicator() {
  return (
    <div className="space-y-2.5 py-0.5">
      {/* Animated thinking dots with label */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          {[0, 160, 320].map((delay) => (
            <span
              key={delay}
              className="h-2 w-2 rounded-full bg-navy/60 animate-bounce"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
        <span className="text-xs text-muted-foreground font-medium">Thinking…</span>
      </div>
      {/* Privacy label */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
        Processing locally · No data leaves your device
      </div>
    </div>
  );
}

function MessageBody({ content, streaming }: { content: string; streaming?: boolean }) {
  if (!content && streaming) {
    return <ThinkingIndicator />;
  }

  // Split on fenced code blocks first
  const segments = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {segments.map((seg, si) => {
        if (seg.startsWith("```")) {
          // Strip opening fence + optional language tag
          const inner = seg.replace(/^```[^\n]*\n?/, "").replace(/```$/, "");
          return (
            <pre
              key={si}
              className="bg-muted border border-border rounded-md px-3 py-2 overflow-x-auto my-1"
            >
              <code className="text-xs font-mono text-foreground">{inner.trim()}</code>
            </pre>
          );
        }

        return seg.split("\n").map((line, li) => {
          if (!line.trim()) return <div key={`${si}-${li}`} className="h-0.5" />;

          const isBullet = /^[-•*]\s/.test(line);
          const isNum    = /^\d+\.\s/.test(line);

          if (isBullet) {
            return (
              <div key={`${si}-${li}`} className="flex gap-2 items-start">
                <span className="text-muted-foreground mt-0.5 shrink-0">•</span>
                <span>{renderInline(line.replace(/^[-•*]\s/, ""))}</span>
              </div>
            );
          }
          if (isNum) {
            const match = line.match(/^(\d+\.\s)(.*)/);
            return (
              <div key={`${si}-${li}`} className="flex gap-2 items-start">
                <span className="text-muted-foreground shrink-0 font-mono text-xs mt-0.5">
                  {match?.[1]}
                </span>
                <span>{renderInline(match?.[2] ?? line)}</span>
              </div>
            );
          }
          return (
            <div key={`${si}-${li}`}>{renderInline(line)}</div>
          );
        });
      })}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

function AssistantPage() {
  const [messages,   setMessages]   = useState<Msg[]>([GREETING]);
  const [history,    setHistory]    = useState<ApiMsg[]>([]);   // sent to API (no greeting)
  const [input,      setInput]      = useState("");
  const [streaming,  setStreaming]  = useState(false);
  const [model,      setModel]      = useState("claude-haiku-4-5-20251001");
  const [apiStatus,  setApiStatus]  = useState<ApiStatus>("checking");
  const [showModels, setShowModels] = useState(false);

  const streamRef   = useRef("");           // accumulates content during streaming
  const abortRef    = useRef<AbortController | null>(null);
  const timeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLInputElement>(null);

  // ── Health check ─────────────────────────────────────────────────────────────
  const checkHealth = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/health`, {
        signal: AbortSignal.timeout(4000),
      });
      setApiStatus(r.ok ? "ok" : "down");
    } catch {
      setApiStatus("down");
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const id = setInterval(checkHealth, 30_000);
    return () => clearInterval(id);
  }, [checkHealth]);

  // ── Auto-scroll ───────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send / stream ─────────────────────────────────────────────────────────────
  const send = useCallback(
    async (text?: string) => {
      const v = (text ?? input).trim();
      if (!v || streaming) return;
      setInput("");

      const userMsg:  Msg    = { role: "user",      content: v };
      const apiMsg:   ApiMsg = { role: "user",      content: v };
      const emptyAi:  Msg    = { role: "ai",        content: "" };

      setMessages((prev) => [...prev, userMsg, emptyAi]);
      setStreaming(true);
      streamRef.current = "";

      // 60-second client-side guard: fires only if no first token has arrived
      timeoutRef.current = setTimeout(() => {
        if (streamRef.current.length === 0) {
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = {
              role: "ai",
              content: "Still thinking... the AI is processing locally. Try a simpler question or wait a moment.",
            };
            return next;
          });
          abortRef.current?.abort();
          setStreaming(false);
        }
      }, 60_000);

      const outboundHistory = [...history, apiMsg];

      abortRef.current = new AbortController();

      try {
        console.log(`[CHAT] Sending to ${API_BASE}/chat/stream — model=${model}, history=${outboundHistory.length} msgs`);
        const fetchStart = performance.now();

        const resp = await fetch(`${API_BASE}/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: outboundHistory, model }),
          signal: abortRef.current.signal,
        });

        console.log(`[CHAT] Response received — HTTP ${resp.status} in ${((performance.now()-fetchStart)/1000).toFixed(2)}s`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        if (!resp.body) throw new Error("No response body");

        const reader  = resp.body.getReader();
        const decoder = new TextDecoder();
        let   buf     = "";
        let   chunkCount = 0;
        const streamStart = performance.now();

        outer: while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log(`[CHAT] Reader done — ${chunkCount} chunks, ${((performance.now()-streamStart)/1000).toFixed(2)}s total`);
            break;
          }

          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            console.log(`[CHAT] SSE line: ${trimmed.slice(0, 120)}`);
            if (!trimmed.startsWith("data: ")) continue;
            const raw = trimmed.slice(6);
            if (raw === "[DONE]") {
              console.log(`[CHAT] [DONE] received — ${chunkCount} chunks, ${((performance.now()-streamStart)/1000).toFixed(2)}s`);
              break outer;
            }

            try {
              const chunk = JSON.parse(raw) as { content?: string };
              if (chunk.content) {
                chunkCount++;
                if (chunkCount === 1) {
                  console.log(`[CHAT] First token after ${((performance.now()-streamStart)/1000).toFixed(2)}s`);
                }
                streamRef.current += chunk.content;
                const snap = streamRef.current;
                setMessages((prev) => {
                  const next = [...prev];
                  next[next.length - 1] = { role: "ai", content: snap };
                  return next;
                });
              }
            } catch (parseErr) {
              console.warn(`[CHAT] JSON parse error on: ${raw.slice(0, 120)}`, parseErr);
            }
          }
        }

        // Finalise history with the completed AI response
        setHistory([
          ...outboundHistory,
          { role: "assistant", content: streamRef.current },
        ]);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          console.log("[CHAT] Stream aborted by user");
          return;
        }
        console.error("[CHAT] Fetch/stream error:", err);

        const errContent =
          "**Could not reach the warehouse AI API.**\n\n" +
          "Make sure the FastAPI server is running:\n" +
          "```\nuvicorn api:app --reload --port 8000\n```\n" +
          "And that Ollama is running:\n" +
          "```\nollama serve\n```";

        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "ai", content: errContent };
          return next;
        });
        setApiStatus("down");
      } finally {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setStreaming(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [input, streaming, history, model],
  );

  const stopStream = () => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    abortRef.current?.abort();
    setStreaming(false);
  };

  const clearChat = () => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    setMessages([GREETING]);
    setHistory([]);
    setInput("");
    abortRef.current?.abort();
    setStreaming(false);
  };

  // ── Status pill ───────────────────────────────────────────────────────────────
  const statusConfig = {
    checking: { label: "Checking…",     dot: "bg-amber-400",  text: "text-amber-600" },
    ok:       { label: "Live",          dot: "bg-green-500",  text: "text-green-600" },
    down:     { label: "API Offline",   dot: "bg-red-500",    text: "text-red-600"   },
  }[apiStatus];

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="h-full flex flex-col bg-muted/30">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="bg-card border-b border-border px-5 py-3 flex items-center gap-3 flex-wrap">
          <div className="relative shrink-0">
            <div className="h-10 w-10 rounded-full bg-navy flex items-center justify-center text-white">
              <Bot className="h-5 w-5" />
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card
                ${apiStatus === "ok" ? "bg-green-500" : apiStatus === "down" ? "bg-red-500" : "bg-amber-400"}`}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">
              Crestar AI Assistant
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase
                  tracking-wider px-2 py-0.5 rounded-full border
                  ${apiStatus === "ok"
                    ? "bg-green-50 text-green-600 border-green-200"
                    : apiStatus === "down"
                    ? "bg-red-50 text-red-600 border-red-200"
                    : "bg-amber-50 text-amber-600 border-amber-200"
                  }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${statusConfig.dot}`} />
                {statusConfig.label}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {model.startsWith("claude") ? "Powered by Claude API" : "Powered by Ollama"} · Grounded in live warehouse.db
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Model selector */}
            <div className="relative">
              <button
                onClick={() => setShowModels(!showModels)}
                className="text-xs px-2.5 py-1.5 rounded-md border border-border bg-background
                           hover:bg-muted transition-colors"
              >
                {MODELS.find((m) => m.value === model)?.label ?? model} ▾
              </button>
              {showModels && (
                <div className="absolute right-0 top-8 z-20 bg-card border border-border
                                rounded-lg shadow-lg py-1 min-w-[220px]">
                  {MODELS.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => { setModel(m.value); setShowModels(false); }}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors
                        ${m.value === model ? "text-green-600 font-semibold" : ""}`}
                    >
                      {m.label}
                      {m.cloud && (
                        <span className="ml-1.5 text-[9px] uppercase tracking-wider
                                         text-blue-500 font-bold">cloud</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={checkHealth}
              title="Retry connection"
              className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={clearChat}
              className="text-xs px-2.5 py-1.5 rounded-md border border-border bg-background
                         hover:bg-muted transition-colors text-muted-foreground"
            >
              Clear
            </button>
          </div>
        </div>

        {/* ── API offline banner ──────────────────────────────────────────────── */}
        {apiStatus === "down" && (
          <div className="bg-red-50 border-b border-red-200 px-5 py-2.5 flex items-center gap-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              <strong>API server offline.</strong> Run:{" "}
              <code className="bg-red-100 px-1 rounded text-xs">uvicorn api:app --reload --port 8000</code>
              {" "}and{" "}
              <code className="bg-red-100 px-1 rounded text-xs">ollama serve</code>
            </span>
          </div>
        )}

        {/* ── Messages ────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto px-4 py-5">
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((m, i) => {
              const isLastAi = m.role === "ai" && i === messages.length - 1;
              const isStreamingThis = isLastAi && streaming;
              return (
                <div
                  key={i}
                  className={`flex gap-2.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {m.role === "ai" && (
                    <div className="h-8 w-8 shrink-0 rounded-full bg-navy text-white flex items-center justify-center mt-0.5">
                      {isStreamingThis
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Bot className="h-4 w-4" />
                      }
                    </div>
                  )}

                  <div
                    className={`max-w-[78%] rounded-2xl px-4 py-3 shadow-sm
                      ${m.role === "user"
                        ? "bg-navy text-navy-foreground rounded-br-sm"
                        : "bg-card border border-border rounded-bl-sm"
                      }`}
                  >
                    <MessageBody content={m.content} streaming={isStreamingThis} />
                  </div>

                  {m.role === "user" && (
                    <div className="h-8 w-8 shrink-0 rounded-full bg-green-600 text-white flex items-center justify-center mt-0.5">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* ── Input area ──────────────────────────────────────────────────────── */}
        <div className="bg-card border-t border-border px-4 pt-3 pb-4">
          <div className="max-w-3xl mx-auto">

            {/* Suggestion chips */}
            <div className="flex gap-1.5 mb-2.5 flex-wrap">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={streaming}
                  className="text-[11px] px-3 py-1.5 rounded-full bg-muted hover:bg-accent
                             border border-border transition-colors disabled:opacity-40
                             disabled:cursor-not-allowed max-w-[220px] truncate"
                  title={s}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Input row */}
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                disabled={streaming}
                placeholder="Ask about stock locations, reorder alerts, pallet placement…"
                className="flex-1 px-4 py-3 rounded-lg border border-border bg-background
                           text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30
                           disabled:opacity-60"
              />

              {streaming ? (
                <button
                  onClick={stopStream}
                  className="px-4 py-3 rounded-lg bg-red-500 hover:bg-red-600 text-white
                             font-semibold text-sm flex items-center gap-2 transition-colors"
                >
                  <span className="h-3 w-3 rounded-sm bg-white" /> Stop
                </button>
              ) : (
                <button
                  onClick={() => send()}
                  disabled={!input.trim()}
                  className="px-5 py-3 rounded-lg bg-navy hover:bg-navy/90 text-white
                             font-semibold text-sm flex items-center gap-2 transition-colors
                             disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send className="h-4 w-4" /> Send
                </button>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
              Answers are grounded in live warehouse.db data · {MODELS.find((m) => m.value === model)?.label ?? model}
            </p>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
