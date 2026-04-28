import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Search, Download, ScanLine, X, Camera } from "lucide-react";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Crestar Warehouse Intelligence Suite" },
      { name: "description", content: "Live inventory across all Crestar zones with reorder thresholds." },
    ],
  }),
  component: InventoryPage,
});

type Status = "Healthy" | "Low" | "Critical";

interface Row {
  part: string;
  desc: string;
  category: "Fan Blades" | "Motors" | "Casings" | "Wiring Kits";
  zone: string;
  bin: string;
  qty: number;
  reorder: number;
  status: Status;
  updated: string;
}

const rows: Row[] = [
  { part: "FBL-042", desc: 'Fan Blade 16" 3-blade ABS',      category: "Fan Blades",  zone: "A", bin: "A-3-2", qty: 24, reorder: 10, status: "Healthy",  updated: "Today" },
  { part: "FBL-055", desc: 'Fan Blade 18" 5-blade PP',       category: "Fan Blades",  zone: "A", bin: "A-1-4", qty: 11, reorder: 10, status: "Healthy",  updated: "Today" },
  { part: "FBL-038", desc: 'Fan Blade 14" 3-blade ABS',      category: "Fan Blades",  zone: "B", bin: "B-2-1", qty:  4, reorder: 10, status: "Critical", updated: "Yesterday" },
  { part: "MTR-018", desc: "Motor 45W DC",                    category: "Motors",      zone: "C", bin: "C-1-3", qty:  3, reorder:  8, status: "Critical", updated: "Today" },
  { part: "MTR-024", desc: "Motor 60W AC",                    category: "Motors",      zone: "C", bin: "C-2-1", qty: 14, reorder:  8, status: "Healthy",  updated: "2 days ago" },
  { part: "CSG-011", desc: 'Casing Standard 16" White',      category: "Casings",     zone: "D", bin: "D-1-2", qty: 22, reorder: 12, status: "Healthy",  updated: "Yesterday" },
  { part: "CSG-019", desc: 'Casing Slim 18" Matte Black',    category: "Casings",     zone: "D", bin: "D-3-4", qty:  7, reorder: 12, status: "Low",      updated: "3 days ago" },
  { part: "WKT-009", desc: "Wiring Kit Standard 3-speed",     category: "Wiring Kits", zone: "B", bin: "B-2-3", qty:  5, reorder: 15, status: "Low",      updated: "Today" },
  { part: "WKT-014", desc: "Wiring Kit Premium 5-speed",      category: "Wiring Kits", zone: "E", bin: "E-1-1", qty:  2, reorder: 15, status: "Critical", updated: "Today" },
  { part: "FBL-067", desc: 'Fan Blade 16" 5-blade Metal',    category: "Fan Blades",  zone: "A", bin: "A-4-3", qty: 18, reorder: 10, status: "Healthy",  updated: "Yesterday" },
  { part: "FBL-071", desc: 'Fan Blade 16" 5-blade PP',       category: "Fan Blades",  zone: "A", bin: "A-3-5", qty:  8, reorder: 10, status: "Healthy",  updated: "2 days ago" },
  { part: "MTR-031", desc: "Motor 35W DC Quiet Series",       category: "Motors",      zone: "C", bin: "C-3-2", qty:  9, reorder:  8, status: "Healthy",  updated: "3 days ago" },
  { part: "CSG-027", desc: 'Casing Premium 20" Brushed',     category: "Casings",     zone: "D", bin: "D-2-1", qty:  3, reorder: 12, status: "Critical", updated: "Yesterday" },
  { part: "WKT-021", desc: "Wiring Kit Standard 5-speed",     category: "Wiring Kits", zone: "E", bin: "E-2-3", qty:  6, reorder: 15, status: "Low",      updated: "Today" },
  { part: "FBL-049", desc: 'Fan Blade 20" 5-blade ABS',      category: "Fan Blades",  zone: "F", bin: "F-1-2", qty: 31, reorder: 10, status: "Healthy",  updated: "4 days ago" },
];

function statusPill(s: Status) {
  if (s === "Healthy") return { cls: "bg-green-soft text-green border-green/30", icon: "✅" };
  if (s === "Low")     return { cls: "bg-amber-soft text-amber border-amber/40", icon: "🟡" };
  return { cls: "bg-red-soft text-red border-red/30", icon: "🔴" };
}

