import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  MapPin,
  Package,
  RefreshCw,
  Truck,
  Wifi,
  WifiOff,
} from "lucide-react";
import "leaflet/dist/leaflet.css";

export const Route = createFileRoute("/routes")({
  head: () => ({
    meta: [
      { title: "Route Optimisation — Crestar Warehouse Intelligence Suite" },
      { name: "description", content: "Live LTA-powered delivery route optimisation across Singapore." },
    ],
  }),
  component: RoutesPage,
});

const API_BASE = "http://localhost:8000";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Traffic    = "clear" | "moderate" | "heavy";
type StopStatus = "delivered" | "transit" | "pending";

interface BaseStop {
  client:   string;
  district: string;
  address:  string;
  items:    string;
  status:   StopStatus;
  lat:      number;
  lng:      number;
}

interface Stop extends BaseStop {
  num:     number;
  eta:     string;
  traffic: Traffic;
}

interface Incident {
  type:      string;
  severity:  "heavy" | "moderate";
  message:   string;
  latitude:  number;
  longitude: number;
  district:  string;
}

// ─── Real Singapore coordinates ───────────────────────────────────────────────

const WAREHOUSE = {
  lat: 1.3182,
  lng: 103.6371,
  label: "Crestar Warehouse — Tuas",
};

const BASE_STOPS: BaseStop[] = [
  {
    client:   "HomeStyle Pte Ltd",
    district: "Jurong East",
    address:  "Blk 134 Jurong Gateway Rd, S(600134)",
    items:    'Fan Blade 46" Metal ×6, Wiring Kit Standard ×4',
    status:   "delivered",
    lat: 1.3331,
    lng: 103.7436,
  },
  {
    client:   "Comfort Living SG",
    district: "Tampines",
    address:  "Blk 820 Tampines Ave 4, S(520820)",
    items:    "Motor Unit Type-A ×3, Housing Casing L ×2",
    status:   "transit",
    lat: 1.3523,
    lng: 103.9440,
  },
  {
    client:   "DecorPlus",
    district: "Woodlands",
    address:  "Blk 888 Woodlands Dr 50, S(730888)",
    items:    'Fan Blade 52" Wooden ×2, RF Remote ×1',
    status:   "pending",
    lat: 1.4387,
    lng: 103.7862,
  },
  {
    client:   "FurnishCo",
    district: "CBD",
    address:  "8 Shenton Way, S(068811)",
    items:    'Fan Blade 52" Wooden ×4, Motor Unit Type-A ×2',
    status:   "pending",
    lat: 1.2795,
    lng: 103.8498,
  },
  {
    client:   "SingHome Supplies",
    district: "Toa Payoh",
    address:  "Blk 192 Lor 4 Toa Payoh, S(310192)",
    items:    "Wiring Kit Premium ×5, Pull Chain ×10",
    status:   "pending",
    lat: 1.3341,
    lng: 103.8493,
  },
  {
    client:   "Greenleaf Interiors",
    district: "Bishan",
    address:  "Junction 8, 9 Bishan Pl, S(579837)",
    items:    "Housing Casing M ×4, LED Light Globe ×6",
    status:   "pending",
    lat: 1.3500,
    lng: 103.8484,
  },
];

// ─── Haversine distance (km) ───────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Route optimisation (nearest-neighbour with traffic penalty) ───────────────

function optimizeRoute(
  bases:    BaseStop[],
  affected: Record<string, string>,
  liveOn:   boolean,
): Stop[] {
  const trafficFor = (district: string): Traffic => {
    if (!liveOn) return "clear";
    const sev = affected[district];
    return sev === "heavy" ? "heavy" : sev === "moderate" ? "moderate" : "clear";
  };

  const penalty = (t: Traffic) => (t === "heavy" ? 0.65 : t === "moderate" ? 0.30 : 0);

  const locked  = bases.filter((s) => s.status === "delivered");
  const mutable = bases.filter((s) => s.status !== "delivered");

  let cx = locked.length ? locked[locked.length - 1].lat : WAREHOUSE.lat;
  let cy = locked.length ? locked[locked.length - 1].lng : WAREHOUSE.lng;

  const remaining = [...mutable];
  const ordered:  BaseStop[] = [];

  while (remaining.length > 0) {
    let bestIdx = 0, bestScore = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const s     = remaining[i];
      const dist  = haversineKm(cx, cy, s.lat, s.lng);
      const score = dist * (1 + penalty(trafficFor(s.district)));
      if (score < bestScore) { bestScore = score; bestIdx = i; }
    }
    const chosen = remaining.splice(bestIdx, 1)[0];
    ordered.push(chosen);
    cx = chosen.lat;
    cy = chosen.lng;
  }

  const allOrdered = [...locked, ...ordered];

  let mins = 9 * 60; // depart 09:00
  return allOrdered.map((s, i) => {
    const t = trafficFor(s.district);
    mins += 30 + (t === "heavy" ? 25 : t === "moderate" ? 12 : 0);
    const eta = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
    mins += 15;
    return { ...s, num: i + 1, eta, traffic: t };
  });
}

