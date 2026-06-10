import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Download,
  FileText,
  Loader2,
  MapPin,
  Package,
  Plus,
  RotateCcw,
  Trash2,
  Truck,
  Upload,
  User,
  X,
} from "lucide-react";
import "leaflet/dist/leaflet.css";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";

export const Route = createFileRoute("/routes")({
  head: () => ({
    meta: [
      { title: "Route Planning — Crestar Warehouse Intelligence Suite" },
      {
        name: "description",
        content:
          "Morning planning: configure drivers and stops, generate an optimised multi-driver route.",
      },
    ],
  }),
  component: RoutesPage,
});

// ─── Driver colour palette ──────────────────────────────────────────────────────

const DRIVER_COLORS = ["#6B2D7B", "#D4145A", "#0EA5E9", "#F59E0B"] as const;

// ─── Types ──────────────────────────────────────────────────────────────────────

interface Driver {
  id: string;
  name: string;
  vehicle: string;
  startAddress: string;
  startLat: number | null;
  startLng: number | null;
}

interface DeliveryStop {
  id: string;
  client: string;
  address: string;
  lat: number | null;
  lng: number | null;
  items: string;
  windowStart: string;
  windowEnd: string;
}

interface AssignedStop {
  stopId: string;
  client: string;
  address: string;
  lat: number;
  lng: number;
  items: string;
  windowStart: string;
  windowEnd: string;
  driverIdx: number;
  stopNum: number;
  eta: string;
  onTime: boolean;
}

interface DriverPlan {
  driverIdx: number;
  driver: Driver & { startLat: number; startLng: number };
  stops: AssignedStop[];
  totalKm: number;
  finishEta: string;
}

type PageMode = "planning" | "geocoding" | "results";

// ─── Maths helpers ──────────────────────────────────────────────────────────────

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function timeToMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minsToTime(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// ─── OneMap geocoder ────────────────────────────────────────────────────────────

async function queryOneMap(
  searchVal: string,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(
      searchVal,
    )}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = await r.json();
    if (!d.results?.length) return null;
    return {
      lat: parseFloat(d.results[0].LATITUDE),
      lng: parseFloat(d.results[0].LONGITUDE),
    };
  } catch {
    return null;
  }
}

async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  // Prefer postcode-only query — OneMap is highly reliable with 6-digit codes.
  const postcodeMatch = address.match(/\b(\d{6})\b/);
  if (postcodeMatch) {
    const result = await queryOneMap(postcodeMatch[1]);
    if (result) return result;
  }
  // Fall back to full address string.
  return queryOneMap(address);
}

// ─── VRP solver ─────────────────────────────────────────────────────────────────
//
// Strategy:
//   1. Sort stops by windowEnd (earliest deadline first).
//   2. Assign each stop to the driver whose current cursor is nearest.
//   3. Within each driver's set, sequence with nearest-neighbour.
//   4. Compute ETAs: travel at ~30 km/h + 15 min on-site per stop.
//   5. Flag stops where ETA > windowEnd.

const TRAVEL_MINS_PER_KM = 2; // ~30 km/h
const SERVICE_MINS = 15;
const DEPART_MINS = 9 * 60; // 09:00

