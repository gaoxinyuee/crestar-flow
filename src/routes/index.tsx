import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { WarehouseFloor } from "@/components/WarehouseFloor";
import {
  categoryOptions,
  variantsByCategory,
  units,
  unitMatchesVariant,
  type Category,
  categoryMeta,
} from "@/lib/warehouse-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Warehouse View — Crestar Warehouse Intelligence Suite" },
      { name: "description", content: "Live 3D digital twin of the Crestar Tuas warehouse floor." },
    ],
  }),
  component: WarehousePage,
});

function WarehousePage() {
  const [category, setCategory] = useState<"all" | Category>("all");
  const [variant, setVariant] = useState<string>("all");

  const visibleCount = useMemo(() => {
    return units.filter((u) => {
      if (category === "all") return true;
      if (u.category !== category) return false;
      return unitMatchesVariant(u, variant);
    }).length;
  }, [category, variant]);

  const variantList = category === "all" ? [] : variantsByCategory[category];

  return (
    <AppLayout>
      <div className="p-6 space-y-5 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-green">Digital Twin</div>
            <h2 className="text-2xl font-bold mt-1">Warehouse Floor — Tuas HQ</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Live view of 90 storage units across 6 zones · Last sync 12 sec ago
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-green-soft text-green font-semibold">● ONLINE</span>
            <span className="text-muted-foreground">94% capacity utilised</span>
          </div>
        </div>

        {/* Filter bar */}
        <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Product</label>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as "all" | Category);
                setVariant("all");
              }}
              className="px-3 py-1.5 rounded-md border border-border bg-background text-sm font-medium"
            >
              {categoryOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {category !== "all" && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Variant</label>
              <select
                value={variant}
                onChange={(e) => setVariant(e.target.value)}
                className="px-3 py-1.5 rounded-md border border-border bg-background text-sm font-medium"
              >
                <option value="all">All Variants</option>
                {variantList.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-muted-foreground">Categories:</span>
            {(Object.keys(categoryMeta) as Category[]).map((c) => (
              <span key={c} className="flex items-center gap-1.5 text-xs">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: categoryMeta[c].color }} />
                <span className="text-muted-foreground">{categoryMeta[c].label}</span>
              </span>
            ))}
          </div>

          <div className="w-full flex items-center justify-between pt-2 border-t border-border">
            <div className="text-xs">
              <span className="font-semibold text-foreground">Showing {visibleCount} of 90 units</span>
              {category !== "all" && (
                <span className="text-muted-foreground"> — {categoryMeta[category as Category].label}{variant !== "all" ? ` · ${variant}` : ""}</span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground">Tip: click any highlighted box to inspect</div>
          </div>
        </div>

        {/* Floor */}
        <div className="flex-1 bg-card border border-border rounded-xl min-h-[560px] overflow-hidden">
          <WarehouseFloor category={category} variant={variant} />
        </div>
      </div>
    </AppLayout>
  );
}
