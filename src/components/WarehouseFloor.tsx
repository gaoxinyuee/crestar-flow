import { useMemo, useState } from "react";
import {
  units,
  categoryMeta,
  type Category,
  type StorageUnit,
  unitMatchesVariant,
} from "@/lib/warehouse-data";

interface Props {
  category: "all" | Category;
  variant: string;
}

export function WarehouseFloor({ category, variant }: Props) {
  const [selected, setSelected] = useState<StorageUnit | null>(null);

  const isHighlighted = (u: StorageUnit) => {
    if (category === "all") return true;
    if (u.category !== category) return false;
    return unitMatchesVariant(u, variant);
  };

  // Zone label positions (col, row pairs based on grid)
  const zoneLabels = useMemo(
    () => [
      { id: "A", x: 0, y: -0.6 },
      { id: "B", x: 7, y: -0.6 },
      { id: "C", x: 0, y: 4.4 },
      { id: "D", x: 7, y: 4.4 },
      { id: "E", x: 0, y: 9.4 },
      { id: "F", x: 7, y: 9.4 },
    ],
    [],
  );

  const cell = 44; // px per grid cell (pre-skew)

  // Isometric-ish skew via CSS transform on the floor container
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      {/* Floor backdrop */}
      <div
        className="relative"
        style={{
          width: 12 * cell + 80,
          height: 14 * cell + 120,
          perspective: "1400px",
        }}
      >
        {/* Receiving Bay */}
        <div className="absolute left-1/2 -translate-x-1/2 top-0 w-[80%] h-10 rounded-md bg-amber-soft border border-amber/40 flex items-center justify-center text-xs font-semibold text-amber/90 tracking-wider uppercase">
          ▲ Receiving Bay
        </div>

        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            top: 56,
            width: 12 * cell,
            height: 14 * cell,
            transform: "rotateX(48deg) rotateZ(-22deg) scale(0.95)",
            transformStyle: "preserve-3d",
          }}
        >
          {/* Floor surface */}
          <div className="absolute inset-0 rounded-lg bg-[oklch(0.94_0.01_250)] shadow-inner border border-border" />
          {/* Grid lines */}
          <svg className="absolute inset-0 w-full h-full" aria-hidden>
            {Array.from({ length: 13 }).map((_, i) => (
              <line
                key={`v${i}`}
                x1={i * cell}
                y1={0}
                x2={i * cell}
                y2={14 * cell}
                stroke="oklch(0.85 0.01 250)"
                strokeWidth={i % 5 === 0 ? 1.2 : 0.4}
                strokeDasharray={i === 5 || i === 7 ? "4 4" : undefined}
              />
            ))}
            {Array.from({ length: 15 }).map((_, i) => (
              <line
                key={`h${i}`}
                x1={0}
                y1={i * cell}
                x2={12 * cell}
                y2={i * cell}
                stroke="oklch(0.85 0.01 250)"
                strokeWidth={i % 5 === 0 ? 1.2 : 0.4}
                strokeDasharray={i === 3 || i === 5 || i === 8 || i === 10 ? "4 4" : undefined}
              />
            ))}
          </svg>

          {/* Zone labels */}
          {zoneLabels.map((z) => (
            <div
              key={z.id}
              className="absolute text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase"
              style={{
                left: z.x * cell + 6,
                top: z.y * cell + 6,
                transform: "rotateZ(22deg) rotateX(-48deg)",
              }}
            >
              Zone {z.id}
            </div>
          ))}

          {/* Storage units (boxes) */}
          {units.map((u) => {
            const hi = isHighlighted(u);
            return (
              <button
                key={u.id}
                onClick={() => hi && setSelected(u)}
                className="absolute group"
                style={{
                  left: u.x * cell + 4,
                  top: u.y * cell + 4,
                  width: cell - 8,
                  height: cell - 8,
                  transform: "translateZ(14px)",
                  transformStyle: "preserve-3d",
                  cursor: hi ? "pointer" : "default",
                }}
                aria-label={`${u.name} ${u.sku}`}
              >
                {/* Box top */}
                <div
                  className="absolute inset-0 rounded-[3px] transition-all duration-300"
                  style={{
                    background: hi
                      ? `linear-gradient(135deg, ${categoryMeta[u.category].color}, color-mix(in oklab, ${categoryMeta[u.category].color} 70%, white))`
                      : "oklch(0.82 0.005 250)",
                    boxShadow: hi
                      ? `0 0 0 1.5px color-mix(in oklab, ${categoryMeta[u.category].color} 70%, black), 0 6px 14px -4px color-mix(in oklab, ${categoryMeta[u.category].color} 60%, transparent)`
                      : "0 1px 2px rgba(0,0,0,0.08)",
                    opacity: hi ? 1 : 0.35,
                    filter: hi ? "saturate(1.1)" : "saturate(0.2)",
                  }}
                />
                {/* Side faces for depth */}
                <div
                  className="absolute left-0 right-0 -bottom-2 h-2 rounded-b-[3px]"
                  style={{
                    background: hi
                      ? `color-mix(in oklab, ${categoryMeta[u.category].color} 55%, black)`
                      : "oklch(0.65 0.005 250)",
                    opacity: hi ? 0.9 : 0.25,
                  }}
                />
              </button>
            );
          })}
        </div>

        {/* Dispatch Bay */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-[80%] h-10 rounded-md bg-green-soft border border-green/40 flex items-center justify-center text-xs font-semibold text-green tracking-wider uppercase">
          ▼ Dispatch Bay
        </div>
      </div>

      {/* Tooltip */}
      {selected && (
        <div
          className="absolute right-6 top-6 w-72 bg-card border border-border rounded-lg shadow-xl p-4 z-10"
          role="dialog"
        >
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {categoryMeta[selected.category].label}
              </div>
              <div className="text-sm font-semibold mt-0.5">{selected.name}</div>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-muted-foreground hover:text-foreground text-lg leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="space-y-1.5 text-xs">
            <Row label="Variant" value={selected.variant} />
            <Row label="SKU" value={selected.sku} />
            <Row
              label="Location"
              value={`Zone ${selected.zone} · Row ${selected.row} · Shelf ${selected.shelf}`}
            />
            <Row label="Quantity" value={`${selected.qty} units`} />
            <Row label="Last updated" value={selected.updated} />
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}