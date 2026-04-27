import { useEffect, useMemo, useRef, useState } from "react";
import {
  units,
  categoryMeta,
  ZONES,
  type Category,
  type StorageUnit,
  type ZoneSpec,
  unitMatchesVariant,
} from "@/lib/warehouse-data";

interface Props {
  category: "all" | Category;
  variant: string;
}

// World units (px)
const BAY_W = 56;          // bay width along X for racks
const RACK_DEPTH = 64;     // rack depth (Y)
const LEVEL_H = 42;        // height of one shelf level
const BOX_PAD = 5;
const RACK_GAP = 36;       // gap between racks within a zone
const SHELF_THK = 3;
const POST_W = 4;

// Floor stack
const PALLET_CELL = 56;    // cell on a pallet (a single carton footprint)
const PALLET_PAD = 6;
const PALLET_GAP = 24;     // gap between pallet clusters
const STACK_H = 36;        // floor box height

// Scene composition: 5 zones laid out left→right
type ZonePlacement = { spec: ZoneSpec; x: number; y: number; w: number; d: number };

function planScene(): { placements: ZonePlacement[]; floorW: number; floorD: number } {
  const margin = 90;
  const zoneGap = 70;
  let cursorX = margin;
  const topY = 100;

  const placements: ZonePlacement[] = [];
  let maxDepth = 0;

  for (const z of ZONES) {
    let w = 0;
    let d = 0;
    if (z.area === "rack-high" || z.area === "rack-mid") {
      const rackW = z.baysPerRack! * BAY_W;
      w = z.rackCount! * rackW + (z.rackCount! - 1) * RACK_GAP;
      d = RACK_DEPTH;
    } else {
      const palletW = z.palletCols! * PALLET_CELL + PALLET_PAD * 2;
      const palletD = z.palletRows! * PALLET_CELL + PALLET_PAD * 2;
      w = z.clusters! * palletW + (z.clusters! - 1) * PALLET_GAP;
      d = palletD;
    }
    placements.push({ spec: z, x: cursorX, y: topY, w, d });
    cursorX += w + zoneGap;
    maxDepth = Math.max(maxDepth, d);
  }

  const floorW = cursorX - zoneGap + margin;
  const floorD = topY + maxDepth + 180; // room for label + dispatch
  return { placements, floorW, floorD };
}

