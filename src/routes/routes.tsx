import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useState } from "react";
import { RefreshCw, MapPin, Truck, CheckCircle2, Clock, Package } from "lucide-react";

export const Route = createFileRoute("/routes")({
  head: () => ({
    meta: [
      { title: "Route Optimisation — Crestar Warehouse Intelligence Suite" },
      { name: "description", content: "Live LTA-powered delivery route optimisation across Singapore." },
    ],
  }),
  component: RoutesPage,
});

interface Stop {
  num: number;
  client: string;
  district: string;
  address: string;
  items: string;
  eta: string;
  status: "delivered" | "transit" | "pending";
  traffic: "clear" | "moderate" | "heavy";
  // map coords (svg pct)
  x: number;
  y: number;
}

const warehouse = { x: 8, y: 62, label: "Crestar Warehouse — Tuas" };

const stops: Stop[] = [
  { num: 1, client: "HomeStyle Pte Ltd",  district: "Jurong East",  address: "Blk 134 Jurong Gateway Rd, S(600134)",   items: "Fan Blade 46\" Metal x6, Wiring Kit Standard x4", eta: "10:15", status: "delivered", traffic: "clear",    x: 26, y: 56 },
  { num: 2, client: "Comfort Living SG",  district: "Clementi",     address: "Blk 451 Clementi Ave 3, S(120451)",        items: "Motor Unit Type-A x3, Housing Casing L x2",       eta: "11:40", status: "transit",   traffic: "heavy",    x: 38, y: 52 },
  { num: 3, client: "DecorPlus",          district: "Buona Vista",  address: "1 Vista Exchange Green, S(138617)",        items: "Fan Blade 52\" Wooden x2, RF Remote x1",          eta: "12:35", status: "pending",   traffic: "moderate", x: 48, y: 50 },
  { num: 4, client: "FurnishCo",          district: "Queenstown",   address: "Blk 88 Dawson Rd, S(142088)",              items: "Fan Blade 52\" Wooden x4, Motor Unit Type-A x2",  eta: "13:45", status: "pending",   traffic: "moderate", x: 56, y: 50 },
  { num: 5, client: "SingHome Supplies",  district: "Toa Payoh",    address: "Blk 192 Lor 4 Toa Payoh, S(310192)",       items: "Wiring Kit Premium x5, Pull Chain x10",           eta: "14:30", status: "pending",   traffic: "clear",    x: 62, y: 38 },
  { num: 6, client: "Greenleaf Interiors",district: "Bishan",       address: "Junction 8, 9 Bishan Pl, S(579837)",       items: "Housing Casing M x4, LED Light Globe x6",         eta: "15:30", status: "pending",   traffic: "clear",    x: 60, y: 28 },
];

function trafficStyle(t: Stop["traffic"]) {
  if (t === "heavy") return "bg-red-soft text-red border-red/30";
  if (t === "moderate") return "bg-amber-soft text-amber border-amber/40";
  return "bg-green-soft text-green border-green/30";
}
function trafficLabel(t: Stop["traffic"]) {
  return t === "heavy" ? "Heavy traffic" : t === "moderate" ? "Moderate" : "Clear";
}
function statusBadge(s: Stop["status"]) {
  if (s === "delivered") return { label: "Delivered", cls: "bg-green text-white", Icon: CheckCircle2 };
  if (s === "transit")   return { label: "In Transit", cls: "bg-amber text-white", Icon: Truck };
  return { label: "Pending", cls: "bg-muted text-muted-foreground", Icon: Clock };
}

