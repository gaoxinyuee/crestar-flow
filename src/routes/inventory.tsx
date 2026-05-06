import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Search, Download, ScanLine, X, Camera, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Crestar Warehouse Intelligence Suite" },
      { name: "description", content: "Live inventory across all Crestar zones with reorder thresholds." },
    ],
  }),
  component: InventoryPage,
});

const API_BASE = "http://localhost:8000";

type Status = "Healthy" | "Low" | "Critical";

interface InventoryRow {
  product_id:    string;
  name:          string;
  category:      string;
  reorder_point: number;
  weight_kg:     number;
  length_cm:     number;
  width_cm:      number;
  height_cm:     number;
  total_qty:     number;
  bin_locations: string | null;
  primary_zone:  string | null;
  status:        Status;
  low_stock:     boolean;
}

const ZONES      = ["A", "B", "C", "D", "E"] as const;
const CATEGORIES = ["Fan Blades", "Motors", "Canopies", "Controls", "Blade Arms", "Lighting", "Hardware"] as const;

const ZONE_LABELS: Record<string, string> = {
  A: "Zone A · Receiving",
  B: "Zone B · High Rack",
  C: "Zone C · Medium Rack",
  D: "Zone D · Open Floor",
  E: "Zone E · Dispatch",
};

function statusStyle(s: Status) {
  if (s === "Healthy") return "bg-green-soft text-green border-green/30";
  if (s === "Low")     return "bg-amber-soft text-amber border-amber/40";
  return "bg-red-soft text-red border-red/30";
}

function useInventory() {
  const [rows,    setRows]    = useState<InventoryRow[]>([]);
  const [summary, setSummary] = useState({ total_skus: 0, total_units: 0 });
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/warehouse/inventory`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => {
        setRows(d.inventory ?? []);
        setSummary({ total_skus: d.total_skus, total_units: d.total_units });
        setLoading(false);
      })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, []);

  return { rows, summary, loading, error };
}

function InventoryPage() {
  const { rows, summary, loading, error } = useInventory();

  const [category,  setCategory]  = useState("all");
  const [zone,      setZone]      = useState("all");
  const [status,    setStatus]    = useState("all");
  const [query,     setQuery]     = useState("");
  const [scanOpen,  setScanOpen]  = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (category !== "all" && r.category !== category) return false;
      if (zone     !== "all" && r.primary_zone !== zone)  return false;
      if (status   !== "all" && r.status !== status)      return false;
      if (q && !(`${r.product_id} ${r.name}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, category, zone, status, query]);

  const filteredUnits = filtered.reduce((a, r) => a + r.total_qty, 0);

  return (
    <AppLayout>
      <div className="p-6 space-y-5">

        {/* Header */}
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-green">Inventory</div>
            <h2 className="text-2xl font-bold mt-1">Live Stock — Tuas HQ</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {loading ? "Loading…" : error ? "Could not connect to API" : (
                `${filtered.length} of ${summary.total_skus} SKUs · ${filteredUnits.toLocaleString()} units shown · Live from warehouse.db`
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="text-xs font-semibold px-3 py-2 rounded-md border border-border bg-background hover:bg-muted transition-colors flex items-center gap-1.5">
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
            <button
              onClick={() => setScanOpen(true)}
              className="text-xs font-semibold px-3 py-2 rounded-md bg-amber text-white hover:bg-amber/90 transition-colors flex items-center gap-1.5"
            >
              <ScanLine className="h-3.5 w-3.5" /> Scan New Item
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 bg-red-soft border border-red/30 rounded-lg px-4 py-3 text-sm text-red">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Could not load inventory — is the FastAPI server running?
            <code className="text-xs bg-red/10 px-1 rounded ml-1">{error}</code>
          </div>
        )}

        {/* Filters */}
        <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[220px]">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by SKU or product name…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Filter label="Category" value={category} setValue={setCategory}
            options={["all", ...CATEGORIES]} />
          <Filter label="Zone" value={zone} setValue={setZone}
            options={["all", ...ZONES]} display={(v) => v === "all" ? "All Zones" : ZONE_LABELS[v] ?? v} />
          <Filter label="Status" value={status} setValue={setStatus}
            options={["all", "Healthy", "Low", "Critical"]} />
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-navy text-navy-foreground">
                <tr className="text-left">
                  <Th>SKU</Th>
                  <Th>Product</Th>
                  <Th>Category</Th>
                  <Th>Primary Zone</Th>
                  <Th>Bin Locations</Th>
                  <Th className="text-right">Qty On Hand</Th>
                  <Th className="text-right">Reorder Pt</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      Loading inventory from database…
                    </td>
                  </tr>
                )}
                {!loading && filtered.map((r) => (
                  <tr key={r.product_id} className="border-t border-border hover:bg-muted/60 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold whitespace-nowrap">{r.product_id}</td>
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.category}</td>
                    <td className="px-4 py-3">
                      {r.primary_zone
                        ? <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted">
                            {r.primary_zone} · {ZONE_LABELS[r.primary_zone]?.split(" · ")[1] ?? ""}
                          </span>
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[220px] truncate" title={r.bin_locations ?? ""}>
                      {r.bin_locations ?? "No stock"}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold tabular-nums ${r.low_stock ? "text-red" : ""}`}>
                      {r.total_qty.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                      {r.reorder_point.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${statusStyle(r.status)}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 && !error && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      No SKUs match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Scan modal */}
      {scanOpen && (
        <div
          className="fixed inset-0 z-50 bg-navy/60 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setScanOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-amber">Scan</div>
                <div className="font-semibold">Log Stock Movement</div>
              </div>
              <button onClick={() => setScanOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5">
              <div className="relative aspect-square rounded-lg overflow-hidden bg-navy-deep">
                <div className="absolute inset-0 flex items-center justify-center">
                  <Camera className="h-12 w-12 text-white/20" />
                </div>
                {["top-4 left-4 border-t-2 border-l-2","top-4 right-4 border-t-2 border-r-2","bottom-4 left-4 border-b-2 border-l-2","bottom-4 right-4 border-b-2 border-r-2"].map((c) => (
                  <div key={c} className={`absolute ${c} h-8 w-8 border-amber rounded-sm`} />
                ))}
                <div className="absolute left-6 right-6 top-1/2 h-0.5 bg-amber/80 shadow-[0_0_12px_var(--amber)] animate-pulse" />
                <div className="absolute bottom-3 left-0 right-0 text-center text-[11px] text-white/70 uppercase tracking-widest">
                  Live camera · QR mode
                </div>
              </div>
              <p className="mt-4 text-sm text-center text-muted-foreground">
                Point camera at bin QR code to log stock movement
              </p>
            </div>
            <div className="px-5 py-3 border-t border-border flex justify-end">
              <button onClick={() => setScanOpen(false)}
                className="px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-muted transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap ${className}`}>
      {children}
    </th>
  );
}

function Filter({
  label, value, setValue, options, display,
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
  options: readonly string[];
  display?: (v: string) => string;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="px-2.5 py-1.5 rounded-md border border-border bg-background text-sm font-medium"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {display ? display(o) : (o === "all" ? `All ${label}s` : o)}
          </option>
        ))}
      </select>
    </div>
  );
}
