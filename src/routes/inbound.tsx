import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { X, Truck, CheckCircle2, Clock, Calendar, FileText } from "lucide-react";

export const Route = createFileRoute("/inbound")({
  head: () => ({
    meta: [
      { title: "Inbound Shipments — Crestar Warehouse Intelligence Suite" },
      { name: "description", content: "Container schedule and manifest tracking for incoming Crestar shipments." },
    ],
  }),
  component: InboundPage,
});

type ShipStatus = "In Transit" | "Scheduled" | "Received";

interface Shipment {
  id: string;
  origin: string;
  eta: string;
  status: ShipStatus;
  skus: number;
  units: number;
  zones: string[];
}

const shipments: Shipment[] = [
  { id: "CN-2024-12", origin: "Guangzhou, China", eta: "18 Dec 2024", status: "In Transit", skus: 18, units: 1240, zones: ["A", "C", "E"] },
  { id: "CN-2024-13", origin: "Guangzhou, China", eta: "6 Jan 2025",  status: "Scheduled",  skus: 11, units:  680, zones: ["B", "D"] },
  { id: "CN-2024-11", origin: "Guangzhou, China", eta: "4 Dec 2024",  status: "Received",   skus: 14, units:  847, zones: ["A", "B", "C"] },
  { id: "CN-2024-10", origin: "Guangzhou, China", eta: "12 Nov 2024", status: "Received",   skus:  9, units:  512, zones: ["D", "E"] },
];

const manifest: Record<string, { sku: string; desc: string; units: number; zone: string }[]> = {
  "CN-2024-12": [
    { sku: "FBL-042", desc: 'Fan Blade 16" 3-blade ABS',     units: 120, zone: "A" },
    { sku: "MTR-018", desc: "Motor 45W DC",                   units:  80, zone: "C" },
    { sku: "WKT-014", desc: "Wiring Kit Premium 5-speed",     units: 200, zone: "E" },
    { sku: "CSG-019", desc: 'Casing Slim 18" Matte Black',   units: 150, zone: "D" },
    { sku: "FBL-038", desc: 'Fan Blade 14" 3-blade ABS',     units:  90, zone: "B" },
  ],
};

function statusPill(s: ShipStatus) {
  if (s === "In Transit") return { cls: "bg-amber-soft text-amber border-amber/40", Icon: Truck };
  if (s === "Scheduled")  return { cls: "bg-[oklch(0.94_0.04_240)] text-[oklch(0.45_0.18_245)] border-[oklch(0.62_0.18_245)]/30", Icon: Clock };
  return { cls: "bg-green-soft text-green border-green/30", Icon: CheckCircle2 };
}

function InboundPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? shipments.find((s) => s.id === openId) ?? null : null;

  const inTransit = shipments.filter((s) => s.status === "In Transit").length;
  const scheduled = shipments.filter((s) => s.status === "Scheduled").length;
  const totalIncoming = shipments.filter((s) => s.status !== "Received").reduce((a, s) => a + s.units, 0);

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-green">Inbound</div>
            <h2 className="text-2xl font-bold mt-1">Shipment Schedule</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Container freight from Crestar's China manufacturing partner · 1–2 arrivals per month
            </p>
          </div>
          <div className="flex gap-2 text-xs">
            <Stat label="In transit" value={inTransit.toString()} accent="amber" />
            <Stat label="Scheduled" value={scheduled.toString()} accent="navy" />
            <Stat label="Units incoming" value={totalIncoming.toLocaleString()} accent="green" />
          </div>
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-navy text-navy-foreground">
                <tr className="text-left">
                  <Th>Container ID</Th>
                  <Th>Origin</Th>
                  <Th>ETA</Th>
                  <Th>Status</Th>
                  <Th className="text-right">SKUs</Th>
                  <Th className="text-right">Total Units</Th>
                  <Th>Assigned Zones</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((s) => {
                  const sp = statusPill(s.status);
                  const Icon = sp.Icon;
                  return (
                    <tr key={s.id} className="border-t border-border hover:bg-muted/60 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-semibold">{s.id}</td>
                      <td className="px-4 py-3">{s.origin}</td>
                      <td className="px-4 py-3 flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-muted-foreground" /> {s.eta}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${sp.cls}`}>
                          <Icon className="h-3 w-3" /> {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">{s.skus}</td>
                      <td className="px-4 py-3 text-right font-semibold">{s.units.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {s.zones.map((z) => (
                            <span key={z} className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-muted">{z}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setOpenId(s.id)}
                          className="text-xs font-semibold text-green hover:underline"
                        >
                          View Details →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Details slide-out */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setOpenId(null)}>
          <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md bg-card border-l border-border shadow-2xl h-full overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-navy text-navy-foreground px-5 py-4 flex items-start justify-between sticky top-0 z-10">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/60">Container</div>
                <div className="font-mono font-semibold text-lg mt-0.5">{open.id}</div>
                <div className="text-xs text-white/70 mt-1">Crestar China Manufacturing Partner</div>
              </div>
              <button onClick={() => setOpenId(null)} className="text-white/70 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <Field label="ETA" value={open.eta} />
                <Field label="Status" value={open.status} />
                <Field label="Origin" value={open.origin} />
                <Field label="Total Units" value={open.units.toLocaleString()} />
              </div>

              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Line-Item Manifest</div>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted">
                      <tr className="text-left">
                        <th className="px-3 py-2 font-semibold">SKU</th>
                        <th className="px-3 py-2 font-semibold">Description</th>
                        <th className="px-3 py-2 font-semibold text-right">Units</th>
                        <th className="px-3 py-2 font-semibold">Zone</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(manifest[open.id] ?? []).map((m) => (
                        <tr key={m.sku} className="border-t border-border">
                          <td className="px-3 py-2 font-mono font-semibold">{m.sku}</td>
                          <td className="px-3 py-2 text-muted-foreground">{m.desc}</td>
                          <td className="px-3 py-2 text-right font-semibold">{m.units}</td>
                          <td className="px-3 py-2"><span className="font-mono px-1.5 py-0.5 rounded bg-muted">{m.zone}</span></td>
                        </tr>
                      ))}
                      {!manifest[open.id] && (
                        <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Manifest archived after receipt.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border border-amber/30 bg-amber-soft/60 rounded-lg p-3 flex gap-2.5">
                <FileText className="h-4 w-4 text-amber shrink-0 mt-0.5" />
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-amber">Operations Note</div>
                  <p className="text-sm mt-1">Receiving bay to be cleared by 17 Dec — Sarah to coordinate floor staff.</p>
                </div>
              </div>

              {open.status !== "Received" && (
                <button className="w-full py-3 rounded-md bg-amber text-white font-semibold text-sm hover:bg-amber/90 transition-colors">
                  Mark as Received
                </button>
              )}
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
function Stat({ label, value, accent }: { label: string; value: string; accent: "amber" | "navy" | "green" }) {
  const cls = accent === "amber" ? "text-amber" : accent === "green" ? "text-green" : "text-navy";
  return (
    <div className="bg-card border border-border rounded-md px-3 py-2 min-w-[100px]">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-base font-bold ${cls}`}>{value}</div>
    </div>
  );
}
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted rounded-md px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-semibold mt-0.5">{value}</div>
    </div>
  );
}