function InventoryPage() {
  const [category, setCategory] = useState<string>("all");
  const [zone, setZone] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [scanOpen, setScanOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (category !== "all" && r.category !== category) return false;
      if (zone !== "all" && r.zone !== zone) return false;
      if (status !== "all" && r.status !== status) return false;
      if (q && !(`${r.part} ${r.desc}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [category, zone, status, query]);

  const totalQty = filtered.reduce((a, r) => a + r.qty, 0);

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-green">Inventory</div>
            <h2 className="text-2xl font-bold mt-1">Live Stock — Tuas HQ</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {filtered.length} of {rows.length} SKUs · {totalQty} units on hand · Last sync 24 sec ago
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="text-xs font-semibold px-3 py-2 rounded-md border border-border bg-background hover:bg-muted transition-colors flex items-center gap-1.5">
              <Download className="h-3.5 w-3.5" /> Export to CSV
            </button>
            <button
              onClick={() => setScanOpen(true)}
              className="text-xs font-semibold px-3 py-2 rounded-md bg-amber text-white hover:bg-amber/90 transition-colors flex items-center gap-1.5"
            >
              <ScanLine className="h-3.5 w-3.5" /> Scan New Item
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[220px]">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by part number or description…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Filter label="Category" value={category} setValue={setCategory} options={["all", "Fan Blades", "Motors", "Casings", "Wiring Kits"]} />
          <Filter label="Zone" value={zone} setValue={setZone} options={["all", "A", "B", "C", "D", "E", "F"]} />
          <Filter label="Status" value={status} setValue={setStatus} options={["all", "Healthy", "Low", "Critical"]} />
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-navy text-navy-foreground">
                <tr className="text-left">
                  <Th>Part Number</Th>
                  <Th>Description</Th>
                  <Th>Category</Th>
                  <Th>Zone</Th>
                  <Th>Bin</Th>
                  <Th className="text-right">Qty On Hand</Th>
                  <Th className="text-right">Reorder Point</Th>
                  <Th>Status</Th>
                  <Th>Last Updated</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const sp = statusPill(r.status);
                  return (
                    <tr key={r.part} className="border-t border-border hover:bg-muted/60 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-semibold">{r.part}</td>
                      <td className="px-4 py-3">{r.desc}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.category}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted">{r.zone}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{r.bin}</td>
                      <td className="px-4 py-3 text-right font-semibold">{r.qty}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{r.reorder}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${sp.cls}`}>
                          <span className="text-[10px]">{sp.icon}</span> {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{r.updated}</td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
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
        <div className="fixed inset-0 z-50 bg-navy/60 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setScanOpen(false)}>
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
                {/* Viewfinder */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <Camera className="h-12 w-12 text-white/20" />
                </div>
                {/* Corner brackets */}
                {[
                  "top-4 left-4 border-t-2 border-l-2",
                  "top-4 right-4 border-t-2 border-r-2",
                  "bottom-4 left-4 border-b-2 border-l-2",
                  "bottom-4 right-4 border-b-2 border-r-2",
                ].map((c) => (
                  <div key={c} className={`absolute ${c} h-8 w-8 border-amber rounded-sm`} />
                ))}
                {/* Scan line */}
                <div className="absolute left-6 right-6 top-1/2 h-0.5 bg-amber/80 shadow-[0_0_12px_var(--amber)] animate-pulse" />
                <div className="absolute bottom-3 left-0 right-0 text-center text-[11px] text-white/70 uppercase tracking-widest">
                  Live camera · QR mode
                </div>
              </div>
              <p className="mt-4 text-sm text-center text-muted-foreground">
                Point camera at bin QR code to log stock movement
              </p>
            </div>
            <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
              <button
                onClick={() => setScanOpen(false)}
                className="px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-muted transition-colors"
              >
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
  return <th className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wider ${className}`}>{children}</th>;
}

function Filter({ label, value, setValue, options }: { label: string; value: string; setValue: (v: string) => void; options: string[] }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="px-2.5 py-1.5 rounded-md border border-border bg-background text-sm font-medium"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o === "all" ? `All ${label}` : o}</option>
        ))}
      </select>
    </div>
  );
}