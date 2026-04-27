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

// World units (px). 1 grid cell = CELL px on the floor.
const CELL = 60;          // bay width along X
const RACK_DEPTH = 70;    // rack depth along Y
const LEVEL_H = 46;       // height of one shelf level
const BOX_PAD = 6;        // gap between box and bay walls
const AISLE = 60;         // gap between rack rows

// 6 zones = 3 rack rows x 2 rack columns (each rack: 5 bays wide x 3 levels)
const ZONE_LAYOUT = [
  { id: "A", rc: 0, rr: 0 },
  { id: "B", rc: 1, rr: 0 },
  { id: "C", rc: 0, rr: 1 },
  { id: "D", rc: 1, rr: 1 },
  { id: "E", rc: 0, rr: 2 },
  { id: "F", rc: 1, rr: 2 },
];

const RACK_W = 5 * CELL;
const RACK_GAP_X = 80;

const FLOOR_W = 2 * RACK_W + RACK_GAP_X + 160;
const FLOOR_D = 3 * RACK_DEPTH + 2 * AISLE + 200;

function Cuboid({
  w, d, h, x, y, z,
  color, dim, glow,
  onClick,
}: {
  w: number; d: number; h: number;
  x: number; y: number; z: number;
  color: string; dim: boolean; glow: boolean;
  onClick?: () => void;
}) {
  const baseFill = dim ? "oklch(0.78 0.005 250)" : color;
  const sideDark = dim
    ? "oklch(0.62 0.005 250)"
    : `color-mix(in oklab, ${color} 60%, black)`;
  const sideMid = dim
    ? "oklch(0.70 0.005 250)"
    : `color-mix(in oklab, ${color} 75%, black)`;
  const top = dim
    ? "oklch(0.84 0.005 250)"
    : `color-mix(in oklab, ${color} 75%, white)`;

  const common: React.CSSProperties = {
    position: "absolute",
    transformStyle: "preserve-3d",
    backfaceVisibility: "hidden",
  };

  return (
    <div
      onClick={onClick}
      className="absolute"
      style={{
        left: x,
        top: y,
        width: w,
        height: d,
        transform: `translateZ(${z}px)`,
        transformStyle: "preserve-3d",
        cursor: onClick ? "pointer" : "default",
        opacity: dim ? 0.55 : 1,
        filter: glow
          ? `drop-shadow(0 0 14px color-mix(in oklab, ${color} 70%, transparent))`
          : undefined,
        transition: "opacity 280ms ease, filter 280ms ease",
      }}
    >
      {/* bottom (skip — racks below) */}
      {/* top */}
      <div
        style={{
          ...common,
          width: w, height: d,
          background: top,
          transform: `translateZ(${h}px)`,
          borderRadius: 2,
          boxShadow: glow ? `inset 0 0 0 1.5px color-mix(in oklab, ${color} 50%, white)` : "inset 0 0 0 0.5px rgba(0,0,0,0.15)",
        }}
      />
      {/* front (facing +Y, i.e. towards camera-front) */}
      <div
        style={{
          ...common,
          width: w, height: h,
          background: baseFill,
          transform: `rotateX(-90deg) translateY(-${h}px) translateZ(${d}px)`,
          transformOrigin: "top left",
          borderRadius: 1,
          boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.18)",
        }}
      />
      {/* back */}
      <div
        style={{
          ...common,
          width: w, height: h,
          background: sideMid,
          transform: `rotateX(-90deg) translateY(-${h}px) translateZ(0px)`,
          transformOrigin: "top left",
        }}
      />
      {/* left */}
      <div
        style={{
          ...common,
          width: d, height: h,
          background: sideDark,
          transform: `rotateY(90deg) rotateX(-90deg) translateY(-${h}px) translateZ(0px)`,
          transformOrigin: "top left",
        }}
      />
      {/* right */}
      <div
        style={{
          ...common,
          width: d, height: h,
          background: sideMid,
          transform: `translateX(${w}px) rotateY(90deg) rotateX(-90deg) translateY(-${h}px) translateZ(0px)`,
          transformOrigin: "top left",
        }}
      />
    </div>
  );
}

