import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  ComposedChart,
} from "recharts";
import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/forecast")({
  head: () => ({
    meta: [
      { title: "Demand Forecast — Crestar Warehouse Intelligence Suite" },
      { name: "description", content: "AI-driven demand forecasting and reorder recommendations." },
    ],
  }),
  component: ForecastPage,
});

const months = [
  "Jan 24", "Feb 24", "Mar 24", "Apr 24", "May 24", "Jun 24",
  "Jul 24", "Aug 24", "Sep 24", "Oct 24", "Nov 24", "Dec 24",
  "Jan 25", "Feb 25", "Mar 25",
];

const data = months.map((m, i) => {
  const isFc = i >= 12;
  return {
    month: m,
    isForecast: isFc,
    "Fan Blade 52\" Wooden": [14, 16, 13, 18, 20, 17, 19, 22, 21, 24, 23, 25, 22, 24, 27][i],
    "Fan Blade 46\" Metal":  [10, 11, 12, 12, 14, 15, 13, 14, 16, 15, 17, 16, 15, 14, 16][i],
    "Motor Unit Type-A":     [12, 13, 15, 14, 16, 18, 17, 19, 18, 20, 19, 21, 19, 20, 22][i],
    "Housing Casing L":      [18, 17, 19, 20, 21, 19, 22, 20, 23, 21, 22, 24, 20, 21, 23][i],
    "Wiring Kit Standard":   [9, 10, 11, 13, 12, 14, 15, 14, 16, 15, 17, 16, 18, 17, 19][i],
    fcLow:  isFc ? [null,null,null,null,null,null,null,null,null,null,null,null, 18, 19, 22][i] : null,
    fcHigh: isFc ? [null,null,null,null,null,null,null,null,null,null,null,null, 26, 28, 32][i] : null,
  };
});

const lineColors: Record<string, string> = {
  "Fan Blade 52\" Wooden": "oklch(0.68 0.16 158)",
  "Fan Blade 46\" Metal": "oklch(0.62 0.18 245)",
  "Motor Unit Type-A": "oklch(0.72 0.17 55)",
  "Housing Casing L": "oklch(0.58 0.20 300)",
  "Wiring Kit Standard": "oklch(0.55 0.10 220)",
};

interface Rec {
  name: string;
  sku: string;
  stock: number;
  forecast: number;
  order: number;
  urgency: "red" | "amber" | "green";
  trend: number[];
}

const recs: Rec[] = [
  { name: "Fan Blade 52\" Wooden", sku: "FB-W52", stock: 5, forecast: 22, order: 20, urgency: "red", trend: [14,16,18,20,22,25,22] },
  { name: "Fan Blade 46\" Metal",  sku: "FB-M46", stock: 18, forecast: 15, order: 0,  urgency: "green", trend: [12,14,15,14,16,15,14] },
  { name: "Motor Unit Type-A",      sku: "MT-A-001", stock: 8, forecast: 19, order: 15, urgency: "red", trend: [12,15,17,18,20,21,20] },
  { name: "Housing Casing L",       sku: "HC-L-220", stock: 24, forecast: 20, order: 0, urgency: "green", trend: [18,20,21,22,21,24,21] },
  { name: "Wiring Kit Standard",    sku: "WK-S-100", stock: 11, forecast: 18, order: 10, urgency: "amber", trend: [10,12,13,15,16,16,18] },
];

function urgencyStyle(u: Rec["urgency"]) {
  if (u === "red") return { label: "Order Now", cls: "bg-red-soft text-red border-red/30" };
  if (u === "amber") return { label: "Order This Week", cls: "bg-amber-soft text-amber border-amber/40" };
  return { label: "Stock Sufficient", cls: "bg-green-soft text-green border-green/30" };
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 80; const h = 24;
  const max = Math.max(...data); const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ForecastPage() {
  const actionCount = recs.filter((r) => r.urgency !== "green").length;

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-green">Predictive Analytics</div>
          <h2 className="text-2xl font-bold mt-1">Demand Forecast & Purchasing Recommendations</h2>
          <p className="text-sm text-muted-foreground mt-1">12 months of order history · 3-month forecast horizon · Updated daily</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Chart */}
          <div className="lg:col-span-3 bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold">12-Month Order Volume — Top 5 Parts</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Solid = actual · Dashed = AI forecast (95% CI)</p>
              </div>
            </div>
            <div style={{ width: "100%", height: 360 }}>
              <ResponsiveContainer>
                <ComposedChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
                  <CartesianGrid stroke="oklch(0.92 0.01 250)" strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="oklch(0.55 0.03 260)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="oklch(0.55 0.03 260)" label={{ value: "Units", angle: -90, position: "insideLeft", fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <ReferenceLine x="Dec 24" stroke="oklch(0.5 0.05 260)" strokeDasharray="5 4" label={{ value: "Forecast →", fontSize: 10, fill: "oklch(0.4 0.05 260)", position: "insideTopRight" }} />
                  <Area type="monotone" dataKey="fcHigh" stroke="none" fill="oklch(0.68 0.16 158)" fillOpacity={0.12} />
                  <Area type="monotone" dataKey="fcLow" stroke="none" fill="oklch(0.985 0.002 250)" fillOpacity={1} />
                  {Object.keys(lineColors).map((k) => {
                    const isFan52 = k === "Fan Blade 52\" Wooden";
                    return (
                      <Line
                        key={k}
                        type="monotone"
                        dataKey={k}
                        stroke={lineColors[k]}
                        strokeWidth={isFan52 ? 2.4 : 1.8}
                        dot={false}
                        activeDot={{ r: 4 }}
                        strokeDasharray={undefined}
                      />
                    );
                  })}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recommendations */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Reorder Recommendations</h3>
              <span className="text-xs text-muted-foreground">5 parts analysed</span>
            </div>
            {recs.map((r) => {
              const u = urgencyStyle(r.urgency);
              const trendUp = r.trend[r.trend.length - 1] > r.trend[0];
              return (
                <div key={r.sku} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{r.name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{r.sku}</div>
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${u.cls}`}>
                      {u.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                    <div className="bg-muted rounded-md py-2">
                      <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Stock</div>
                      <div className="font-bold text-sm mt-0.5">{r.stock}</div>
                    </div>
                    <div className="bg-muted rounded-md py-2">
                      <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Forecast</div>
                      <div className="font-bold text-sm mt-0.5">{r.forecast}</div>
                    </div>
                    <div className="bg-muted rounded-md py-2">
                      <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Order</div>
                      <div className="font-bold text-sm mt-0.5 text-green">{r.order || "—"}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      {trendUp ? <TrendingUp className="h-3.5 w-3.5 text-red" /> : <TrendingDown className="h-3.5 w-3.5 text-green" />}
                      {trendUp ? "Demand rising" : "Demand easing"}
                    </div>
                    <Sparkline data={r.trend} color={trendUp ? "oklch(0.62 0.22 27)" : "oklch(0.68 0.16 158)"} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Summary bar */}
        <div className="bg-navy text-navy-foreground rounded-xl px-5 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-amber/20 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-amber" />
            </div>
            <div>
              <div className="font-semibold">{actionCount} parts require action this week</div>
              <div className="text-xs text-white/70 mt-0.5">2 critical · 1 advisory · Auto-generated 06:00 SGT</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider text-white/60">Estimated total order value</div>
            <div className="text-xl font-bold text-green">SGD 4,280</div>
          </div>
          <button className="bg-green hover:bg-green/90 text-white px-5 py-2.5 rounded-md text-sm font-semibold transition-colors">
            Draft Purchase Orders →
          </button>
        </div>
      </div>
    </AppLayout>
  );
}