function Cuboid({
  w, d, h, x, y, z,
  color, dim, glow, onClick,
}: {
  w: number; d: number; h: number;
  x: number; y: number; z: number;
  color: string; dim: boolean; glow: boolean;
  onClick?: () => void;
}) {
  const baseFill = dim ? "oklch(0.78 0.005 250)" : color;
  const sideDark = dim ? "oklch(0.62 0.005 250)" : `color-mix(in oklab, ${color} 60%, black)`;
  const sideMid  = dim ? "oklch(0.70 0.005 250)" : `color-mix(in oklab, ${color} 75%, black)`;
  const top      = dim ? "oklch(0.84 0.005 250)" : `color-mix(in oklab, ${color} 75%, white)`;

  const common: React.CSSProperties = {
    position: "absolute",
    transformStyle: "preserve-3d",
    backfaceVisibility: "hidden",
  };

  const handleClick = onClick
    ? (e: React.MouseEvent) => {
        e.stopPropagation();
        onClick();
      }
    : undefined;

  return (
    <div
      onPointerDown={(e) => { if (onClick) e.stopPropagation(); }}
      onClick={handleClick}
      className="absolute"
      style={{
        left: x, top: y, width: w, height: d,
        transform: `translateZ(${z}px)`,
        transformStyle: "preserve-3d",
        cursor: onClick ? "pointer" : "default",
        opacity: dim ? 0.5 : 1,
        filter: glow ? `drop-shadow(0 0 14px color-mix(in oklab, ${color} 70%, transparent))` : undefined,
        transition: "opacity 280ms ease, filter 280ms ease",
      }}
    >
      <div style={{ ...common, width: w, height: d, background: top, transform: `translateZ(${h}px)`, borderRadius: 2,
        boxShadow: glow ? `inset 0 0 0 1.5px color-mix(in oklab, ${color} 50%, white)` : "inset 0 0 0 0.5px rgba(0,0,0,0.15)" }} />
      <div style={{ ...common, width: w, height: h, background: baseFill, transform: `rotateX(-90deg) translateY(-${h}px) translateZ(${d}px)`, transformOrigin: "top left", borderRadius: 1, boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.18)" }} />
      <div style={{ ...common, width: w, height: h, background: sideMid,  transform: `rotateX(-90deg) translateY(-${h}px) translateZ(0px)`,  transformOrigin: "top left" }} />
      <div style={{ ...common, width: d, height: h, background: sideDark, transform: `rotateY(90deg) rotateX(-90deg) translateY(-${h}px) translateZ(0px)`, transformOrigin: "top left" }} />
      <div style={{ ...common, width: d, height: h, background: sideMid,  transform: `translateX(${w}px) rotateY(90deg) rotateX(-90deg) translateY(-${h}px) translateZ(0px)`, transformOrigin: "top left" }} />
    </div>
  );
}

function RackFrame({ x, y, w, d, levels, levelH = LEVEL_H }: {
  x: number; y: number; w: number; d: number; levels: number; levelH?: number;
}) {
  const total = levels * levelH + 14;
  const shelfColor = "oklch(0.62 0.02 260)";
  const postColor = "oklch(0.32 0.04 260)";
  const posts = [
    { px: 0,        py: 0 },
    { px: w - POST_W, py: 0 },
    { px: 0,        py: d - POST_W },
    { px: w - POST_W, py: d - POST_W },
    { px: w / 2 - POST_W / 2, py: 0 },
    { px: w / 2 - POST_W / 2, py: d - POST_W },
  ];
  return (
    <div className="absolute" style={{ left: x, top: y, width: w, height: d, transformStyle: "preserve-3d" }}>
      {posts.map((p, i) => (
        <Cuboid key={`p${i}`} w={POST_W} d={POST_W} h={total} x={p.px} y={p.py} z={0} color={postColor} dim={false} glow={false} />
      ))}
      {Array.from({ length: levels + 1 }).map((_, lvl) => (
        <Cuboid key={`s${lvl}`} w={w} d={d} h={SHELF_THK} x={0} y={0} z={lvl * levelH} color={shelfColor} dim={false} glow={false} />
      ))}
    </div>
  );
}

// Painted pallet rectangle on the floor
function PalletPad({ x, y, w, d }: { x: number; y: number; w: number; d: number }) {
  return (
    <div
      className="absolute"
      style={{
        left: x, top: y, width: w, height: d,
        transform: "translateZ(0.6px)",
        background:
          "repeating-linear-gradient(45deg, oklch(0.85 0.06 75) 0 8px, oklch(0.78 0.10 75) 8px 14px)",
        border: "1.5px dashed oklch(0.55 0.14 70)",
        borderRadius: 4,
        opacity: 0.85,
      }}
    />
  );
}

// Decorative ladder (placed beside high racks)
function Ladder({ x, y }: { x: number; y: number }) {
  const color = "oklch(0.65 0.12 50)";
  return (
    <div className="absolute" style={{ left: x, top: y, width: 14, height: 22, transformStyle: "preserve-3d" }}>
      <Cuboid w={3} d={3} h={150} x={0}  y={0} z={0} color={color} dim={false} glow={false} />
      <Cuboid w={3} d={3} h={150} x={11} y={0} z={0} color={color} dim={false} glow={false} />
      {Array.from({ length: 6 }).map((_, i) => (
        <Cuboid key={i} w={14} d={3} h={2} x={0} y={0} z={20 + i * 22} color={color} dim={false} glow={false} />
      ))}
    </div>
  );
}

// Decorative forklift
function Forklift({ x, y }: { x: number; y: number }) {
  return (
    <div className="absolute" style={{ left: x, top: y, width: 50, height: 30, transformStyle: "preserve-3d" }}>
      {/* body */}
      <Cuboid w={50} d={30} h={28} x={0} y={0} z={0} color="oklch(0.72 0.16 75)" dim={false} glow={false} />
      {/* cab */}
      <Cuboid w={26} d={26} h={28} x={4} y={2} z={28} color="oklch(0.55 0.12 75)" dim={false} glow={false} />
      {/* mast */}
      <Cuboid w={4} d={6} h={70} x={44} y={12} z={0} color="oklch(0.30 0.04 260)" dim={false} glow={false} />
      <Cuboid w={4} d={6} h={70} x={50} y={12} z={0} color="oklch(0.30 0.04 260)" dim={false} glow={false} />
      {/* forks */}
      <Cuboid w={22} d={4} h={3} x={50} y={6}  z={4} color="oklch(0.40 0.04 260)" dim={false} glow={false} />
      <Cuboid w={22} d={4} h={3} x={50} y={20} z={4} color="oklch(0.40 0.04 260)" dim={false} glow={false} />
    </div>
  );
}

const DEFAULT_CAM = { pitch: 58, yaw: -32, zoom: 0.9, panX: 0, panY: 0 };

export function WarehouseFloor({ category, variant }: Props) {
  const [selected, setSelected] = useState<StorageUnit | null>(null);
  const [cam, setCam] = useState(DEFAULT_CAM);
  const dragRef = useRef<{ mode: "orbit" | "pan"; sx: number; sy: number; start: typeof DEFAULT_CAM } | null>(null);
  const sceneRef = useRef<HTMLDivElement>(null);

  const isHighlighted = (u: StorageUnit) => {
    if (category === "all") return true;
    if (u.category !== category) return false;
    return unitMatchesVariant(u, variant);
  };

  const { placements, floorW, floorD } = useMemo(() => planScene(), []);

  const byZone = useMemo(() => {
    const m = new Map<string, StorageUnit[]>();
    for (const u of units) {
      if (!m.has(u.zone)) m.set(u.zone, []);
      m.get(u.zone)!.push(u);
    }
    return m;
  }, []);

  // Pointer handlers — orbit/pan
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-box='1']")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      mode: e.shiftKey || e.button === 1 ? "pan" : "orbit",
      sx: e.clientX, sy: e.clientY, start: cam,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (d.mode === "orbit") {
      setCam({
        ...d.start,
        yaw: d.start.yaw + dx * 0.4,
        pitch: Math.min(82, Math.max(20, d.start.pitch - dy * 0.3)),
      });
    } else {
      setCam({ ...d.start, panX: d.start.panX + dx, panY: d.start.panY + dy });
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  };
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setCam((c) => ({ ...c, zoom: Math.min(1.8, Math.max(0.4, c.zoom * (e.deltaY > 0 ? 0.92 : 1.08))) }));
  };
  const onDoubleClick = () => setCam(DEFAULT_CAM);

  // wheel needs non-passive listener for preventDefault
  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setCam((c) => ({ ...c, zoom: Math.min(1.8, Math.max(0.4, c.zoom * (e.deltaY > 0 ? 0.92 : 1.08))) }));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const boxW = BAY_W - BOX_PAD * 2;
  const boxD = RACK_DEPTH - BOX_PAD * 2;
  const boxH = LEVEL_H - 10;

  const palletBoxW = PALLET_CELL - BOX_PAD * 2;
  const palletBoxD = PALLET_CELL - BOX_PAD * 2;

  return (
    <div
      ref={sceneRef}
      className="relative w-full h-full overflow-hidden bg-gradient-to-br from-[oklch(0.96_0.01_250)] to-[oklch(0.92_0.015_250)] select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
      style={{ cursor: dragRef.current ? "grabbing" : "grab", touchAction: "none" }}
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: floorW,
          height: floorD,
          transform: `translate(calc(-50% + ${cam.panX}px), calc(-52% + ${cam.panY}px)) perspective(1800px) rotateX(${cam.pitch}deg) rotateZ(${cam.yaw}deg) scale(${cam.zoom})`,
          transformStyle: "preserve-3d",
          transition: dragRef.current ? "none" : "transform 220ms ease",
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

        {/* Receiving Bay */}
        <div className="absolute" style={{
          left: 60, right: 60, top: 14, height: 60,
          background: "linear-gradient(180deg, oklch(0.95 0.06 80), oklch(0.90 0.08 80))",
          border: "1.5px solid oklch(0.78 0.16 75)", borderRadius: 6,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "oklch(0.45 0.12 60)", fontWeight: 700, letterSpacing: 2, fontSize: 13, textTransform: "uppercase",
        }}>▲ Receiving Bay</div>

        {/* Dispatch Bay */}
        <div className="absolute" style={{
          left: 60, right: 60, bottom: 14, height: 60,
          background: "linear-gradient(180deg, oklch(0.95 0.05 158), oklch(0.90 0.07 158))",
          border: "1.5px solid oklch(0.68 0.16 158)", borderRadius: 6,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "oklch(0.40 0.14 158)", fontWeight: 700, letterSpacing: 2, fontSize: 13, textTransform: "uppercase",
        }}>▼ Dispatch Bay</div>

        {/* Zones */}
        {placements.map((p) => {
          const zUnits = byZone.get(p.spec.id) ?? [];
          return (
            <div key={p.spec.id} className="absolute" style={{ left: 0, top: 0, transformStyle: "preserve-3d" }}>
              {/* Zone footprint outline on floor */}
              <div className="absolute" style={{
                left: p.x - 12, top: p.y - 12, width: p.w + 24, height: p.d + 24,
                border: "1px dashed oklch(0.78 0.02 250)",
                borderRadius: 8, transform: "translateZ(0.4px)",
              }} />

              {p.spec.area === "rack-high" || p.spec.area === "rack-mid" ? (
                <>
                  {/* render N racks */}
                  {Array.from({ length: p.spec.rackCount! }).map((_, ri) => {
                    const rackW = p.spec.baysPerRack! * BAY_W;
                    const rx = p.x + ri * (rackW + RACK_GAP);
                    return (
                      <RackFrame key={ri} x={rx} y={p.y} w={rackW} d={RACK_DEPTH} levels={p.spec.levels!} />
                    );
                  })}
                  {/* boxes on shelves */}
                  {zUnits.map((u) => {
                    const hi = isHighlighted(u);
                    const meta = categoryMeta[u.category];
                    const ri = Math.floor(u.bay / p.spec.baysPerRack!);
                    const bIn = u.bay % p.spec.baysPerRack!;
                    const rackW = p.spec.baysPerRack! * BAY_W;
                    const rx = p.x + ri * (rackW + RACK_GAP);
                    const px = rx + bIn * BAY_W + BOX_PAD;
                    const py = p.y + BOX_PAD;
                    const pz = SHELF_THK + u.level * LEVEL_H + 1.5;
                    return (
                      <div key={u.id} data-box="1" style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d" }}>
                        <Cuboid
                          w={boxW} d={boxD} h={boxH}
                          x={px} y={py} z={pz}
                          color={meta.color}
                          dim={!hi}
                          glow={hi && category !== "all"}
                          onClick={hi ? () => setSelected(u) : undefined}
                        />
                      </div>
                    );
                  })}
                  {/* equipment props */}
                  {p.spec.area === "rack-high" && p.spec.id === "A" && (
                    <Ladder x={p.x + p.spec.baysPerRack! * BAY_W + 8} y={p.y + 18} />
                  )}
                  {p.spec.area === "rack-high" && p.spec.id === "B" && (
                    <Forklift x={p.x + p.w + 6} y={p.y + p.d - 4} />
                  )}
                </>
              ) : (
                <>
                  {/* pallet pads */}
                  {Array.from({ length: p.spec.clusters! }).map((_, ci) => {
                    const palletW = p.spec.palletCols! * PALLET_CELL + PALLET_PAD * 2;
                    const palletD = p.spec.palletRows! * PALLET_CELL + PALLET_PAD * 2;
                    const cx = p.x + ci * (palletW + PALLET_GAP);
                    return <PalletPad key={ci} x={cx} y={p.y} w={palletW} d={palletD} />;
                  })}
                  {/* stacked cartons */}
                  {zUnits.map((u) => {
                    const hi = isHighlighted(u);
                    const meta = categoryMeta[u.category];
                    const palletW = p.spec.palletCols! * PALLET_CELL + PALLET_PAD * 2;
                    const cx = p.x + u.cluster * (palletW + PALLET_GAP) + PALLET_PAD + u.cx * PALLET_CELL + BOX_PAD;
                    const cy = p.y + PALLET_PAD + u.cy * PALLET_CELL + BOX_PAD;
                    const cz = 1 + u.stack * (STACK_H + 1);
                    return (
                      <div key={u.id} data-box="1" style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d" }}>
                        <Cuboid
                          w={palletBoxW} d={palletBoxD} h={STACK_H}
                          x={cx} y={cy} z={cz}
                          color={meta.color}
                          dim={!hi}
                          glow={hi && category !== "all"}
                          onClick={hi ? () => setSelected(u) : undefined}
                        />
                      </div>
                    );
                  })}
                </>
              )}

              {/* Zone label (counter-rotated for legibility) */}
              <div
                className="absolute"
                style={{
                  left: p.x, top: p.y + p.d + 16,
                  width: p.w, textAlign: "center",
                  transform: `rotateZ(${-cam.yaw}deg) rotateX(${-cam.pitch}deg)`,
                  transformOrigin: "top left",
                }}
              >
                <span className="inline-block text-[10px] font-bold tracking-[0.2em] uppercase px-2.5 py-1 rounded bg-white/90 text-navy border border-border shadow-sm whitespace-nowrap">
                  Zone {p.spec.id} · {p.spec.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* HUD */}
      <div className="absolute left-4 bottom-4 text-[10px] uppercase tracking-widest text-muted-foreground bg-card/85 backdrop-blur px-3 py-1.5 rounded border border-border pointer-events-none">
        Drag · orbit  ·  Scroll · zoom  ·  Shift+drag · pan  ·  Double-click · reset
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); setCam(DEFAULT_CAM); }}
        className="absolute right-4 bottom-4 text-[10px] uppercase tracking-widest font-semibold bg-card border border-border px-3 py-1.5 rounded hover:bg-muted"
      >
        Reset view
      </button>

      {/* Tooltip */}
      {selected && (
        <div
          className="absolute right-6 top-6 w-72 bg-card border border-border rounded-lg shadow-2xl p-4 z-20"
          role="dialog"
          onPointerDown={(e) => e.stopPropagation()}
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
            >×</button>
          </div>
          <div className="space-y-1.5 text-xs">
            <Row label="Variant" value={selected.variant} />
            <Row label="SKU" value={selected.sku} />
            <Row
              label="Storage"
              value={
                selected.area === "floor-stack"
                  ? `Floor stack · ${selected.shelfLabel} · tier ${selected.stack + 1}`
                  : selected.area === "rack-high"
                    ? `High racking · ${selected.shelfLabel} · level ${selected.level + 1} (ladder/forklift)`
                    : `Mid shelving · ${selected.shelfLabel} · level ${selected.level + 1}`
              }
            />
            <Row label="Zone" value={`${selected.zone} — ${ZONES.find(z => z.id === selected.zone)?.label ?? ""}`} />
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
