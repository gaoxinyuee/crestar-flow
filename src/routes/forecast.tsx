import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { API_BASE } from "@/lib/api";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  CalendarDays,
  CloudSun,
  Newspaper,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

export const Route = createFileRoute("/forecast")({
  head: () => ({
    meta: [
      { title: "Demand Forecast — Crestar Warehouse Intelligence Suite" },
      { name: "description", content: "Holt linear-trend demand forecasting and reorder recommendations." },
    ],
  }),
  component: ForecastPage,
});

const SIGNAL_WEIGHTS = {
  up: {
    weather: 0.03,
    default: 0.05,
  },
  down: {
    industry: -0.05,
    default: -0.03,
  },
  uncertain: 0.02,
  capLow: -0.10,
  capHigh: 0.12,
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface HistoricalPoint { label: string; period: string; quantity: number }
interface ForecastPoint   { label: string; period: string; forecast_qty: number; ci_low: number; ci_high: number }

interface ForecastDetail {
  product_id:    string;
  name:          string;
  category:      string;
  unit_cost_sgd: number;
  historical:    HistoricalPoint[];
  forecast:      ForecastPoint[];
  total_stock:   number;
  reorder_point: number;
  trend:         "up" | "down" | "flat";
  suggested_order: number;
  urgency:       "red" | "amber" | "green";
}

interface ForecastSummary {
  product_id:      string;
  name:            string;
  category:        string;
  total_stock:     number;
  reorder_point:   number;
  forecast_qty:    number;
  suggested_order: number;
  urgency:         "red" | "amber" | "green";
  unit_cost_sgd:   number;
}

interface MarketSignal {
  signal_type: "holiday" | "weather" | "industry";
  title: string;
  impact_direction: "up" | "down" | "uncertain";
  affected_categories: string[];
  description: string;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useSummaries() {
  const [summaries, setSummaries] = useState<ForecastSummary[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch(`${API_BASE}/forecast`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => { setSummaries(d.forecasts ?? []); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  };

  useEffect(load, []);
  return { summaries, loading, error, reload: load };
}

function useDetail(productId: string | null) {
  const [detail,  setDetail]  = useState<ForecastDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    setDetail(null);
    fetch(`${API_BASE}/forecast/${productId}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => { setDetail(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [productId]);

  return { detail, loading };
}

// ─── Chart helpers ────────────────────────────────────────────────────────────

type ChartRow = {
  label:         string;
  quantity?:     number;
  forecast_qty?: number;
  adjusted_forecast_qty?: number;
};

interface SignalAdjustment {
  factor: number;
  percent: number;
  activeSignals: MarketSignal[];
  direction: "up" | "down" | "mixed" | "none";
}

function buildChartData(detail: ForecastDetail, adjustment: SignalAdjustment): { rows: ChartRow[]; fcStart: string } {
  const hist: ChartRow[] = detail.historical.map((h, i) => ({
    label:        h.label,
    quantity:     h.quantity,
    // Bridge last historical point so the dashed line connects visually
    forecast_qty: i === detail.historical.length - 1 ? h.quantity : undefined,
    adjusted_forecast_qty: i === detail.historical.length - 1 && adjustment.activeSignals.length > 0 ? h.quantity : undefined,
  }));

  const fc: ChartRow[] = detail.forecast.map((f, i) => {
    const decay = [1, 0.6, 0.3][i] ?? 0.3;
    const adjustedFactor = 1 + (adjustment.factor - 1) * decay;
    return {
    label:        f.label,
    forecast_qty: f.forecast_qty,
    adjusted_forecast_qty: adjustment.activeSignals.length > 0
      ? Math.max(0, Number((f.forecast_qty * adjustedFactor).toFixed(1)))
      : undefined,
    };
  });

  return {
    rows:    [...hist, ...fc],
    fcStart: detail.historical[detail.historical.length - 1]?.label ?? "",
  };
}

// ─── Market signal helpers ───────────────────────────────────────────────────

function impactBadge(impact: MarketSignal["impact_direction"]) {
  if (impact === "up") return { label: "Demand up", cls: "bg-green-soft text-green border-green/30" };
  if (impact === "down") return { label: "Demand down", cls: "bg-red-soft text-red border-red/30" };
  return { label: "Watch", cls: "bg-muted text-muted-foreground border-border" };
}

function signalIcon(type: MarketSignal["signal_type"]) {
  if (type === "holiday") return CalendarDays;
  if (type === "weather") return CloudSun;
  return Newspaper;
}

function signalAppliesToSku(signal: MarketSignal, sku: { category: string; name: string }): boolean {
  const haystack = signal.affected_categories.join(" ").toLowerCase().trim();
  const category = sku.category.toLowerCase();
  const name = sku.name.toLowerCase();

  return (
    (haystack.length > 2 && (haystack.includes(category) || category.includes(haystack))) ||
    signal.affected_categories.some((c) => {
      const term = c.toLowerCase();
      return term.length > 2 && (name.includes(term) || category.includes(term));
    }) ||
    (category.includes("fan") && haystack.includes("fan")) ||
    (category.includes("hardware") && (haystack.includes("mount") || haystack.includes("hardware"))) ||
    (category.includes("lighting") && (haystack.includes("light") || haystack.includes("electrical"))) ||
    (category.includes("controls") && haystack.includes("electrical"))
  );
}

function buildSignalAdjustment(sku: { category: string; name: string }, signals: MarketSignal[]): SignalAdjustment {
  const activeSignals = signals.filter((signal) => signalAppliesToSku(signal, sku));
  let percent = 0;

  for (const signal of activeSignals) {
    if (signal.impact_direction === "up") {
      percent += signal.signal_type === "weather" ? SIGNAL_WEIGHTS.up.weather : SIGNAL_WEIGHTS.up.default;
    }
    if (signal.impact_direction === "down") {
      percent += signal.signal_type === "industry" ? SIGNAL_WEIGHTS.down.industry : SIGNAL_WEIGHTS.down.default;
    }
    if (signal.impact_direction === "uncertain") percent += SIGNAL_WEIGHTS.uncertain;
  }

  percent = Math.max(SIGNAL_WEIGHTS.capLow, Math.min(SIGNAL_WEIGHTS.capHigh, percent));
  const upCount = activeSignals.filter((signal) => signal.impact_direction === "up").length;
  const downCount = activeSignals.filter((signal) => signal.impact_direction === "down").length;

  return {
    factor: 1 + percent,
    percent,
    activeSignals,
    direction: activeSignals.length === 0
      ? "none"
      : upCount > downCount
      ? "up"
      : downCount > upCount
      ? "down"
      : "mixed",
  };
}

function adjustedSuggestedOrderFromValues(totalStock: number, forecastQty: number, adjustment: SignalAdjustment): number {
  const adjustedNextMonth = forecastQty * adjustment.factor;
  const shortage = Math.max(0, adjustedNextMonth - totalStock);
  return Math.ceil(shortage * 1.2);
}

function adjustedSuggestedOrder(detail: ForecastDetail, adjustment: SignalAdjustment): number {
  return adjustedSuggestedOrderFromValues(detail.total_stock, detail.forecast[0]?.forecast_qty ?? 0, adjustment);
}

function MarketSignalsPanel({
  signals,
  scanning,
  error,
}: {
  signals: MarketSignal[];
  scanning: boolean;
  error: string | null;
}) {
  if (scanning) {
    return (
      <div className="border border-border rounded-xl bg-card px-4 py-3 text-sm text-muted-foreground">
        Scanning Singapore holidays, weather, and industry news…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 bg-amber-soft border border-amber/30 rounded-xl px-4 py-3 text-sm text-amber">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Market signal scan unavailable
        <code className="text-xs bg-amber/10 px-1 rounded">{error}</code>
      </div>
    );
  }

  if (signals.length === 0) return null;

  return (
    <div className="border border-border rounded-xl bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-sm font-semibold">Market Signals</h3>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {signals.length} active
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {signals.map((signal, idx) => {
          const Icon = signalIcon(signal.signal_type);
          const impact = impactBadge(signal.impact_direction);
          return (
            <div key={`${signal.title}-${idx}`} className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="text-xs font-semibold truncate">{signal.title}</div>
                </div>
                <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${impact.cls}`}>
                  {impact.label}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed mt-1.5">
                {signal.description}
              </p>
              {signal.affected_categories.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {signal.affected_categories.slice(0, 3).map((category) => (
                    <span key={category} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                      {category}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Plain-English insight ─────────────────────────────────────────────────────

function buildInsight(detail: ForecastDetail, adjustment: SignalAdjustment): string {
  const { name, trend, total_stock, reorder_point, suggested_order, forecast } = detail;
  const nextMonthQty = forecast[0]?.forecast_qty ?? 0;
  const adjustedNextMonthQty = nextMonthQty * adjustment.factor;
  const adjustedOrder = adjustment.activeSignals.length > 0 ? adjustedSuggestedOrder(detail, adjustment) : suggested_order;
  const adjustmentText = adjustment.percent !== 0
    ? `${adjustment.percent > 0 ? "+" : ""}${Math.round(adjustment.percent * 100)}%`
    : "neutral";
  const signalText = adjustment.activeSignals.length > 0
    ? ` Market signals apply a ${adjustmentText} planner-assumption scenario adjustment from ${adjustment.activeSignals.slice(0, 2).map((s) => s.title).join(" and ")}, moving next-month outlook to ${Math.round(adjustedNextMonthQty)} units. This overlay is directional and should be reviewed before purchase approval.`
    : "";

  if (trend === "up") {
    const weeks = adjustedNextMonthQty > 0
      ? Math.round((total_stock / adjustedNextMonthQty) * 4.3)
      : null;
    const weeksText  = weeks !== null ? ` At current trend, stock will run out in approximately ${weeks} week${weeks === 1 ? "" : "s"}.` : "";
    const reorderQty = adjustedOrder > 0 ? adjustedOrder : Math.ceil(adjustedNextMonthQty * 1.5);
    return `Demand for ${name} is increasing.${weeksText}${signalText} Recommended reorder: ${reorderQty} units.`;
  }

  if (trend === "down") {
    const weeks = adjustedNextMonthQty > 0
      ? Math.round((total_stock / adjustedNextMonthQty) * 4.3)
      : null;
    const weeksText = weeks !== null ? ` Current stock is sufficient for approximately ${weeks} week${weeks === 1 ? "" : "s"}.` : "";
    const orderText = adjustedOrder > 0 ? ` Recommended reorder after adjustment: ${adjustedOrder} units.` : "";
    return `Demand for ${name} is declining.${weeksText}${signalText}${orderText}`;
  }

  const orderText = adjustedOrder > 0
    ? ` Signal-scenario reorder recommendation: ${adjustedOrder} units.`
    : ` Reorder recommended when stock drops below ${reorder_point} units.`;
  return `Demand for ${name} is stable.${signalText}${orderText}`;
}

// ─── Urgency helpers ──────────────────────────────────────────────────────────

function urgencyBadge(u: ForecastSummary["urgency"]) {
  if (u === "red")   return { label: "Order Now",       cls: "bg-red-soft text-red border-red/30"     };
  if (u === "amber") return { label: "Order This Week", cls: "bg-amber-soft text-amber border-amber/40" };
  return                    { label: "Stock OK",         cls: "bg-green-soft text-green border-green/30" };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 80, h = 24;
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RecommendationCard({
  item,
  selected,
  signals,
  onClick,
}: {
  item: ForecastSummary;
  selected: boolean;
  signals: MarketSignal[];
  onClick: () => void;
}) {
  const u       = urgencyBadge(item.urgency);
  const adjustment = buildSignalAdjustment(item, signals);
  const adjustedForecast = Math.round(item.forecast_qty * adjustment.factor);
  const adjustedOrder = adjustedSuggestedOrderFromValues(item.total_stock, item.forecast_qty, adjustment);
  const trendUp = adjustedForecast > item.total_stock;
  // Mini sparkline: reconstruct rough trend from stock vs forecast
  const trendData = [
    item.total_stock,
    Math.round((item.total_stock + adjustedForecast) / 2),
    adjustedForecast,
  ];

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-card border rounded-xl p-4 transition-colors ${
        selected ? "border-navy ring-1 ring-navy/30" : "border-border hover:border-navy/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">{item.name}</div>
          <div className="text-[11px] text-muted-foreground font-mono">{item.product_id}</div>
        </div>
        <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${u.cls}`}>
          {u.label}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5 mt-3 text-center">
        {[
          { label: "Stock",    value: item.total_stock },
          { label: "Forecast", value: adjustedForecast },
          { label: "Order",    value: adjustedOrder || "—" },
        ].map(({ label, value }) => (
          <div key={label} className="bg-muted rounded-md py-1.5">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider">{label}</div>
            <div className={`font-bold text-sm mt-0.5 ${label === "Order" && value !== "—" ? "text-green" : ""}`}>
              {value}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-2.5">
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          {trendUp
            ? <TrendingUp  className="h-3.5 w-3.5 text-red" />
            : <TrendingDown className="h-3.5 w-3.5 text-green" />}
          {trendUp ? "Demand rising" : "Demand easing"}
          {adjustment.activeSignals.length > 0 && (
            <span className="text-[10px] text-amber">
              {adjustment.percent > 0 ? "+" : ""}{Math.round(adjustment.percent * 100)}%
            </span>
          )}
        </div>
        <Sparkline
          data={trendData}
          color={trendUp ? "oklch(0.62 0.22 27)" : "oklch(0.68 0.16 158)"}
        />
      </div>
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function ForecastPage() {
  const { summaries, loading: sumLoading, error: sumError, reload } = useSummaries();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [running,    setRunning]    = useState(false);
  const [signals,    setSignals]    = useState<MarketSignal[]>([]);
  const [scanning,   setScanning]   = useState(false);
  const [signalError, setSignalError] = useState<string | null>(null);

  // Default-select first red/amber item once summaries load
  useEffect(() => {
    if (summaries.length > 0 && !selectedId) {
      setSelectedId(summaries[0].product_id);
    }
  }, [summaries, selectedId]);

  const { detail, loading: detailLoading } = useDetail(selectedId);

  const signalAdjustment = useMemo(
    () => detail ? buildSignalAdjustment(detail, signals) : null,
    [detail, signals]
  );
  const chartData = useMemo(
    () => detail && signalAdjustment ? buildChartData(detail, signalAdjustment) : null,
    [detail, signalAdjustment]
  );

  const actionItems = summaries.filter((s) => s.urgency !== "green");
  const totalOrderValue = actionItems.reduce(
    (sum, s) => sum + s.suggested_order * s.unit_cost_sgd, 0
  );

  const handleRunForecast = async () => {
    setRunning(true);
    try {
      await fetch(`${API_BASE}/forecast/run`, { method: "POST" });
      reload();
      // Refresh detail if one is selected
      if (selectedId) {
        const cur = selectedId;
        setSelectedId(null);
        setTimeout(() => setSelectedId(cur), 50);
      }
    } finally {
      setRunning(false);
    }
  };

  const handleScanSignals = async () => {
    setScanning(true);
    setSignalError(null);
    try {
      const response = await fetch(`${API_BASE}/api/market-signals`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? `HTTP ${response.status}`);
      setSignals(data.signals ?? []);
    } catch (e) {
      setSignalError(String(e));
    } finally {
      setScanning(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-5">

        {/* Header */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-green">Predictive Analytics</div>
            <h2 className="text-2xl font-bold mt-1">Demand Forecast & Purchasing Recommendations</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {sumLoading
                ? "Loading forecasts…"
                : sumError
                ? "Could not connect to API"
                : `${summaries.length} SKUs · 12 months history · 3-month AI demand forecast`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleScanSignals}
              disabled={scanning}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md border border-border bg-background hover:bg-muted transition-colors disabled:opacity-50"
            >
              <Search className={`h-3.5 w-3.5 ${scanning ? "animate-pulse" : ""}`} />
              {scanning ? "Scanning…" : "Scan Market Signals"}
            </button>
            <button
              onClick={handleRunForecast}
              disabled={running}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md border border-border bg-background hover:bg-muted transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
              {running ? "Running…" : "Refresh Forecasts"}
            </button>
          </div>
        </div>

        <MarketSignalsPanel signals={signals} scanning={scanning} error={signalError} />

        {/* Error banner */}
        {sumError && (
          <div className="flex items-center gap-2 bg-red-soft border border-red/30 rounded-lg px-4 py-3 text-sm text-red">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Could not load forecast data — is the FastAPI server running?
            <code className="text-xs bg-red/10 px-1 rounded ml-1">{sumError}</code>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

          {/* Chart panel */}
          <div className="lg:col-span-3 bg-card border border-border rounded-xl p-5">
            <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
              <div>
                <h3 className="font-semibold">Order Volume — Historical & Forecast</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Solid line = Actual Orders · Green dashed = Holt baseline · Red dotted = signal scenario
                </p>
              </div>

              {/* SKU selector */}
              <select
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(e.target.value)}
                className="text-xs rounded-md border border-border bg-background px-2.5 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-navy/40 max-w-[240px]"
              >
                {summaries.map((s) => (
                  <option key={s.product_id} value={s.product_id}>
                    {s.product_id} — {s.name.length > 30 ? s.name.slice(0, 30) + "…" : s.name}
                  </option>
                ))}
              </select>
            </div>

            {detailLoading || !detail || !chartData || !signalAdjustment ? (
              <div className="flex items-center justify-center h-[320px] text-sm text-muted-foreground">
                {detailLoading ? "Loading chart…" : "Select a SKU to view forecast"}
              </div>
            ) : (
              <>
                {/* Stock vs forecast stat row */}
                <div className="grid grid-cols-4 gap-3 mb-4">
                  {[
                    { label: "On-hand stock", value: detail.total_stock.toLocaleString(), sub: "units" },
                    { label: "Baseline forecast", value: detail.forecast[0]?.forecast_qty.toFixed(0) ?? "—", sub: "next month" },
                    {
                      label: "Signal scenario",
                      value: detail.forecast[0] ? (detail.forecast[0].forecast_qty * signalAdjustment.factor).toFixed(0) : "—",
                      sub: signalAdjustment.activeSignals.length > 0
                        ? `${signalAdjustment.percent > 0 ? "+" : ""}${Math.round(signalAdjustment.percent * 100)}% signal lift`
                        : "no active signal",
                    },
                    {
                      label: "Suggested PO qty",
                      value: adjustedSuggestedOrder(detail, signalAdjustment) > 0 ? adjustedSuggestedOrder(detail, signalAdjustment).toLocaleString() : "Not needed",
                      sub: adjustedSuggestedOrder(detail, signalAdjustment) > 0 ? `SGD ${(adjustedSuggestedOrder(detail, signalAdjustment) * detail.unit_cost_sgd).toFixed(0)}` : "",
                    },
                  ].map(({ label, value, sub }) => (
                    <div key={label} className="bg-muted/60 rounded-lg px-3 py-2.5">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
                      <div className="font-bold text-base mt-0.5">{value}</div>
                      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
                    </div>
                  ))}
                </div>

                <div style={{ width: "100%", height: 280 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={chartData.rows} margin={{ top: 8, right: 16, bottom: 0, left: -10 }}>
                      <CartesianGrid stroke="oklch(0.92 0.01 250)" strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="oklch(0.55 0.03 260)" />
                      <YAxis tick={{ fontSize: 10 }} stroke="oklch(0.55 0.03 260)"
                        label={{ value: "Units", angle: -90, position: "insideLeft", fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                        formatter={(val: number, name: string) => {
                          const labels: Record<string, string> = {
                            quantity:              "Actual Orders",
                            forecast_qty:          "Baseline Forecast",
                            adjusted_forecast_qty: "Signal Scenario",
                          };
                          return [Math.round(val), labels[name] ?? name];
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                        formatter={(val) => {
                          if (val === "quantity") return "Actual Orders";
                          if (val === "forecast_qty") return "Baseline Forecast";
                          if (val === "adjusted_forecast_qty") return "Signal Scenario";
                          return null;
                        }}
                      />
                      <ReferenceLine
                        x={chartData.fcStart}
                        stroke="oklch(0.50 0.04 260)"
                        strokeDasharray="5 4"
                        label={{ value: "AI Forecast →", fontSize: 10, fill: "oklch(0.40 0.05 260)", position: "insideTopRight" }}
                      />
                      {/* Actual orders line */}
                      <Line type="monotone" dataKey="quantity"     stroke="oklch(0.68 0.16 158)"
                        strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} connectNulls={false} />
                      {/* AI Forecast line (dashed) */}
	                      <Line type="monotone" dataKey="forecast_qty" stroke="oklch(0.68 0.16 158)"
                        strokeWidth={2} strokeDasharray="7 4" dot={false} activeDot={{ r: 4 }} connectNulls={false} />
                      {/* Signal scenario forecast line */}
                      <Line type="monotone" dataKey="adjusted_forecast_qty" stroke="oklch(0.62 0.22 27)"
                        strokeWidth={2.2} strokeDasharray="3 3" dot={false} activeDot={{ r: 4 }} connectNulls={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {signalAdjustment.activeSignals.length > 0 && (
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    Signal scenario is a transparent planning overlay, not a statistically learned causal model. It uses conservative configurable assumptions on Holt's baseline: demand-up signals add 3-5%, demand-down signals subtract 3-5%, watch signals add a 2% safety buffer, capped from -10% to +12%.
                  </div>
                )}

                {/* Plain-English insight */}
                <div className={`mt-4 rounded-lg px-4 py-3 text-sm border ${
                  detail.trend === "up"
                    ? "bg-amber-soft border-amber/30 text-amber"
                    : detail.trend === "down"
                    ? "bg-green-soft border-green/30 text-green"
                    : "bg-muted border-border text-muted-foreground"
                }`}>
                  {buildInsight(detail, signalAdjustment)}
                </div>
              </>
            )}
          </div>

          {/* Recommendations panel */}
          <div className="lg:col-span-2 space-y-3 overflow-y-auto max-h-[660px] pr-0.5">
            <div className="flex items-center justify-between sticky top-0 bg-background pb-1">
              <h3 className="font-semibold">Reorder Recommendations</h3>
              <span className="text-xs text-muted-foreground">
                {sumLoading ? "…" : `${summaries.length} SKUs`}
              </span>
            </div>
            {sumLoading && (
              <div className="text-sm text-muted-foreground text-center py-8">Loading…</div>
            )}
            {!sumLoading && summaries.map((s) => (
              <RecommendationCard
                key={s.product_id}
                item={s}
                selected={s.product_id === selectedId}
                signals={signals}
                onClick={() => setSelectedId(s.product_id)}
              />
            ))}
          </div>
        </div>

        {/* Summary bar */}
        <div className="bg-navy text-navy-foreground rounded-xl px-5 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-amber/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-amber" />
            </div>
            <div>
              <div className="font-semibold">
                {actionItems.length} SKU{actionItems.length !== 1 ? "s" : ""} require action
              </div>
              <div className="text-xs text-white/70 mt-0.5">
                {summaries.filter((s) => s.urgency === "red").length} critical ·{" "}
                {summaries.filter((s) => s.urgency === "amber").length} advisory · AI-powered forecast
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider text-white/60">Estimated total order value</div>
            <div className="text-xl font-bold text-green">
              SGD {totalOrderValue.toLocaleString("en-SG", { maximumFractionDigits: 0 })}
            </div>
          </div>
          <button
            disabled
            title="Draft purchase order generation coming soon"
            className="bg-green/70 text-white px-5 py-2.5 rounded-md text-sm font-semibold cursor-not-allowed opacity-70"
          >
            Draft Purchase Orders →
          </button>
        </div>

      </div>
    </AppLayout>
  );
}