/** A shelving rack frame: vertical posts + horizontal shelves. */
function RackFrame({ x, y, w, d, levels = 3, levelH = LEVEL_H }: {
  x: number; y: number; w: number; d: number; levels?: number; levelH?: number;
}) {
  const total = levels * levelH + 14;
  const postW = 4;
  const shelfThk = 3;
  const shelfColor = "oklch(0.62 0.02 260)";
  const postColor = "oklch(0.32 0.04 260)";

  const posts: Array<{ px: number; py: number }> = [
    { px: 0, py: 0 },
    { px: w - postW, py: 0 },
    { px: 0, py: d - postW },
    { px: w - postW, py: d - postW },
    { px: w / 2 - postW / 2, py: 0 },
    { px: w / 2 - postW / 2, py: d - postW },
  ];

  return (
    <div
      className="absolute"
      style={{
        left: x, top: y, width: w, height: d,
        transformStyle: "preserve-3d",
      }}
    >
      {/* Posts (vertical bars) */}
      {posts.map((p, i) => (
        <Cuboid
          key={`post-${i}`}
          w={postW} d={postW} h={total}
          x={p.px} y={p.py} z={0}
          color={postColor} dim={false} glow={false}
        />
      ))}
      {/* Shelves (horizontal slabs) at base of each level + top */}
      {Array.from({ length: levels + 1 }).map((_, lvl) => (
        <Cuboid
          key={`shelf-${lvl}`}
          w={w} d={d} h={shelfThk}
          x={0} y={0} z={lvl * levelH}
          color={shelfColor} dim={false} glow={false}
        />
      ))}
    </div>
  );
}

