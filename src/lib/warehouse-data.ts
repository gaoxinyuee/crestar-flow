export type Category = "fan" | "motor" | "housing" | "wiring" | "misc";
export type AreaType = "rack-high" | "rack-mid" | "floor-stack";

export interface StorageUnit {
  id: string;
  sku: string;
  name: string;
  variant: string;
  category: Category;
  zone: string;
  area: AreaType;
  qty: number;
  updated: string;

  bay: number;
  level: number;

  cluster: number;
  cx: number;
  cy: number;
  stack: number;

  // realism jitter (deterministic per id)
  dx: number;
  dy: number;
  rot: number;     // degrees
  sizeMul: number; // width multiplier for the carton

  shelfLabel: string;
}

export const categoryMeta: Record<Category, { label: string; color: string; tw: string }> = {
  fan: { label: "Fan Blades", color: "var(--cat-fan)", tw: "bg-cat-fan" },
  motor: { label: "Motor Components", color: "var(--cat-motor)", tw: "bg-cat-motor" },
  housing: { label: "Housing Parts", color: "var(--cat-housing)", tw: "bg-cat-housing" },
  wiring: { label: "Wiring Kits", color: "var(--cat-wiring)", tw: "bg-cat-wiring" },
  misc: { label: "Misc Hardware", color: "var(--cat-misc)", tw: "bg-cat-misc" },
};

export interface ZoneSpec {
  id: string;
  label: string;
  area: AreaType;
  category: Category;
  rackCount?: number;
  baysPerRack?: number;
  levels?: number;
  clusters?: number;
  palletCols?: number;
  palletRows?: number;
  maxStack?: number;
}

export const ZONES: ZoneSpec[] = [
  { id: "A", label: "High Racking — Fan Blades",        area: "rack-high",   category: "fan",     rackCount: 2, baysPerRack: 4, levels: 5 },
  { id: "B", label: "High Racking — Motor Components",  area: "rack-high",   category: "motor",   rackCount: 2, baysPerRack: 4, levels: 4 },
  { id: "C", label: "Open Floor Stack — Housing Parts", area: "floor-stack", category: "housing", clusters: 3, palletCols: 2, palletRows: 2, maxStack: 3 },
  { id: "D", label: "Open Floor Stack — Misc Hardware", area: "floor-stack", category: "misc",    clusters: 4, palletCols: 2, palletRows: 2, maxStack: 4 },
  { id: "E", label: "Mid Shelving — Wiring Kits",       area: "rack-mid",    category: "wiring",  rackCount: 2, baysPerRack: 4, levels: 2 },
];

const variantPools: Record<Category, Array<{ variant: string; name: string; sku: string; qty: number }>> = {
  fan: [
    { variant: "Wooden Blades 52-inch", name: "Fan Blade 52\" Wooden", sku: "FB-W52", qty: 4 },
    { variant: "Wooden Blades 46-inch", name: "Fan Blade 46\" Wooden", sku: "FB-W46", qty: 6 },
    { variant: "Metal Blades 52-inch",  name: "Fan Blade 52\" Metal",  sku: "FB-M52", qty: 8 },
    { variant: "Metal Blades 46-inch",  name: "Fan Blade 46\" Metal",  sku: "FB-M46", qty: 5 },
    { variant: "Plastic Blades 36-inch",name: "Fan Blade 36\" Plastic",sku: "FB-P36", qty: 12 },
  ],
  motor: [
    { variant: "Motor Unit Type-A", name: "Motor Unit Type-A",   sku: "MT-A",   qty: 3 },
    { variant: "Motor Unit Type-B", name: "Motor Unit Type-B",   sku: "MT-B",   qty: 6 },
    { variant: "Motor Capacitor",   name: "Motor Capacitor 4uF", sku: "MT-CAP", qty: 24 },
  ],
  housing: [
    { variant: "Housing Casing L", name: "Housing Casing L",      sku: "HC-L",  qty: 4 },
    { variant: "Housing Casing M", name: "Housing Casing M",      sku: "HC-M",  qty: 5 },
    { variant: "Mounting Bracket", name: "Ceiling Mount Bracket", sku: "HC-MB", qty: 12 },
  ],
  wiring: [
    { variant: "Wiring Kit Standard",   name: "Wiring Kit Standard", sku: "WK-S",  qty: 3 },
    { variant: "Wiring Kit Premium",    name: "Wiring Kit Premium",  sku: "WK-P",  qty: 4 },
    { variant: "Remote Control Module", name: "RF Remote Module",    sku: "WK-RF", qty: 9 },
  ],
  misc: [
    { variant: "Screw Pack M6", name: "Screw Pack M6 (50pc)", sku: "MS-S6", qty: 30 },
    { variant: "Pull Chain",    name: "Brass Pull Chain",     sku: "MS-PC", qty: 14 },
    { variant: "Light Globe",   name: "LED Light Globe",      sku: "MS-LG", qty: 8 },
  ],
};