function totalRouteKm(stops: Stop[]): number {
  let dist = haversineKm(WAREHOUSE.lat, WAREHOUSE.lng, stops[0].lat, stops[0].lng);
  for (let i = 1; i < stops.length; i++) {
    dist += haversineKm(stops[i - 1].lat, stops[i - 1].lng, stops[i].lat, stops[i].lng);
  }
  return dist;
}

// ─── Hook — live incidents ─────────────────────────────────────────────────────

function useIncidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [affected,  setAffected]  = useState<Record<string, string>>({});
  const [loading,   setLoading]   = useState(true);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [apiError,  setApiError]  = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`${API_BASE}/traffic/incidents`)
      .then((r) => { if (!r.ok) throw new Error("non-ok"); return r.json(); })
      .then((d) => {
        setIncidents(d.incidents ?? []);
        setAffected(d.affected_districts ?? {});
        setFetchedAt(new Date());
        setApiError(false);
        setLoading(false);
      })
      .catch(() => { setApiError(true); setLoading(false); });
  };

  useEffect(load, []);
  return { incidents, affected, loading, fetchedAt, apiError, reload: load };
}

// ─── Leaflet map component (client-only) ──────────────────────────────────────

interface MapProps {
  stops:          Stop[];
  incidents:      Incident[];
  liveTrafficOn:  boolean;
}