function solveVRP(
  drivers: Array<Driver & { startLat: number; startLng: number }>,
  stops: Array<DeliveryStop & { lat: number; lng: number }>,
): DriverPlan[] {
  // Greedy assignment — sort by deadline, assign to nearest driver cursor
  const buckets: Array<Array<DeliveryStop & { lat: number; lng: number }>> =
    drivers.map(() => []);
  const cursors = drivers.map((d) => ({ lat: d.startLat, lng: d.startLng }));
  const sorted = [...stops].sort(
    (a, b) => timeToMins(a.windowEnd) - timeToMins(b.windowEnd),
  );

  for (const stop of sorted) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < drivers.length; i++) {
      const dist = haversineKm(
        cursors[i].lat,
        cursors[i].lng,
        stop.lat,
        stop.lng,
      );
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    buckets[best].push(stop);
    cursors[best] = { lat: stop.lat, lng: stop.lng };
  }

  return drivers.map((driver, di) => {
    const myStops = buckets[di];
    if (myStops.length === 0) {
      return { driverIdx: di, driver, stops: [], totalKm: 0, finishEta: "—" };
    }

    // Nearest-neighbour within driver's bucket
    let cx = driver.startLat,
      cy = driver.startLng;
    const remaining = [...myStops];
    const ordered: typeof myStops = [];
    while (remaining.length) {
      let bestIdx = 0,
        bestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const dist = haversineKm(cx, cy, remaining[i].lat, remaining[i].lng);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
      const chosen = remaining.splice(bestIdx, 1)[0];
      ordered.push(chosen);
      cx = chosen.lat;
      cy = chosen.lng;
    }

    // ETAs
    let mins = DEPART_MINS;
    let prevLat = driver.startLat,
      prevLng = driver.startLng;
    let totalKm = 0;

    const assignedStops: AssignedStop[] = ordered.map((s, i) => {
      const km = haversineKm(prevLat, prevLng, s.lat, s.lng);
      totalKm += km;
      mins += Math.max(Math.round(km * TRAVEL_MINS_PER_KM), 5);
      const eta = minsToTime(mins);
      const onTime = mins <= timeToMins(s.windowEnd);
      prevLat = s.lat;
      prevLng = s.lng;
      mins += SERVICE_MINS;
      return {
        stopId: s.id,
        client: s.client,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        items: s.items,
        windowStart: s.windowStart,
        windowEnd: s.windowEnd,
        driverIdx: di,
        stopNum: i + 1,
        eta,
        onTime,
      };
    });

    return {
      driverIdx: di,
      driver,
      stops: assignedStops,
      totalKm,
      finishEta: assignedStops[assignedStops.length - 1]?.eta ?? "—",
    };
  });
}

// ─── Map component ──────────────────────────────────────────────────────────────

