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

  // Rack items: bay column (0..n) + level (0..levels-1)
  bay: number;
  level: number;

  // Floor-stack items: cluster index + position within pallet (col,row) + stack height
  cluster: number;
  cx: number; // col within pallet
  cy: number; // row within pallet
  stack: number; // 0 = bottom

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
  // For racks
  rackCount?: number; // number of racks side by side
  baysPerRack?: number;
  levels?: number;
  // For floor-stack
  clusters?: number;
  palletCols?: number;
  palletRows?: number;
  maxStack?: number;
}

export const ZONES: ZoneSpec[] = [
  { id: "A", label: "High Racking — Fan Blades",     area: "rack-high",  category: "fan",     rackCount: 2, baysPerRack: 4, levels: 5 },
  { id: "B", label: "High Racking — Motor Components", area: "rack-high", category: "motor",   rackCount: 2, baysPerRack: 4, levels: 4 },
  { id: "C", label: "Open Floor Stack — Housing Parts", area: "floor-stack", category: "housing", clusters: 3, palletCols: 2, palletRows: 2, maxStack: 3 },
  { id: "D", label: "Open Floor Stack — Misc Hardware", area: "floor-stack", category: "misc", clusters: 4, palletCols: 2, palletRows: 2, maxStack: 4 },
  { id: "E", label: "Mid Shelving — Wiring Kits",     area: "rack-mid",   category: "wiring",  rackCount: 2, baysPerRack: 4, levels: 2 },
];

// Variant pools per category (cycled through to fill)
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
    { variant: "Housing Casing L", name: "Housing Casing L",    sku: "HC-L",  qty: 4 },
    { variant: "Housing Casing M", name: "Housing Casing M",    sku: "HC-M",  qty: 5 },
    { variant: "Mounting Bracket", name: "Ceiling Mount Bracket", sku: "HC-MB", qty: 12 },
  ],
  wiring: [
    { variant: "Wiring Kit Standard",     name: "Wiring Kit Standard", sku: "WK-S",  qty: 3 },
    { variant: "Wiring Kit Premium",      name: "Wiring Kit Premium",  sku: "WK-P",  qty: 4 },
    { variant: "Remote Control Module",   name: "RF Remote Module",    sku: "WK-RF", qty: 9 },
  ],
  misc: [
    { variant: "Screw Pack M6", name: "Screw Pack M6 (50pc)", sku: "MS-S6", qty: 30 },
    { variant: "Pull Chain",    name: "Brass Pull Chain",     sku: "MS-PC", qty: 14 },
    { variant: "Light Globe",   name: "LED Light Globe",      sku: "MS-LG", qty: 8 },
  ],
};

function pickVariant(cat: Category, idx: number) {
  const pool = variantPools[cat];
  return pool[idx % pool.length];
}

function dateStr(i: number): string {
  return `2025-01-${String(10 + (i % 18)).padStart(2, "0")} 0${(i % 9) + 1}:${String((i * 7) % 60).padStart(2, "0")}`;
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
            const v = pickVariant(z.category, counter);
            out.push({
              id: `${z.id}-${counter}`,
              sku: `${v.sku}-${String(100 + counter).padStart(3, "0")}`,
              name: v.name,
              variant: v.variant,
              category: z.category,
              zone: z.id,
              area: z.area,
              qty: v.qty,
              updated: dateStr(counter),
              bay: r * bays + b,
              level: l,
              cluster: 0,
              cx: 0,
              cy: 0,
              stack: 0,
              shelfLabel: `${String.fromCharCode(65 + r)}${b + 1}`,
            });
            counter++;
          }
        }
      }
    } else {
      // floor-stack
      const cls = z.clusters!;
      const pc = z.palletCols!;
      const pr = z.palletRows!;
      const ms = z.maxStack!;
      for (let c = 0; c < cls; c++) {
        for (let cy = 0; cy < pr; cy++) {
          for (let cx = 0; cx < pc; cx++) {
            // varying stack height per column position
            const stackH = ((c + cx + cy) % ms) + 1;
            for (let s = 0; s < stackH; s++) {
              const v = pickVariant(z.category, counter);
              out.push({
                id: `${z.id}-${counter}`,
                sku: `${v.sku}-${String(100 + counter).padStart(3, "0")}`,
                name: v.name,
                variant: v.variant,
                category: z.category,
                zone: z.id,
                area: z.area,
                qty: v.qty,
                updated: dateStr(counter),
                bay: 0,
                level: 0,
                cluster: c,
                cx,
                cy,
                stack: s,
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