export function WarehouseFloor({ category, variant }: Props) {
  const [selected, setSelected] = useState<StorageUnit | null>(null);

  const isHighlighted = (u: StorageUnit) => {
    if (category === "all") return true;
    if (u.category !== category) return false;
    return unitMatchesVariant(u, variant);
  };

  // Group units by zone for placement
  const byZone = useMemo(() => {
    const map = new Map<string, StorageUnit[]>();
    for (const u of units) {
      if (!map.has(u.zone)) map.set(u.zone, []);
      map.get(u.zone)!.push(u);
    }
    return map;
  }, []);

  // Convert zone+bay+level to absolute scene coords
  const zoneOriginPx = (zoneId: string) => {
    const z = ZONE_LAYOUT.find((z) => z.id === zoneId)!;
    const x = z.rc * (RACK_W + RACK_GAP_X) + 80;
    const y = z.rr * (RACK_DEPTH + AISLE) + 100;
    return { x, y };
  };

  const boxW = CELL - BOX_PAD * 2;
  const boxD = RACK_DEPTH - BOX_PAD * 2;
  const boxH = LEVEL_H - 10;

  return (
    <div className="relative w-full h-full overflow-hidden bg-gradient-to-br from-[oklch(0.96_0.01_250)] to-[oklch(0.92_0.015_250)]">
      {/* Scene */}
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: FLOOR_W,
          height: FLOOR_D,
          transform: "translate(-50%, -52%) perspective(1800px) rotateX(58deg) rotateZ(-32deg) scale(0.88)",
          transformStyle: "preserve-3d",
        }}
      >
        {/* Floor slab */}
        <div
          className="absolute inset-0 rounded-xl"
          style={{
            background:
              "repeating-linear-gradient(0deg, oklch(0.93 0.01 250) 0 38px, oklch(0.91 0.01 250) 38px 40px), repeating-linear-gradient(90deg, oklch(0.93 0.01 250) 0 38px, oklch(0.91 0.01 250) 38px 40px)",
            boxShadow: "inset 0 0 0 2px oklch(0.85 0.01 250)",
          }}
        />

        {/* Aisle floor markings between rack rows */}
        {[0, 1].map((i) => (
          <div
            key={i}
            className="absolute"
            style={{
              left: 40,
              right: 40,
              top: 100 + RACK_DEPTH + i * (RACK_DEPTH + AISLE) + AISLE / 2 - 2,
              height: 4,
              background:
                "repeating-linear-gradient(90deg, oklch(0.78 0.16 75) 0 16px, transparent 16px 28px)",
              opacity: 0.85,
            }}
          />
        ))}

        {/* Receiving Bay (top edge in scene Y) */}
        <div
          className="absolute"
          style={{
            left: 60, right: 60, top: 14, height: 60,
            background: "linear-gradient(180deg, oklch(0.95 0.06 80), oklch(0.90 0.08 80))",
            border: "1.5px solid oklch(0.78 0.16 75)",
            borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "oklch(0.45 0.12 60)", fontWeight: 700, letterSpacing: 2, fontSize: 14, textTransform: "uppercase",
          }}
        >
          ▲ Receiving Bay
        </div>

        {/* Dispatch Bay */}
        <div
          className="absolute"
          style={{
            left: 60, right: 60, bottom: 14, height: 60,
            background: "linear-gradient(180deg, oklch(0.95 0.05 158), oklch(0.90 0.07 158))",
            border: "1.5px solid oklch(0.68 0.16 158)",
            borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "oklch(0.40 0.14 158)", fontWeight: 700, letterSpacing: 2, fontSize: 14, textTransform: "uppercase",
          }}
        >
          ▼ Dispatch Bay
        </div>

        {/* Racks + boxes for each zone */}
        {ZONE_LAYOUT.map((z) => {
          const o = zoneOriginPx(z.id);
          const zUnits = byZone.get(z.id) ?? [];
          return (
            <div key={z.id} className="absolute" style={{ left: 0, top: 0, transformStyle: "preserve-3d" }}>
              {/* Rack frame */}
              <RackFrame x={o.x} y={o.y} w={RACK_W} d={RACK_DEPTH} levels={3} levelH={LEVEL_H} />

              {/* Boxes — placed on shelves */}
              {zUnits.map((u) => {
                const hi = isHighlighted(u);
                const meta = categoryMeta[u.category];
                // bay column index 0..4 within the rack
                const bay = u.x % 7; // see warehouse-data layout
                const bayCol = ((bay % 7) + 7) % 7; // 0..4
                const px = o.x + bayCol * CELL + BOX_PAD;
                const py = o.y + BOX_PAD;
                const pz = 3 + u.level * LEVEL_H + 3; // sit above shelf slab
                return (
                  <Cuboid
                    key={u.id}
                    w={boxW}
                    d={boxD}
                    h={boxH}
                    x={px}
                    y={py}
                    z={pz}
                    color={meta.color}
                    dim={!hi}
                    glow={hi && category !== "all"}
                    onClick={hi ? () => setSelected(u) : undefined}
                  />
                );
              })}

              {/* Zone label on the floor (counter-rotated to read flat) */}
              <div
                className="absolute"
                style={{
                  left: o.x,
                  top: o.y + RACK_DEPTH + 10,
                  width: RACK_W,
                  textAlign: "center",
                  transform: "rotateZ(32deg) rotateX(-58deg)",
                  transformOrigin: "top left",
                }}
              >
                <span
                  className="inline-block text-[11px] font-bold tracking-[0.25em] uppercase px-2.5 py-1 rounded bg-white/85 text-navy border border-border shadow-sm"
                >
                  Zone {z.id}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* HUD: camera hint */}
      <div className="absolute left-4 bottom-4 text-[10px] uppercase tracking-widest text-muted-foreground bg-card/80 backdrop-blur px-2.5 py-1 rounded border border-border">
        Isometric view · 3 levels per rack · 6 zones
      </div>

      {/* Tooltip */}
      {selected && (
        <div
          className="absolute right-6 top-6 w-72 bg-card border border-border rounded-lg shadow-2xl p-4 z-20"
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
              value={`Zone ${selected.zone} · Level ${selected.level + 1} · Bay ${selected.shelf}`}
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