function PlanMap({ plans }: { plans: DriverPlan[] }) {
  const [L, setL] = useState<typeof import("leaflet") | null>(null);
  const [MapCmp, setMapCmp] = useState<typeof import("react-leaflet") | null>(
    null,
  );

  useEffect(() => {
    Promise.all([import("leaflet"), import("react-leaflet")])
      .then(([l, m]) => {
        setL(l);
        setMapCmp(m);
      })
      .catch((err) => {
        console.error("[PlanMap] Failed to load map libraries:", err);
      });
  }, []);

  if (!L || !MapCmp) {
    return (
      <div className="flex items-center justify-center h-[480px] bg-muted/30 text-sm text-muted-foreground">
        Loading map…
      </div>
    );
  }

  const { MapContainer, TileLayer, Marker, Polyline, Popup } = MapCmp;

  return (
    <MapContainer
      center={[1.3521, 103.8198]}
      zoom={11}
      scrollWheelZoom
      style={{ height: "480px", width: "100%" }}
      className="z-0"
    >
      <TileLayer
        url="https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.onemap.gov.sg" target="_blank">OneMap</a> &mdash; Singapore Land Authority'
        maxZoom={19}
        minZoom={3}
        detectRetina
      />

      {plans.map((plan) => {
        if (plan.stops.length === 0) return null;
        const color = DRIVER_COLORS[plan.driverIdx];
        const d = plan.driver;

        const startIcon = L.divIcon({
          className: "",
          html: `<div style="width:32px;height:32px;border-radius:5px;background:${color};border:2.5px solid white;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:white;box-shadow:0 2px 8px rgba(0,0,0,0.35);">D${plan.driverIdx + 1}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
          popupAnchor: [0, -20],
        });

        const routePositions: [number, number][] = [
          [d.startLat, d.startLng],
          ...plan.stops.map((s) => [s.lat, s.lng] as [number, number]),
        ];

        return (
          <React.Fragment key={plan.driverIdx}>
            {/* Driver start marker */}
            <Marker position={[d.startLat, d.startLng]} icon={startIcon}>
              <Popup>
                <strong>
                  Driver {plan.driverIdx + 1}: {d.name}
                </strong>
                <br />
                {d.startAddress}
                <br />
                Departs 09:00{d.vehicle ? ` · ${d.vehicle}` : ""}
              </Popup>
            </Marker>

            {/* Stop markers */}
            {plan.stops.map((s) => {
              const stopIcon = L.divIcon({
                className: "",
                html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:${
                  s.onTime ? "2.5px solid white" : "3px solid #ef4444"
                };display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${s.stopNum}</div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14],
                popupAnchor: [0, -16],
              });
              return (
                <Marker
                  key={s.stopId}
                  position={[s.lat, s.lng]}
                  icon={stopIcon}
                >
                  <Popup>
                    <strong>
                      Stop {s.stopNum} — {s.client}
                    </strong>
                    <br />
                    {s.address}
                    <br />
                    ETA {s.eta} · Window {s.windowStart}–{s.windowEnd}
                    {!s.onTime && (
                      <>
                        <br />
                        <span style={{ color: "#ef4444" }}>
                          Outside time window
                        </span>
                      </>
                    )}
                  </Popup>
                </Marker>
              );
            })}

            {/* Route polyline */}
            <Polyline
              positions={routePositions}
              pathOptions={{ color, weight: 3.5, opacity: 0.85 }}
            />
          </React.Fragment>
        );
      })}
    </MapContainer>
  );
}

// ─── Quick-fill template & parser ───────────────────────────────────────────────

const TEMPLATE_CSV = `DRIVERS
Name,Vehicle,Starting Address
Ahmad Razali,GBD 4421X,"1 Tampines North Dr 1, S528559"
Muthu Kumar,SGX 8823Y,"30 Jalan Buroh, S619484"
David Tan,SJK 2210Z,"18 Boon Lay Way, S609966"
Siti Rahimah,SLA 5567A,"21 Choa Chu Kang Ave 4, S689812"

STOPS
Client,Address,Time Window Start,Time Window End,Items
HomeStyle Pte Ltd,"Blk 120 Pasir Ris St 11, S510120",09:00,11:00,Fan Blade 46" Metal x6
Comfort Living SG,"1 Changi Business Park Crescent, S486025",10:00,12:00,Motor Unit Type-A x3
DecorPlus,"Blk 204 Bedok North St 1, S460204",11:00,13:00,Fan Blade 52" Wooden x2
SingHome Supplies,"Blk 192 Lor 4 Toa Payoh, S310192",14:00,16:00,Wiring Kit Premium x5
FurnishCo,"8 Shenton Way, S068811",14:00,17:00,RF Remote x4
BuildMart SG,"3 Clementi Ave 2, S129587",15:00,17:00,Housing Casing L x3
`.trimStart();

interface QuickFillResult {
  drivers: Driver[];
  stops: DeliveryStop[];
}

// Detect delimiter: prefer tab if any tab found in the header row, otherwise comma.
function detectDelim(line: string): string {
  return line.includes("\t") ? "\t" : ",";
}

// Split a CSV/TSV row respecting double-quoted fields.
function splitRow(line: string, delim: string): string[] {
  if (delim === "\t") return line.split("\t").map((c) => c.trim());
  const cols: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQ = !inQ;
    } else if (ch === delim && !inQ) {
      cols.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cols.push(cur.trim());
  return cols;
}

function parseQuickFill(raw: string): QuickFillResult {
  // Normalise line endings, strip BOM
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n");

  // Locate section boundaries
  const driverHeaderIdx = lines.findIndex((l) =>
    /^drivers\b/i.test(l.trim()),
  );
  const stopHeaderIdx = lines.findIndex((l) =>
    /^stops\b/i.test(l.trim()),
  );

  if (driverHeaderIdx === -1 || stopHeaderIdx === -1) {
    throw new Error(
      'Could not find "DRIVERS" and "STOPS" section headers. Check the format.',
    );
  }

  // Parse a section: lines from startIdx+1 (column header) onwards until blank / next section
  function parseSection(
    startIdx: number,
    endIdx: number,
  ): { header: string[]; rows: string[][] } {
    // First non-blank line after the section keyword is the column header
    let hi = startIdx + 1;
    while (hi < endIdx && lines[hi].trim() === "") hi++;
    if (hi >= endIdx) throw new Error("Section is empty.");

    const delim = detectDelim(lines[hi]);
    const header = splitRow(lines[hi], delim).map((h) => h.toLowerCase().trim());
    const rows: string[][] = [];
    for (let i = hi + 1; i < endIdx; i++) {
      if (lines[i].trim() === "") continue;
      rows.push(splitRow(lines[i], delim));
    }
    return { header, rows };
  }

  const driverSection = parseSection(driverHeaderIdx, stopHeaderIdx);
  const stopSection = parseSection(stopHeaderIdx, lines.length);

  // Column index helpers
  function col(header: string[], ...names: string[]): number {
    for (const name of names) {
      const idx = header.indexOf(name);
      if (idx !== -1) return idx;
    }
    return -1;
  }

  // Drivers
  const dh = driverSection.header;
  const nameCol    = col(dh, "name");
  const vehicleCol = col(dh, "vehicle");
  const addrCol    = col(dh, "starting address", "start address", "address");
  if (nameCol === -1 || addrCol === -1) {
    throw new Error(
      'Drivers section must have columns "Name" and "Starting Address".',
    );
  }

  const drivers: Driver[] = driverSection.rows
    .filter((r) => r.some((c) => c.trim() !== ""))
    .slice(0, 4)
    .map((r, idx) => ({
      id: crypto.randomUUID(),
      name: r[nameCol]?.trim() || `Driver ${idx + 1}`,
      vehicle: vehicleCol !== -1 ? (r[vehicleCol]?.trim() ?? "") : "",
      startAddress: r[addrCol]?.trim() ?? "",
      startLat: null,
      startLng: null,
    }));

  if (drivers.length === 0) throw new Error("No driver rows found.");

  // Stops
  const sh = stopSection.header;
  const clientCol  = col(sh, "client", "client name", "name");
  const sAddrCol   = col(sh, "address", "delivery address");
  const winStartCol = col(sh, "time window start", "window start", "start", "earliest");
  const winEndCol  = col(sh, "time window end", "window end", "end", "latest");
  const itemsCol   = col(sh, "items", "goods", "cargo");
  if (clientCol === -1 || sAddrCol === -1) {
    throw new Error(
      'Stops section must have columns "Client" and "Address".',
    );
  }

  const stops: DeliveryStop[] = stopSection.rows
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => ({
      id: crypto.randomUUID(),
      client:      r[clientCol]?.trim() ?? "",
      address:     r[sAddrCol]?.trim() ?? "",
      lat:         null,
      lng:         null,
      items:       itemsCol !== -1 ? (r[itemsCol]?.trim() ?? "") : "",
      windowStart: winStartCol !== -1 ? (r[winStartCol]?.trim() || "09:00") : "09:00",
      windowEnd:   winEndCol   !== -1 ? (r[winEndCol]?.trim()   || "17:00") : "17:00",
    }));

  if (stops.length === 0) throw new Error("No stop rows found.");

  return { drivers, stops };
}

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "crestar_route_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Quick Fill component ────────────────────────────────────────────────────────

interface QuickFillProps {
  onLoad: (result: QuickFillResult) => void;
}

function QuickFill({ onLoad }: QuickFillProps) {
  const [open, setOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function applyParsed(raw: string) {
    setParseError(null);
    setSuccessMsg(null);
    try {
      const result = parseQuickFill(raw);
      onLoad(result);
      setSuccessMsg(
        `${result.drivers.length} driver${result.drivers.length > 1 ? "s" : ""} and ${result.stops.length} stop${result.stops.length > 1 ? "s" : ""} loaded.`,
      );
      setPasteText("");
      // Auto-collapse after short delay so user sees the success message
      setTimeout(() => setOpen(false), 1800);
    } catch (e) {
      setParseError(
        e instanceof Error
          ? `Could not read data — ${e.message}`
          : "Could not read data — check the format.",
      );
    }
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => applyParsed((e.target?.result as string) ?? "");
    reader.readAsText(file, "utf-8");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => {
          setOpen((v) => !v);
          setParseError(null);
          setSuccessMsg(null);
        }}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-semibold">Quick Fill from CSV / Excel</span>
          <span className="text-[10px] text-muted-foreground hidden sm:inline">
            — upload a file or paste from spreadsheet to populate both panels at once
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              downloadTemplate();
            }}
            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md border border-border bg-background hover:bg-muted transition-colors text-muted-foreground"
            title="Download example CSV template"
          >
            <Download className="h-3.5 w-3.5" />
            Template
          </button>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Success banner (visible even when collapsed) */}
      {successMsg && (
        <div className="mx-4 mb-3 flex items-center justify-between gap-2 bg-green-soft border border-green/30 rounded-lg px-3 py-2 text-xs font-semibold text-green">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            {successMsg}
          </div>
          <button onClick={() => setSuccessMsg(null)}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Collapsible body */}
      {open && (
        <div className="border-t border-border px-5 py-4 space-y-4">
          {/* Error */}
          {parseError && (
            <div className="flex items-start gap-2 bg-red-soft border border-red/30 rounded-lg px-3 py-2 text-xs text-red">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {parseError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* File upload drop-zone */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Upload CSV file
              </div>
              <label
                className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-5 cursor-pointer hover:bg-muted/30 transition-colors text-center"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Drop a <span className="font-semibold">.csv</span> file here, or{" "}
                  <span className="text-navy font-semibold underline underline-offset-2">
                    click to browse
                  </span>
                </span>
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>

            {/* Paste area */}
            <div className="flex flex-col">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Paste from Excel / Numbers / WhatsApp
              </div>
              <textarea
                className="flex-1 min-h-[112px] text-xs border border-border rounded-lg px-3 py-2 bg-background font-mono resize-none focus:outline-none focus:ring-1 focus:ring-purple-500/50 placeholder:text-muted-foreground/60"
                placeholder={"DRIVERS\nName\tVehicle\tStarting Address\nAhmad\tGBD 4421X\t1 Tampines…\n\nSTOPS\nClient\tAddress\t…"}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <button
                onClick={() => applyParsed(pasteText)}
                disabled={pasteText.trim() === ""}
                className="mt-2 self-end flex items-center gap-1.5 text-xs font-bold px-4 py-1.5 rounded-md text-white hover:opacity-90 transition-opacity disabled:opacity-40"
                style={{ background: "#1A1F71" }}
              >
                <ChevronRight className="h-3.5 w-3.5" />
                Apply Paste
              </button>
            </div>
          </div>

          {/* Format hint */}
          <details className="text-[10px] text-muted-foreground">
            <summary className="cursor-pointer select-none font-semibold hover:text-foreground transition-colors">
              Expected format
            </summary>
            <pre className="mt-2 bg-muted/50 rounded-md p-3 overflow-x-auto leading-relaxed text-[10px]">{`DRIVERS
Name,Vehicle,Starting Address
Ahmad Razali,GBD 4421X,1 Tampines North Dr 1 S528559

STOPS
Client,Address,Time Window Start,Time Window End,Items
HomeStyle Pte Ltd,Blk 120 Pasir Ris St 11 S510120,09:00,11:00,Fan Blade x6`}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

// ─── Factory helpers ────────────────────────────────────────────────────────────

function newDriver(idx: number): Driver {
  return {
    id: crypto.randomUUID(),
    name: `Driver ${idx + 1}`,
    vehicle: "",
    startAddress: "",
    startLat: null,
    startLng: null,
  };
}

function newStop(): DeliveryStop {
  return {
    id: crypto.randomUUID(),
    client: "",
    address: "",
    lat: null,
    lng: null,
    items: "",
    windowStart: "09:00",
    windowEnd: "17:00",
  };
}

// ─── Page ───────────────────────────────────────────────────────────────────────

function RoutesMainContent() {
  const [mode, setMode] = useState<PageMode>("planning");
  const [drivers, setDrivers] = useState<Driver[]>([newDriver(0)]);
  const [stops, setStops] = useState<DeliveryStop[]>([newStop()]);
  const [plans, setPlans] = useState<DriverPlan[]>([]);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  // Quick Fill
  const handleQuickLoad = useCallback((result: QuickFillResult) => {
    setDrivers(result.drivers);
    setStops(result.stops);
    setGeocodeError(null);
  }, []);

  // Drivers
  const addDriver = () => {
    if (drivers.length >= 4) return;
    setDrivers((d) => [...d, newDriver(d.length)]);
  };
  const removeDriver = (id: string) =>
    setDrivers((d) => d.filter((dr) => dr.id !== id));
  const updateDriver = (id: string, patch: Partial<Driver>) =>
    setDrivers((d) => d.map((dr) => (dr.id === id ? { ...dr, ...patch } : dr)));

  // Stops
  const addStop = () => setStops((s) => [...s, newStop()]);
  const removeStop = (id: string) =>
    setStops((s) => s.filter((st) => st.id !== id));
  const updateStop = (id: string, patch: Partial<DeliveryStop>) =>
    setStops((s) => s.map((st) => (st.id === id ? { ...st, ...patch } : st)));

  // Generate
  const handleGenerate = useCallback(async () => {
    setGeocodeError(null);

    for (const d of drivers) {
      if (!d.name.trim() || !d.startAddress.trim()) {
        setGeocodeError("All drivers must have a name and starting address.");
        return;
      }
    }
    for (const s of stops) {
      if (!s.client.trim() || !s.address.trim()) {
        setGeocodeError("All stops must have a client name and address.");
        return;
      }
    }

    setMode("geocoding");

    const geocodedDrivers: Array<Driver & { startLat: number; startLng: number }> = [];
    for (const d of drivers) {
      if (d.startLat && d.startLng) {
        geocodedDrivers.push(d as Driver & { startLat: number; startLng: number });
        continue;
      }
      const result = await geocodeAddress(d.startAddress);
      if (!result) {
        setGeocodeError(
          `Could not locate "${d.startAddress}" for ${d.name}. Try adding a postcode (e.g. S528559).`,
        );
        setMode("planning");
        return;
      }
      geocodedDrivers.push({ ...d, startLat: result.lat, startLng: result.lng });
    }

    const geocodedStops: Array<DeliveryStop & { lat: number; lng: number }> = [];
    for (const s of stops) {
      if (s.lat && s.lng) {
        geocodedStops.push(s as DeliveryStop & { lat: number; lng: number });
        continue;
      }
      const result = await geocodeAddress(s.address);
      if (!result) {
        setGeocodeError(
          `Could not locate "${s.address}" for ${s.client}. Try adding a postcode.`,
        );
        setMode("planning");
        return;
      }
      geocodedStops.push({ ...s, lat: result.lat, lng: result.lng });
    }

    const result = solveVRP(geocodedDrivers, geocodedStops);
    setPlans(result);
    setActiveTab(result.findIndex((p) => p.stops.length > 0) ?? 0);
    setMode("results");
  }, [drivers, stops]);

  return (
      <div className="p-6 space-y-5">

        {/* Header */}
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#6B2D7B" }}>
              Logistics
            </div>
            <h2 className="text-2xl font-bold mt-1">Morning Route Planning</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "results"
                ? "Optimised multi-driver plan · OneMap routing · time-window aware"
                : "Add up to 4 drivers with starting addresses, configure delivery stops, then generate."}
            </p>
          </div>
          {mode === "results" && (
            <button
              onClick={() => setMode("planning")}
              className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-md border border-border bg-background hover:bg-muted transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              Back to Planning
            </button>
          )}
        </div>

        {/* Error banner */}
        {geocodeError && (
          <div className="flex items-start gap-2 bg-red-soft border border-red/30 rounded-lg px-4 py-3 text-sm text-red">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            {geocodeError}
          </div>
        )}

        {/* Geocoding progress */}
        {mode === "geocoding" && (
          <div className="flex items-center gap-3 bg-muted/40 border border-border rounded-lg px-4 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            Geocoding addresses via OneMap Singapore…
          </div>
        )}

        {/* ── Planning form ──────────────────────────────────────────────── */}
        {(mode === "planning" || mode === "geocoding") && (
          <>
            {/* Quick Fill */}
            <QuickFill onLoad={handleQuickLoad} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              {/* Drivers panel */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-border bg-navy text-white flex items-center justify-between">
                  <div className="font-semibold text-sm flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Drivers ({drivers.length} / 4)
                  </div>
                  {drivers.length < 4 && (
                    <button
                      onClick={addDriver}
                      className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Driver
                    </button>
                  )}
                </div>
                <div className="p-4 space-y-4">
                  {drivers.map((d, idx) => (
                    <div key={d.id} className="border border-border rounded-lg p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-4 w-4 rounded-full border-2 border-white shadow-sm shrink-0"
                            style={{ background: DRIVER_COLORS[idx] }}
                          />
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Driver {idx + 1}
                          </span>
                        </div>
                        {drivers.length > 1 && (
                          <button
                            onClick={() => removeDriver(d.id)}
                            className="text-muted-foreground hover:text-red transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                            Name
                          </label>
                          <input
                            className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                            value={d.name}
                            onChange={(e) =>
                              updateDriver(d.id, { name: e.target.value })
                            }
                            placeholder="Ahmad Razali"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                            Vehicle
                          </label>
                          <input
                            className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                            value={d.vehicle}
                            onChange={(e) =>
                              updateDriver(d.id, { vehicle: e.target.value })
                            }
                            placeholder="GBD 4421X"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                          Starting Address
                        </label>
                        <input
                          className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                          value={d.startAddress}
                          onChange={(e) =>
                            updateDriver(d.id, {
                              startAddress: e.target.value,
                              startLat: null,
                              startLng: null,
                            })
                          }
                          placeholder="1 Tampines North Dr 1, S528559"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stops panel */}
              <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
                <div className="px-5 py-3 border-b border-border bg-navy text-white flex items-center justify-between shrink-0">
                  <div className="font-semibold text-sm flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Delivery Stops ({stops.length})
                  </div>
                  <button
                    onClick={addStop}
                    className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Stop
                  </button>
                </div>
                <div className="p-4 space-y-4 overflow-y-auto max-h-[560px]">
                  {stops.map((s, idx) => (
                    <div key={s.id} className="border border-border rounded-lg p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Stop {idx + 1}
                        </span>
                        {stops.length > 1 && (
                          <button
                            onClick={() => removeStop(s.id)}
                            className="text-muted-foreground hover:text-red transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                            Client
                          </label>
                          <input
                            className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                            value={s.client}
                            onChange={(e) =>
                              updateStop(s.id, { client: e.target.value })
                            }
                            placeholder="HomeStyle Pte Ltd"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                            Time Window
                          </label>
                          <div className="flex items-center gap-1">
                            <input
                              type="time"
                              className="flex-1 min-w-0 text-xs border border-border rounded-md px-1.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                              value={s.windowStart}
                              onChange={(e) =>
                                updateStop(s.id, { windowStart: e.target.value })
                              }
                            />
                            <span className="text-muted-foreground text-xs shrink-0">–</span>
                            <input
                              type="time"
                              className="flex-1 min-w-0 text-xs border border-border rounded-md px-1.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                              value={s.windowEnd}
                              onChange={(e) =>
                                updateStop(s.id, { windowEnd: e.target.value })
                              }
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                          Delivery Address
                        </label>
                        <input
                          className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                          value={s.address}
                          onChange={(e) =>
                            updateStop(s.id, {
                              address: e.target.value,
                              lat: null,
                              lng: null,
                            })
                          }
                          placeholder="Blk 120 Pasir Ris St 11, S510120"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                          Items (optional)
                        </label>
                        <input
                          className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                          value={s.items}
                          onChange={(e) =>
                            updateStop(s.id, { items: e.target.value })
                          }
                          placeholder='Fan Blade 46" Metal ×6'
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Generate button */}
            <div className="flex justify-end">
              <button
                onClick={handleGenerate}
                disabled={mode === "geocoding"}
                className="flex items-center gap-2 text-sm font-bold px-6 py-3 rounded-lg text-white hover:opacity-90 transition-opacity disabled:opacity-60 shadow-md"
                style={{ background: "#6B2D7B" }}
              >
                {mode === "geocoding" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <ChevronRight className="h-4 w-4" />
                    Generate Route Plan
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {/* ── Results ─────────────────────────────────────────────────────── */}
        {mode === "results" && plans.length > 0 && (
          <ResultsView
            plans={plans}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        )}
      </div>
  );
}

function RoutesPage() {
  return (
    <AppLayout>
      <PageErrorBoundary>
        <RoutesMainContent />
      </PageErrorBoundary>
    </AppLayout>
  );
}

// ─── Results view ────────────────────────────────────────────────────────────────

function ResultsView({
  plans,
  activeTab,
  onTabChange,
}: {
  plans: DriverPlan[];
  activeTab: number;
  onTabChange: (i: number) => void;
}) {
  const totalStops = plans.reduce((a, p) => a + p.stops.length, 0);
  const lateStops = plans.reduce(
    (a, p) => a + p.stops.filter((s) => !s.onTime).length,
    0,
  );
  const totalKm = plans.reduce((a, p) => a + p.totalKm, 0);
  const activeDriverCount = plans.filter((p) => p.stops.length > 0).length;

  return (
    <div className="space-y-5">

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Stops" value={String(totalStops)} />
        <StatCard label="Active Drivers" value={String(activeDriverCount)} />
        <StatCard label="Total Distance" value={`${totalKm.toFixed(1)} km`} />
        <StatCard
          label="On-Time Stops"
          value={`${totalStops - lateStops} / ${totalStops}`}
          valueClass={lateStops > 0 ? "text-red" : "text-green"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-11 gap-5">

        {/* Map panel */}
        <div className="lg:col-span-6 bg-card border border-border rounded-xl overflow-hidden">
          {/* Map header / colour key */}
          <div className="px-5 py-3 border-b border-border flex items-center gap-4 flex-wrap">
            <span className="text-sm font-semibold shrink-0">Route Map</span>
            {plans
              .filter((p) => p.stops.length > 0)
              .map((p) => (
                <div
                  key={p.driverIdx}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ background: DRIVER_COLORS[p.driverIdx] }}
                  />
                  {p.driver.name}
                </div>
              ))}
          </div>

          <PlanMap plans={plans} />

          {/* Legend */}
          <div className="px-4 py-2 border-t border-border bg-muted/20 flex items-center gap-5 flex-wrap text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <div
                className="w-5 h-5 rounded text-white flex items-center justify-center font-bold text-[9px]"
                style={{ background: "#6B2D7B" }}
              >
                D1
              </div>
              Driver start
            </span>
            <span className="flex items-center gap-1.5">
              <div
                className="w-5 h-5 rounded-full text-white flex items-center justify-center font-bold text-[9px]"
                style={{ background: "#6B2D7B" }}
              >
                1
              </div>
              Delivery stop
            </span>
            <span className="flex items-center gap-1.5">
              <div
                className="w-5 h-5 rounded-full text-white flex items-center justify-center font-bold text-[9px] border-2 border-red-500"
                style={{ background: "#6B2D7B" }}
              >
                !
              </div>
              Outside time window
            </span>
          </div>
        </div>

        {/* Driver schedule tabs */}
        <div className="lg:col-span-5 bg-card border border-border rounded-xl flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-border overflow-x-auto shrink-0">
            {plans.map((p, i) => (
              <button
                key={p.driverIdx}
                onClick={() => onTabChange(i)}
                className={`flex-1 min-w-[80px] px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === i
                    ? "text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                style={
                  activeTab === i
                    ? { borderBottomColor: DRIVER_COLORS[p.driverIdx] }
                    : undefined
                }
              >
                <div className="flex items-center justify-center gap-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: DRIVER_COLORS[p.driverIdx] }}
                  />
                  {p.driver.name.split(" ")[0]}
                  {p.stops.length > 0 && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full text-white leading-none"
                      style={{ background: DRIVER_COLORS[p.driverIdx] }}
                    >
                      {p.stops.length}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {plans[activeTab] && <DriverSchedule plan={plans[activeTab]} />}
        </div>
      </div>
    </div>
  );
}

// ─── Driver schedule panel ───────────────────────────────────────────────────────

function DriverSchedule({ plan }: { plan: DriverPlan }) {
  const color = DRIVER_COLORS[plan.driverIdx];
  const lateCount = plan.stops.filter((s) => !s.onTime).length;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Driver summary header */}
      <div
        className="px-4 py-3 border-b border-border shrink-0"
        style={{ background: color + "14" }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold text-sm flex items-center gap-2">
              <Truck className="h-4 w-4 shrink-0" style={{ color }} />
              {plan.driver.name}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {plan.driver.vehicle && (
                <span className="font-mono mr-2">{plan.driver.vehicle}</span>
              )}
              Departs 09:00 · {plan.driver.startAddress || "—"}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs font-semibold">
              {plan.stops.length} stop{plan.stops.length !== 1 ? "s" : ""} ·{" "}
              {plan.totalKm.toFixed(1)} km
            </div>
            {plan.stops.length > 0 && (
              <div className="text-[11px] text-muted-foreground">
                Done by {plan.finishEta}
              </div>
            )}
          </div>
        </div>
        {lateCount > 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-red">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {lateCount} stop{lateCount > 1 ? "s" : ""} outside time window —
            consider reassigning
          </div>
        )}
        {lateCount === 0 && plan.stops.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-green">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            All stops within time windows
          </div>
        )}
      </div>

      {/* Stop list */}
      <div className="flex-1 p-4 space-y-3 overflow-y-auto">
        {plan.stops.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No stops assigned to this driver.
          </div>
        ) : (
          plan.stops.map((s, idx) => (
            <div key={s.stopId} className="relative pl-9">
              {idx < plan.stops.length - 1 && (
                <div className="absolute left-3.5 top-7 bottom-[-12px] w-0.5 bg-border" />
              )}
              <div
                className="absolute left-0 top-1 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm"
                style={{ background: color }}
              >
                {s.stopNum}
              </div>
              <div
                className={`bg-card border rounded-lg p-3 ${
                  s.onTime ? "border-border" : "border-red/40"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">
                      {s.client}
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{s.address}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={`text-xs font-bold ${s.onTime ? "" : "text-red"}`}
                    >
                      ETA {s.eta}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center justify-end gap-0.5 mt-0.5">
                      <Clock className="h-2.5 w-2.5" />
                      {s.windowStart}–{s.windowEnd}
                    </div>
                  </div>
                </div>
                {s.items && (
                  <div className="mt-2 text-[11px] text-foreground flex items-start gap-1.5">
                    <Package className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                    <span>{s.items}</span>
                  </div>
                )}
                {!s.onTime && (
                  <div className="mt-1.5 text-[10px] text-red flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    Arrives after window closes
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Stat card ───────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  valueClass = "",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`font-bold text-lg mt-0.5 ${valueClass}`}>{value}</div>
    </div>
  );
}
