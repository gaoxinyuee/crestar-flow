import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { Bot, Send, User } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/assistant")({
  head: () => ({
    meta: [
      { title: "AI Assistant — Crestar Warehouse Intelligence Suite" },
      { name: "description", content: "Conversational AI for warehouse stock, forecasts and deliveries." },
    ],
  }),
  component: AssistantPage,
});

interface Msg { role: "user" | "ai"; content: string }

const seed: Msg[] = [
  { role: "user", content: "How many wooden fan blades do we have and where are they?" },
  { role: "ai", content:
`🪵 **Wooden Fan Blades — Current Stock**

📦 **Total: 5 units remaining** across the warehouse

📍 **Locations**
• Zone A, Row 3, Shelf B — 2 units (SKU: FB-W52-003)
• Zone C, Row 1, Shelf A — 3 units (SKU: FB-W46-001)

⚠️ Stock is below the minimum threshold of 15 units. Based on last month's sales, you'll need at least **22 units** for next month. I recommend raising a purchase order soon.` },

  { role: "user", content: "Which parts are we likely to run out of next month?" },
  { role: "ai", content:
`📊 **Forecast Alert — Parts at Risk (Next 30 Days)**

Based on your purchase order history:

1. 🔴 **Fan Blade 52" Wooden** — Stock: 5, Forecast need: 22. **ORDER NOW.**
2. 🔴 **Motor Unit Type-A** — Stock: 8, Forecast need: 19. **ORDER NOW.**
3. 🟡 **Wiring Kit Standard** — Stock: 11, Forecast need: 18. Order by end of week.

Shall I draft purchase orders for the critical items?` },

  { role: "user", content: "What time will the driver reach FurnishCo today?" },
  { role: "ai", content:
`🚚 **Delivery Update — FurnishCo (Queenstown)**

Stop 4 of today's run. Current status: **Pending**.

Based on live LTA traffic data:
• Driver Ahmad is currently at **Stop 2 (Clementi)** — In Transit
• PIE near Clementi showing heavy congestion (+12 min delay)

⏱ Revised ETA to FurnishCo: **13:45** (original: 13:30)

I've updated the delivery schedule. Would you like me to send a notification to FurnishCo?` },
];

const suggestions = [
  "🪵 Where are the wooden fan blades?",
  "📦 What should I reorder this week?",
  "🚚 Where is today's driver now?",
];

function renderInline(text: string) {
  // Split on **bold**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>;
    }
    return <span key={i}>{p}</span>;
  });
}

function MessageBody({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        return <div key={i}>{renderInline(line)}</div>;
      })}
    </div>
  );
}

function AssistantPage() {
  const [messages, setMessages] = useState<Msg[]>(seed);
  const [input, setInput] = useState("");

  const send = (text?: string) => {
    const v = (text ?? input).trim();
    if (!v) return;
    setMessages((m) => [
      ...m,
      { role: "user", content: v },
      { role: "ai", content: "🔍 Checking warehouse data… one moment.\n\nI'll have an answer for you shortly. (This is a prototype — connect Crestar Cloud to enable live responses.)" },
    ]);
    setInput("");
  };

  return (
    <AppLayout>
      <div className="h-full flex flex-col bg-muted/40">
        {/* Chat header */}
        <div className="bg-card border-b border-border px-6 py-4 flex items-center gap-3">
          <div className="relative">
            <div className="h-10 w-10 rounded-full bg-navy flex items-center justify-center text-white">
              <Bot className="h-5 w-5" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green border-2 border-card" />
          </div>
          <div>
            <div className="font-semibold flex items-center gap-2">
              Crestar AI Assistant
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-soft text-green">Online</span>
            </div>
            <div className="text-xs text-muted-foreground">Ask me about stock, orders, forecasts, or deliveries</div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="text-center">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground bg-card px-3 py-1 rounded-full border border-border">Today · 09:42</span>
            </div>
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "ai" && (
                  <div className="h-8 w-8 shrink-0 rounded-full bg-navy text-white flex items-center justify-center">
                    <Bot className="h-4 w-4" />
                  </div>
                )}
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-3 shadow-sm ${
                    m.role === "user"
                      ? "bg-navy text-navy-foreground rounded-br-sm"
                      : "bg-card border border-border rounded-bl-sm"
                  }`}
                >
                  <MessageBody content={m.content} />
                </div>
                {m.role === "user" && (
                  <div className="h-8 w-8 shrink-0 rounded-full bg-green text-white flex items-center justify-center">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="bg-card border-t border-border p-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-2 mb-2 flex-wrap">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s.replace(/^[^\w]+\s*/, ""))}
                  className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-accent border border-border transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Ask me about stock, forecasts, deliveries, or warehouse operations..."
                className="flex-1 px-4 py-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-green/40"
              />
              <button
                onClick={() => send()}
                className="px-5 py-3 rounded-lg bg-[oklch(0.72_0.13_200)] hover:bg-[oklch(0.65_0.14_200)] text-white font-semibold text-sm flex items-center gap-2 transition-colors"
              >
                <Send className="h-4 w-4" /> Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}