function SingaporeMap({ stops, incidents, liveTrafficOn }: MapProps) {
  // Dynamically imported so Leaflet never runs during SSR
  const [L,     setL]     = useState<typeof import("leaflet") | null>(null);
  const [MapCmp, setMapCmp] = useState<typeof import("react-leaflet") | null>(null);

  useEffect(() => {
    Promise.all([
      import("leaflet"),
      import("react-leaflet"),
    ]).then(([leaflet, rl]) => {
      setL(leaflet);
      setMapCmp(rl);
    });
  }, []);

  if (!L || !MapCmp) {
    return (
      <div className="flex items-center justify-center h-[420px] bg-muted/30 text-sm text-muted-foreground">
        Loading map…
      </div>
    );
  }

  const { MapContainer, TileLayer, Marker, Polyline, CircleMarker, Popup } = MapCmp;

  // Custom icons (divIcon — no PNG dependency)
  const warehouseIcon = L.divIcon({
    className: "",
    html: `<div style="width:34px;height:34px;border-radius:50%;background:#00B87A;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,0.35);">⌂</div>`,
    iconSize:   [34, 34],
    iconAnchor: [17, 17],
    popupAnchor:[0, -20],
  });

  const stopIcon = (s: Stop) => {
    const bg = s.status === "delivered" ? "#00B87A" : s.status === "transit" ? "#C89820" : "#1A2B4A";
    const ring = liveTrafficOn && s.traffic === "heavy"
      ? "3px solid #e53e3e"
      : liveTrafficOn && s.traffic === "moderate"
      ? "3px solid #C89820"
      : "3px solid white";
    return L.divIcon({
      className: "",
      html: `<div style="width:30px;height:30px;border-radius:50%;background:${bg};border:${ring};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${s.num}</div>`,
      iconSize:   [30, 30],
      iconAnchor: [15, 15],
      popupAnchor:[0, -18],
    });
  };

  const routePositions: [number, number][] = [
    [WAREHOUSE.lat, WAREHOUSE.lng],
    ...stops.map((s) => [s.lat, s.lng] as [number, number]),
  ];

  return (
    <MapContainer
      center={[1.3521, 103.8198]}
      zoom={11}
      scrollWheelZoom
      style={{ height: "420px", width: "100%" }}
      className="z-0"
    >
      <TileLayer
        url="https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.onemap.gov.sg" target="_blank">OneMap</a> &mdash; Singapore Land Authority'
        maxZoom={19}
        minZoom={3}
        detectRetina
      />

      {/* Warehouse marker */}
      <Marker position={[WAREHOUSE.lat, WAREHOUSE.lng]} icon={warehouseIcon}>
        <Popup>
          <strong>Crestar HQ — Tuas</strong><br />
          Departure 09:00
        </Popup>
      </Marker>

      {/* Delivery stop markers */}
      {stops.map((s) => (
        <Marker key={s.num} position={[s.lat, s.lng]} icon={stopIcon(s)}>
          <Popup>
            <strong>Stop {s.num} — {s.client}</strong><br />
            {s.address}<br />
            ETA {s.eta}
            {liveTrafficOn && s.traffic !== "clear" && (
              <><br /><span style={{ color: s.traffic === "heavy" ? "#e53e3e" : "#C89820" }}>
                ⚠ {s.traffic === "heavy" ? "Heavy" : "Moderate"} traffic in {s.district}
              </span></>
            )}
          </Popup>
        </Marker>
      ))}

      {/* Optimised route polyline */}
      <Polyline
        positions={routePositions}
        pathOptions={{ color: "#00B87A", weight: 3, opacity: 0.85, dashArray: undefined }}
      />

      {/* LTA incident markers */}
      {liveTrafficOn && incidents.map((inc, i) => (
        <CircleMarker
          key={i}
          center={[inc.latitude, inc.longitude]}
          radius={inc.severity === "heavy" ? 10 : 7}
          pathOptions={{
            color:       inc.severity === "heavy" ? "#e53e3e" : "#C89820",
            fillColor:   inc.severity === "heavy" ? "#e53e3e" : "#C89820",
            fillOpacity: 0.45,
            weight:      2,
          }}
        >
          <Popup>
            <strong>{inc.type}</strong>
            {inc.district !== "Other" && <> · {inc.district}</>}<br />
            <span style={{ fontSize: "11px" }}>{inc.message.slice(0, 120)}</span>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function trafficBadge(t: Traffic) {
  if (t === "heavy")    return "bg-red-soft text-red border-red/30";
  if (t === "moderate") return "bg-amber-soft text-amber border-amber/40";
  return "bg-green-soft text-green border-green/30";
}
function statusBadge(s: StopStatus) {
  if (s === "delivered") return { label: "Delivered",  cls: "bg-green text-white",            Icon: CheckCircle2 };
  if (s === "transit")   return { label: "In Transit", cls: "bg-amber text-white",            Icon: Truck        };
  return                        { label: "Pending",    cls: "bg-muted text-muted-foreground", Icon: Clock        };
}
function minsAgo(date: Date | null): string {
  if (!date) return "";
  const diff = Math.round((Date.now() - date.getTime()) / 60000);
  return diff < 1 ? "just now" : `${diff} min${diff > 1 ? "s" : ""} ago`;
}

// ─── Page ──────────────────────────────────────────────────────────────────────

function RoutesPage() {
  const [liveTrafficOn, setLiveTrafficOn] = useState(true);
  const [recalcing,     setRecalcing]     = useState(false);

  const { incidents, affected, loading: incLoading, fetchedAt, apiError, reload } = useIncidents();

  const stops = useMemo(
    () => optimizeRoute(BASE_STOPS, affected, liveTrafficOn),
    [affected, liveTrafficOn],
  );

  const handleRecalc = () => {
    setRecalcing(true);
    reload();
    setTimeout(() => setRecalcing(false), 1200);
  };

  const routeKm       = useMemo(() => stops.length ? totalRouteKm(stops) : 0, [stops]);
  const estComplete   = stops[stops.length - 1]?.eta ?? "—";
  const heavyCount    = incidents.filter((i) => i.severity === "heavy").length;
  const moderateCount = incidents.filter((i) => i.severity === "moderate").length;

  return (
    <AppLayout>
      <div className="p-6 space-y-5">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-green">Logistics</div>
            <h2 className="text-2xl font-bold mt-1">Delivery Route Optimisation</h2>
            <p className="text-sm text-muted-foreground mt-1">
              OneMap live tile layer · LTA DataMall incidents · Nearest-neighbour routing
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Live Traffic toggle */}
            <button
              onClick={() => setLiveTrafficOn((v) => !v)}
              className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-md border transition-colors ${
                liveTrafficOn
                  ? "bg-navy text-white border-navy"
                  : "bg-background text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              {liveTrafficOn ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              Live Traffic {liveTrafficOn ? "ON" : "OFF"}
              {liveTrafficOn && incidents.length > 0 && (
                <span className="ml-1 bg-red text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {incidents.length}
                </span>
              )}
            </button>

            {/* LTA status badge */}
            {incLoading ? (
              <span className="text-xs px-3 py-1.5 rounded-full bg-muted text-muted-foreground flex items-center gap-1.5">
                <RefreshCw className="h-3 w-3 animate-spin" /> Fetching LTA data…
              </span>
            ) : apiError ? (
              <span className="text-xs px-3 py-1.5 rounded-full bg-amber-soft text-amber font-semibold flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-amber" />
                LTA API unavailable — baseline routing
              </span>
            ) : (
              <span className="text-xs px-3 py-1.5 rounded-full bg-green-soft text-green font-semibold flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-green animate-pulse" />
                LTA Live — updated {minsAgo(fetchedAt)}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-11 gap-5">

          {/* ── Map panel ───────────────────────────────────────────────── */}
          <div className="lg:col-span-6 bg-card border border-border rounded-xl overflow-hidden">

            {/* Recalculate + legend overlay wrapper */}
            <div className="relative">
              <SingaporeMap stops={stops} incidents={incidents} liveTrafficOn={liveTrafficOn} />

              {/* Recalculate button (floated over map) */}
              <button
                onClick={handleRecalc}
                disabled={recalcing}
                className="absolute top-3 right-3 z-[500] bg-navy text-white text-xs font-semibold px-3 py-1.5 rounded-md shadow-md hover:bg-navy-deep transition-colors flex items-center gap-1.5 disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${recalcing ? "animate-spin" : ""}`} />
                {recalcing ? "Updating…" : "Recalculate"}
              </button>

              {/* Legend (floated over map) */}
              <div className="absolute bottom-3 right-3 z-[500] bg-white/95 rounded-md p-2.5 text-[10px] shadow-md border border-border space-y-1.5">
                <div className="font-bold uppercase tracking-wider text-muted-foreground">Legend</div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-0.5 bg-green inline-block rounded" /> Optimised route
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-green inline-block text-white text-[8px] flex items-center justify-center font-bold">1</span>
                  Delivery stop
                </div>
                {liveTrafficOn && (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-red inline-block opacity-80" /> Heavy incident
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-amber inline-block opacity-80" /> Moderate incident
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-px bg-border">
              <Stat label="Route distance" value={`${routeKm.toFixed(1)} km`} />
              <Stat label="Est. completion" value={estComplete} />
              <Stat
                label="Active incidents"
                value={liveTrafficOn && !apiError ? String(incidents.length) : "—"}
                valueClass={
                  liveTrafficOn && heavyCount > 0 ? "text-red"
                    : liveTrafficOn && moderateCount > 0 ? "text-amber"
                    : ""
                }
              />
            </div>

            {/* Incident strip */}
            {liveTrafficOn && incidents.length > 0 && (
              <div className="border-t border-border px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Live Incidents ({incidents.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {incidents.slice(0, 12).map((inc, i) => (
                    <span
                      key={i}
                      title={inc.message}
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap cursor-default ${
                        inc.severity === "heavy"
                          ? "bg-red-soft text-red border-red/30"
                          : "bg-amber-soft text-amber border-amber/40"
                      }`}
                    >
                      {inc.type} · {inc.district !== "Other" ? inc.district : "Unknown"}
                    </span>
                  ))}
                  {incidents.length > 12 && (
                    <span className="text-[10px] text-muted-foreground self-center">
                      +{incidents.length - 12} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Delivery schedule ─────────────────────────────────────────── */}
          <div className="lg:col-span-5 bg-card border border-border rounded-xl flex flex-col">
            <div className="p-4 border-b border-border bg-navy text-navy-foreground rounded-t-xl">
              <div className="text-[11px] uppercase tracking-widest text-white/60">Today's Delivery Run</div>
              <div className="mt-1 flex items-center justify-between flex-wrap gap-2">
                <div className="font-semibold">Driver: Ahmad Bin Razali</div>
                <div className="text-xs text-white/80">Vehicle <span className="font-mono">GBD 4421X</span></div>
              </div>
              <div className="text-xs text-white/70 mt-1">
                Departed Tuas HQ at 09:00 · {stops.length} stops ·{" "}
                {liveTrafficOn && !apiError ? "traffic-optimised sequence" : "baseline sequence"}
              </div>
            </div>

            <div className="flex-1 p-4 space-y-3 overflow-auto">
              {stops.map((s, idx) => {
                const sb   = statusBadge(s.status);
                const Icon = sb.Icon;
                return (
                  <div key={s.client} className="relative pl-9">
                    {idx < stops.length - 1 && (
                      <div className="absolute left-3.5 top-7 bottom-[-12px] w-0.5 bg-border" />
                    )}
                    <div className={`absolute left-0 top-1 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      s.status === "delivered" ? "bg-green text-white"
                        : s.status === "transit"   ? "bg-amber text-white"
                        : "bg-muted text-foreground border border-border"
                    }`}>
                      {s.num}
                    </div>
                    <div className="bg-card border border-border rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm">{s.client}</div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {s.district} — {s.address}
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
                        {liveTrafficOn && (
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${trafficBadge(s.traffic)}`}>
                            {s.traffic === "heavy" ? "Heavy" : s.traffic === "moderate" ? "Moderate" : "Clear"}
                          </span>
                        )}
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

function Stat({
  label, value, valueClass = "",
}: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-bold text-sm mt-0.5 ${valueClass}`}>{value}</div>
    </div>
  );
}