function RoutesPage() {
  const [recalcing, setRecalcing] = useState(false);
  const recalc = () => {
    setRecalcing(true);
    setTimeout(() => setRecalcing(false), 1100);
  };

  // Build the route polyline points
  const points = [warehouse, ...stops.map((s) => ({ x: s.x, y: s.y }))]
    .map((p) => `${p.x},${p.y}`)
    .join(" ");

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-green">Logistics</div>
            <h2 className="text-2xl font-bold mt-1">Delivery Route Optimisation</h2>
            <p className="text-sm text-muted-foreground mt-1">Powered by LTA Live Traffic Data · Optimised for fuel & ETA</p>
          </div>
          <span className="text-xs px-3 py-1.5 rounded-full bg-green-soft text-green font-semibold flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-green animate-pulse" />
            LTA Live Traffic — last updated 2 mins ago
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-11 gap-5">
          {/* Map */}
          <div className="lg:col-span-6 bg-card border border-border rounded-xl overflow-hidden">
            <div className="relative" style={{ aspectRatio: "1 / 0.78", background: "linear-gradient(135deg, oklch(0.96 0.02 220), oklch(0.93 0.03 200))" }}>
              {/* SG outline */}
              <svg viewBox="0 0 100 78" className="absolute inset-0 w-full h-full">
                {/* Water */}
                <rect width="100" height="78" fill="oklch(0.92 0.04 220)" />
                {/* Land mass — stylised SG */}
                <path
                  d="M5,55 C8,42 18,32 32,28 C42,25 50,22 60,24 C72,26 82,30 90,38 C95,44 96,52 92,58 C85,68 70,72 55,70 C40,69 25,68 14,64 C8,62 4,60 5,55 Z"
                  fill="oklch(0.94 0.02 130)"
                  stroke="oklch(0.72 0.04 130)"
                  strokeWidth="0.3"
                />
                {/* Expressways */}
                <path d="M10,60 Q30,55 50,52 T90,42" fill="none" stroke="oklch(0.78 0.02 250)" strokeWidth="0.7" strokeDasharray="1 0.6" />
                <path d="M20,68 Q35,58 55,50 T80,30" fill="none" stroke="oklch(0.78 0.02 250)" strokeWidth="0.7" strokeDasharray="1 0.6" />
                <path d="M48,70 Q55,55 60,40 T70,25" fill="none" stroke="oklch(0.78 0.02 250)" strokeWidth="0.7" strokeDasharray="1 0.6" />

                {/* Traffic overlays */}
                <path d="M30,55 Q36,53 42,52" fill="none" stroke="oklch(0.62 0.22 27)" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
                <path d="M14,62 Q22,60 28,58" fill="none" stroke="oklch(0.78 0.16 75)" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
                <path d="M50,50 Q53,48 56,49" fill="none" stroke="oklch(0.78 0.16 75)" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />

                {/* Optimised route line */}
                <polyline
                  points={points}
                  fill="none"
                  stroke="oklch(0.68 0.16 158)"
                  strokeWidth="0.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={recalcing ? "1.5 1" : undefined}
                  opacity="0.95"
                />

                {/* Warehouse marker */}
                <g transform={`translate(${warehouse.x},${warehouse.y})`}>
                  <circle r="2.4" fill="oklch(0.68 0.16 158)" />
                  <circle r="3.6" fill="none" stroke="oklch(0.68 0.16 158)" strokeWidth="0.4" opacity="0.5" />
                </g>

                {/* Stops */}
                {stops.map((s) => (
                  <g key={s.num} transform={`translate(${s.x},${s.y})`}>
                    <circle r="2" fill={s.status === "delivered" ? "oklch(0.68 0.16 158)" : s.status === "transit" ? "oklch(0.78 0.16 75)" : "oklch(0.27 0.06 260)"} stroke="white" strokeWidth="0.4" />
                    <text x="0" y="0.7" textAnchor="middle" fontSize="2.2" fill="white" fontWeight="700">{s.num}</text>
                  </g>
                ))}
              </svg>

              {/* Map labels */}
              <div className="absolute left-3 top-3 bg-white/90 backdrop-blur rounded-md px-2.5 py-1.5 text-[10px] font-semibold shadow-sm border border-border">
                Singapore · Live Operational View
              </div>
              <div className="absolute" style={{ left: `${warehouse.x}%`, top: `${warehouse.y + 4}%` }}>
                <div className="text-[10px] font-bold text-green bg-white/90 px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">
                  ⌂ Crestar HQ — Tuas
                </div>
              </div>

              {/* Legend */}
              <div className="absolute right-3 bottom-3 bg-white/95 rounded-md p-2.5 text-[10px] shadow-sm border border-border space-y-1">
                <div className="font-bold uppercase tracking-wider text-muted-foreground mb-1">Legend</div>
                <div className="flex items-center gap-2"><span className="w-4 h-0.5 bg-green" /> Optimised route</div>
                <div className="flex items-center gap-2"><span className="w-4 h-0.5 bg-red" /> Heavy traffic</div>
                <div className="flex items-center gap-2"><span className="w-4 h-0.5 bg-amber" /> Moderate traffic</div>
              </div>

              <button
                onClick={recalc}
                className="absolute right-3 top-3 bg-navy text-white text-xs font-semibold px-3 py-1.5 rounded-md shadow-sm hover:bg-navy-deep transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${recalcing ? "animate-spin" : ""}`} />
                {recalcing ? "Recalculating…" : "Recalculate Route"}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-px bg-border">
              <Stat label="Total distance" value="47.3 km" />
              <Stat label="Est. completion" value="15:30" />
              <Stat label="Fuel estimate" value="8.2 L" />
            </div>
          </div>

          {/* Schedule */}
          <div className="lg:col-span-5 bg-card border border-border rounded-xl flex flex-col">
            <div className="p-4 border-b border-border bg-navy text-navy-foreground rounded-t-xl">
              <div className="text-[11px] uppercase tracking-widest text-white/60">Today's Delivery Run</div>
              <div className="mt-1 flex items-center justify-between flex-wrap gap-2">
                <div className="font-semibold">Driver: Ahmad Bin Razali</div>
                <div className="text-xs text-white/80">Vehicle <span className="font-mono">GBD 4421X</span></div>
              </div>
              <div className="text-xs text-white/70 mt-1">Departed Tuas HQ at 09:00 · 6 stops · 2 vans deployed</div>
            </div>

            <div className="flex-1 p-4 space-y-3 overflow-auto">
              {stops.map((s, idx) => {
                const sb = statusBadge(s.status);
                const Icon = sb.Icon;
                return (
                  <div key={s.num} className="relative pl-9">
                    {idx < stops.length - 1 && (
                      <div className="absolute left-3.5 top-7 bottom-[-12px] w-0.5 bg-border" />
                    )}
                    <div className={`absolute left-0 top-1 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      s.status === "delivered" ? "bg-green text-white" : s.status === "transit" ? "bg-amber text-white" : "bg-muted text-foreground border border-border"
                    }`}>
                      {s.num}
                    </div>
                    <div className="bg-card border border-border rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm">{s.client}</div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="h-3 w-3" /> {s.district} — {s.address}
                          </div>
                        </div>
                        <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${sb.cls}`}>
                          <Icon className="h-3 w-3" /> {sb.label}
                        </span>
                      </div>
                      <div className="mt-2 text-[11px] text-foreground flex items-start gap-1.5">
                        <Package className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                        <span>{s.items}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <span>ETA <span className="font-semibold text-foreground">{s.eta}</span></span>
                          <span>· 15 min on-site</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${trafficStyle(s.traffic)}`}>
                          {trafficLabel(s.traffic)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-bold text-sm mt-0.5">{value}</div>
    </div>
  );
}