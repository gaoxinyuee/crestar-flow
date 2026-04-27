export type Category = "fan" | "motor" | "housing" | "wiring" | "misc";

export interface StorageUnit {
  id: string;
  sku: string;
  name: string;
  variant: string;
  category: Category;
  zone: string;
  row: number;
  shelf: string;
  qty: number;
  updated: string;
  // grid coords (col, row) on the warehouse floor
  x: number;
  y: number;
}

export const categoryMeta: Record<Category, { label: string; color: string; tw: string }> = {
  fan: { label: "Fan Blades", color: "var(--cat-fan)", tw: "bg-cat-fan" },
  motor: { label: "Motor Components", color: "var(--cat-motor)", tw: "bg-cat-motor" },
  housing: { label: "Housing Parts", color: "var(--cat-housing)", tw: "bg-cat-housing" },
  wiring: { label: "Wiring Kits", color: "var(--cat-wiring)", tw: "bg-cat-wiring" },
  misc: { label: "Misc Hardware", color: "var(--cat-misc)", tw: "bg-cat-misc" },
};

export const fanVariants = [
  "Wooden Blades",
  "Metal Blades",
  "Plastic Blades",
  "52-inch",
  "46-inch",
  "36-inch",
];

// Build a deterministic grid of ~90 units across 6 zones (A-F)
// Layout: 3 zone rows x 2 zone cols. Each zone = 5 cols x 3 rows of units = 15 units.
const zones = ["A", "B", "C", "D", "E", "F"];

function zonePos(idx: number) {
  const zr = Math.floor(idx / 2); // 0..2
  const zc = idx % 2; // 0..1
  return { zr, zc };
}

function makeUnit(
  i: number,
  zoneIdx: number,
  cellCol: number,
  cellRow: number,
  cat: Category,
  variant: string,
  baseName: string,
  skuPrefix: string,
  qty: number,
): StorageUnit {
  const { zr, zc } = zonePos(zoneIdx);
  const x = zc * 7 + cellCol; // 5 cols + 2 gap
  const y = zr * 5 + cellRow; // 3 rows + 2 gap
  const zone = zones[zoneIdx];
  const shelf = String.fromCharCode(65 + (cellCol % 5));
  return {
    id: `${zone}-${i}`,
    sku: `${skuPrefix}-${String(100 + i).padStart(3, "0")}`,
    name: baseName,
    variant,
    category: cat,
    zone,
    row: cellRow + 1,
    shelf,
    qty,
    updated: `2025-01-${String(10 + (i % 18)).padStart(2, "0")} 0${(i % 9) + 1}:${String((i * 7) % 60).padStart(2, "0")}`,
    x,
    y,
  };
}

// Distribution plan per zone: which categories occupy which cells
// We'll create a flat list, total ~90 units (15 per zone)
const plan: Array<{
  cat: Category;
  variant: string;
  name: string;
  sku: string;
  qty: number;
}> = [];

// Fan blades: 20 units total, with variant breakdown
// 5 Wooden 52", 5 Wooden 46", 4 Metal 52", 3 Metal 46", 3 Plastic 36"
const fanList = [
  ...Array(5).fill({ variant: "Wooden Blades 52-inch", name: "Fan Blade 52\" Wooden", sku: "FB-W52", qty: 4 }),
  ...Array(5).fill({ variant: "Wooden Blades 46-inch", name: "Fan Blade 46\" Wooden", sku: "FB-W46", qty: 6 }),
  ...Array(4).fill({ variant: "Metal Blades 52-inch", name: "Fan Blade 52\" Metal", sku: "FB-M52", qty: 8 }),
  ...Array(3).fill({ variant: "Metal Blades 46-inch", name: "Fan Blade 46\" Metal", sku: "FB-M46", qty: 5 }),
  ...Array(3).fill({ variant: "Plastic Blades 36-inch", name: "Fan Blade 36\" Plastic", sku: "FB-P36", qty: 12 }),
];
fanList.forEach((f) => plan.push({ cat: "fan", ...f }));

// Motor: 18 units
for (let i = 0; i < 10; i++) plan.push({ cat: "motor", variant: "Motor Unit Type-A", name: "Motor Unit Type-A", sku: "MT-A", qty: 3 });
for (let i = 0; i < 5; i++) plan.push({ cat: "motor", variant: "Motor Unit Type-B", name: "Motor Unit Type-B", sku: "MT-B", qty: 6 });
for (let i = 0; i < 3; i++) plan.push({ cat: "motor", variant: "Motor Capacitor", name: "Motor Capacitor 4uF", sku: "MT-CAP", qty: 24 });

// Housing: 18 units
for (let i = 0; i < 8; i++) plan.push({ cat: "housing", variant: "Housing Casing L", name: "Housing Casing L", sku: "HC-L", qty: 4 });
for (let i = 0; i < 6; i++) plan.push({ cat: "housing", variant: "Housing Casing M", name: "Housing Casing M", sku: "HC-M", qty: 5 });
for (let i = 0; i < 4; i++) plan.push({ cat: "housing", variant: "Mounting Bracket", name: "Ceiling Mount Bracket", sku: "HC-MB", qty: 12 });

// Wiring: 16 units
for (let i = 0; i < 8; i++) plan.push({ cat: "wiring", variant: "Wiring Kit Standard", name: "Wiring Kit Standard", sku: "WK-S", qty: 3 });
for (let i = 0; i < 5; i++) plan.push({ cat: "wiring", variant: "Wiring Kit Premium", name: "Wiring Kit Premium", sku: "WK-P", qty: 4 });
for (let i = 0; i < 3; i++) plan.push({ cat: "wiring", variant: "Remote Control Module", name: "RF Remote Module", sku: "WK-RF", qty: 9 });

// Misc: 18 units
for (let i = 0; i < 8; i++) plan.push({ cat: "misc", variant: "Screw Pack M6", name: "Screw Pack M6 (50pc)", sku: "MS-S6", qty: 30 });
for (let i = 0; i < 6; i++) plan.push({ cat: "misc", variant: "Pull Chain", name: "Brass Pull Chain", sku: "MS-PC", qty: 14 });
for (let i = 0; i < 4; i++) plan.push({ cat: "misc", variant: "Light Globe", name: "LED Light Globe", sku: "MS-LG", qty: 8 });

// Lay out into zones, 15 per zone, 5 cols x 3 rows
export const units: StorageUnit[] = plan.slice(0, 90).map((p, i) => {
  const zoneIdx = Math.floor(i / 15);
  const within = i % 15;
  const cellCol = within % 5;
  const cellRow = Math.floor(within / 5);
  return makeUnit(i, zoneIdx, cellCol, cellRow, p.cat, p.variant, p.name, p.sku, p.qty);
});

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