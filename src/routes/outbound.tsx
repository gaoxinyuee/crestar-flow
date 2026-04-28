import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Plus, Truck, CheckCircle2, Clock, X, Package } from "lucide-react";

export const Route = createFileRoute("/outbound")({
  head: () => ({
    meta: [
      { title: "Outbound Orders — Crestar Warehouse Intelligence Suite" },
      { name: "description", content: "Outbound dispatch schedule and order picking status." },
    ],
  }),
  component: OutboundPage,
});

type OrderStatus = "Picking" | "Ready" | "Dispatched";

interface Order {
  id: string;
  customer: string;
  items: { sku: string; qty: number }[];
  units: number;
  dispatch: string; // ISO date 2024-12-XX
  dispatchLabel: string;
  status: OrderStatus;
  driver: string;
}

const orders: Order[] = [
  { id: "ORD-2294", customer: "Bright Electrical Supplies", items: [{ sku: "FBL-042", qty: 20 }, { sku: "MTR-024", qty: 5 }],  units: 25, dispatch: "2024-12-19", dispatchLabel: "19 Dec 2024", status: "Picking",    driver: "Floor Staff" },
  { id: "ORD-2293", customer: "CoolBreeze Distributors",    items: [{ sku: "WKT-009", qty: 30 }, { sku: "CSG-011", qty: 15 }], units: 45, dispatch: "2024-12-18", dispatchLabel: "18 Dec 2024", status: "Picking",    driver: "Floor Staff" },
  { id: "ORD-2292", customer: "Metro HVAC Solutions",       items: [{ sku: "FBL-055", qty: 12 }],                              units: 12, dispatch: "2024-12-17", dispatchLabel: "17 Dec 2024", status: "Ready",      driver: "James (Driver)" },
  { id: "ORD-2291", customer: "Bright Electrical Supplies", items: [{ sku: "FBL-067", qty: 12 }],                              units: 12, dispatch: "2024-12-16", dispatchLabel: "16 Dec 2024", status: "Dispatched", driver: "James (Driver)" },
  { id: "ORD-2290", customer: "Airflow Trade Centre",       items: [{ sku: "MTR-031", qty: 8 }, { sku: "WKT-021", qty: 10 }],  units: 18, dispatch: "2024-12-15", dispatchLabel: "15 Dec 2024", status: "Dispatched", driver: "Marcus (Driver)" },
];

function statusPill(s: OrderStatus) {
  if (s === "Picking")    return { cls: "bg-amber-soft text-amber border-amber/40", Icon: Clock };
  if (s === "Ready")      return { cls: "bg-[oklch(0.94_0.04_240)] text-[oklch(0.45_0.18_245)] border-[oklch(0.62_0.18_245)]/30", Icon: Package };
  return { cls: "bg-green-soft text-green border-green/30", Icon: CheckCircle2 };
}

// Week strip Mon-Sun for the week of 16 Dec 2024 (matches the dispatch dates above)
const weekStart = new Date("2024-12-16T00:00:00");
const weekDays = Array.from({ length: 7 }).map((_, i) => {
  const d = new Date(weekStart);
  d.setDate(weekStart.getDate() + i);
  return d;
});
const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function OutboundPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? orders.find((o) => o.id === openId) ?? null : null;

  const countsByDay = useMemo(() => {
    return weekDays.map((d) => {
      const iso = d.toISOString().slice(0, 10);
      return orders.filter((o) => o.dispatch === iso).length;
    });
  }, []);

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-green">Outbound</div>
            <h2 className="text-2xl font-bold mt-1">Dispatch Orders</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {orders.length} orders this week · 2 vans deployed · Drivers: James, Marcus
            </p>
          </div>
          <button className="text-xs font-semibold px-3 py-2 rounded-md bg-green text-white hover:bg-green/90 transition-colors flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New Order
          </button>
        </div>

        {/* Weekly calendar strip */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Week of {weekDays[0].toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – {weekDays[6].toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((d, i) => {
              const count = countsByDay[i];
              const today = d.toISOString().slice(0, 10) === "2024-12-18";
              return (
                <div
                  key={i}
                  className={`rounded-lg p-3 border transition-colors ${
                    today ? "border-green bg-green-soft" : "border-border bg-background"
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{dayNames[i]}</div>
                  <div className={`text-lg font-bold mt-0.5 ${today ? "text-green" : ""}`}>{d.getDate()}</div>
                  <div className="mt-2">
                    {count > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-navy text-navy-foreground">
                        <Truck className="h-2.5 w-2.5" /> {count} {count === 1 ? "order" : "orders"}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-navy text-navy-foreground">
                <tr className="text-left">
                  <Th>Order ID</Th>
                  <Th>Customer</Th>
                  <Th>Items</Th>
                  <Th className="text-right">Total Units</Th>
                  <Th>Dispatch Date</Th>
                  <Th>Status</Th>
                  <Th>Driver</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const sp = statusPill(o.status);
                  const Icon = sp.Icon;
                  return (
                    <tr key={o.id} className="border-t border-border hover:bg-muted/60 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-semibold">{o.id}</td>
                      <td className="px-4 py-3">{o.customer}</td>
                      <td className="px-4 py-3 text-xs">
                        {o.items.map((it) => `${it.sku} ×${it.qty}`).join(", ")}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{o.units}</td>
                      <td className="px-4 py-3">{o.dispatchLabel}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${sp.cls}`}>
                          <Icon className="h-3 w-3" /> {o.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{o.driver}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setOpenId(o.id)}
                          className="text-xs font-semibold text-green hover:underline"
                        >
                          View →
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

      {/* Detail slide-out */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setOpenId(null)}>
          <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md bg-card border-l border-border shadow-2xl h-full overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-navy text-navy-foreground px-5 py-4 flex items-start justify-between sticky top-0 z-10">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/60">Order</div>
                <div className="font-mono font-semibold text-lg mt-0.5">{open.id}</div>
                <div className="text-xs text-white/70 mt-1">{open.customer}</div>
              </div>
              <button onClick={() => setOpenId(null)} className="text-white/70 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <Field label="Dispatch" value={open.dispatchLabel} />
                <Field label="Status" value={open.status} />
                <Field label="Driver" value={open.driver} />
                <Field label="Total Units" value={open.units.toString()} />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Pick List</div>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted">
                      <tr className="text-left">
                        <th className="px-3 py-2 font-semibold">SKU</th>
                        <th className="px-3 py-2 font-semibold text-right">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {open.items.map((it) => (
                        <tr key={it.sku} className="border-t border-border">
                          <td className="px-3 py-2 font-mono font-semibold">{it.sku}</td>
                          <td className="px-3 py-2 text-right font-semibold">{it.qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
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
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted rounded-md px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-semibold mt-0.5">{value}</div>
    </div>
  );
}