// deterministic hash → [0,1)
function hash01(seed: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}
function rand(seed: string, salt: number, min: number, max: number): number {
  return min + hash01(seed, salt) * (max - min);
}

function pickVariant(cat: Category, seed: string): { variant: string; name: string; sku: string; qty: number } {
  const pool = variantPools[cat];
  const idx = Math.floor(hash01(seed, 17) * pool.length);
  return pool[idx];
}

function dateStr(seed: string): string {
  const day = 10 + Math.floor(hash01(seed, 3) * 18);
  const hr = 1 + Math.floor(hash01(seed, 5) * 9);
  const mn = Math.floor(hash01(seed, 7) * 60);
  return `2025-01-${String(day).padStart(2, "0")} 0${hr}:${String(mn).padStart(2, "0")}`;
}

function jitter(id: string) {
  return {
    dx: Math.round(rand(id, 11, -4, 4)),
    dy: Math.round(rand(id, 13, -4, 4)),
    rot: Math.round(rand(id, 19, -7, 7) * 10) / 10,
    sizeMul: [0.85, 1, 1, 1.15][Math.floor(hash01(id, 23) * 4)],
  };
}

function buildUnits(): StorageUnit[] {
  const out: StorageUnit[] = [];
  let counter = 0;

  for (const z of ZONES) {
    if (z.area === "rack-high" || z.area === "rack-mid") {
      const racks = z.rackCount!;
      const bays = z.baysPerRack!;
      const lv = z.levels!;
      for (let r = 0; r < racks; r++) {
        for (let l = 0; l < lv; l++) {
          for (let b = 0; b < bays; b++) {
            const id = `${z.id}-${counter}`;
            // ~12% empty bays for realism
            if (hash01(id, 31) < 0.12) { counter++; continue; }
            const v = pickVariant(z.category, id);
            const j = jitter(id);
            out.push({
              id,
              sku: `${v.sku}-${String(100 + counter).padStart(3, "0")}`,
              name: v.name,
              variant: v.variant,
              category: z.category,
              zone: z.id,
              area: z.area,
              qty: v.qty,
              updated: dateStr(id),
              bay: r * bays + b,
              level: l,
              cluster: 0, cx: 0, cy: 0, stack: 0,
              ...j,
              shelfLabel: `${String.fromCharCode(65 + r)}${b + 1}`,
            });
            counter++;
          }
        }
      }
    } else {
      const cls = z.clusters!;
      const pc = z.palletCols!;
      const pr = z.palletRows!;
      const ms = z.maxStack!;
      for (let c = 0; c < cls; c++) {
        for (let cy = 0; cy < pr; cy++) {
          for (let cx = 0; cx < pc; cx++) {
            // ~15% empty pallet cells
            const cellSeed = `${z.id}-c${c}-${cx}${cy}`;
            if (hash01(cellSeed, 41) < 0.15) continue;
            // varied stack height per cell, 1..ms
            const stackH = 1 + Math.floor(hash01(cellSeed, 43) * ms);
            for (let s = 0; s < stackH; s++) {
              const id = `${z.id}-${counter}`;
              const v = pickVariant(z.category, id);
              const j = jitter(id);
              out.push({
                id,
                sku: `${v.sku}-${String(100 + counter).padStart(3, "0")}`,
                name: v.name,
                variant: v.variant,
                category: z.category,
                zone: z.id,
                area: z.area,
                qty: v.qty,
                updated: dateStr(id),
                bay: 0, level: 0,
                cluster: c, cx, cy, stack: s,
                ...j,
                shelfLabel: `P${c + 1}-${cx + 1}${cy + 1}`,
              });
              counter++;
            }
          }
        }
      }
    }
  }
  return out;
}

export const units: StorageUnit[] = buildUnits();

export const categoryOptions: Array<{ value: "all" | Category; label: string }> = [
  { value: "all", label: "All Products" },
  { value: "fan", label: "Fan Blades" },
  { value: "motor", label: "Motor Components" },
  { value: "housing", label: "Housing Parts" },
  { value: "wiring", label: "Wiring Kits" },
  { value: "misc", label: "Misc Hardware" },
];

export const variantsByCategory: Record<Category, string[]> = {
  fan: ["Wooden Blades", "Metal Blades", "Plastic Blades", "52-inch", "46-inch", "36-inch"],
  motor: ["Type-A", "Type-B", "Capacitor"],
  housing: ["Casing L", "Casing M", "Mounting Bracket"],
  wiring: ["Standard", "Premium", "Remote Module"],
  misc: ["Screw Pack", "Pull Chain", "Light Globe"],
};

export function unitMatchesVariant(u: StorageUnit, variant: string): boolean {
  if (variant === "all") return true;
  return u.variant.toLowerCase().includes(variant.toLowerCase());
}
