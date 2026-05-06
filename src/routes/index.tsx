import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import Warehouse3D, { CategoryLegend, CATEGORY_COLORS, VARIANTS_BY_CATEGORY, type ZoneId } from "@/components/Warehouse3D";

export const Route = createFileRoute("/")(({
  head: () => ({
    meta: [
      { title: "Warehouse View — Crestar Warehouse Intelligence Suite" },
      { name: "description", content: "3D digital twin of the Crestar Tuas warehouse floor." },
    ],
  }),
  component: WarehousePage,
}));

const ZONES: { id: ZoneId; label: string; short: string }[] = [
  { id: "all", label: "All Zones",              short: "All" },
  { id: "A",   label: "Zone A · Receiving",     short: "A" },
  { id: "B",   label: "Zone B · High Rack",     short: "B" },
  { id: "C",   label: "Zone C · Medium Rack",   short: "C" },
  { id: "D",   label: "Zone D · Open Floor",    short: "D" },
  { id: "E",   label: "Zone E · Dispatch",      short: "E" },
];

function WarehousePage() {
  const [selectedZone,   setSelectedZone]   = useState<ZoneId>("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterVariant,  setFilterVariant]  = useState("all");

  const variantList = filterCategory !== "all" ? (VARIANTS_BY_CATEGORY[filterCategory] ?? []) : [];

  return (
    <AppLayout>
      <div className="flex flex-col h-full">

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="shrink-0 px-6 pt-5 pb-3 border-b border-border bg-card">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-green">Digital Twin</div>
              <h2 className="text-2xl font-bold mt-0.5">Warehouse Floor — Tuas HQ</h2>
              <p className="text-xs text-muted-foreground mt-1">
                48 m × 33 m · 5 zones · 27 SKUs · 79% occupancy
              </p>
            </div>
          </div>

          {/* ── Controls row ─────────────────────────────────────── */}
          <div className="mt-3 flex flex-wrap items-center gap-3">

            {/* Zone fly-to buttons */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">Zone</span>
              {ZONES.map((z) => (
                <button
                  key={z.id}
                  onClick={() => setSelectedZone(z.id)}
                  title={z.label}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors border ${
                    selectedZone === z.id
                      ? "bg-navy text-white border-navy"
                      : "bg-background text-muted-foreground border-border hover:border-navy hover:text-navy"
                  }`}
                >
                  {z.short}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-border" />

            {/* Category filter */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">Category</span>
              <select
                value={filterCategory}
                onChange={(e) => { setFilterCategory(e.target.value); setFilterVariant("all"); }}
                className="text-xs rounded border border-border bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-navy/40"
              >
                <option value="all">All categories</option>
                {Object.keys(CATEGORY_COLORS).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Variant sub-filter */}
            {variantList.length > 0 && (
              <>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">Type</span>
                  <select
                    value={filterVariant}
                    onChange={(e) => setFilterVariant(e.target.value)}
                    className="text-xs rounded border border-border bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-navy/40"
                  >
                    <option value="all">All types</option>
                    {variantList.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className="h-4 w-px bg-border" />

            {/* Category legend */}
            <CategoryLegend />
          </div>
        </div>

        {/* ── Viewport ─────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 relative">
          <Warehouse3D
            selectedZone={selectedZone}
            filterCategory={filterCategory}
            filterVariant={filterVariant}
          />
        </div>

      </div>
    </AppLayout>
  );
}
