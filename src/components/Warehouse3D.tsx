/**
 * Warehouse3D.tsx — Three.js 3D digital twin of the Crestar Tuas warehouse.
 * Scale: 1 unit = 1 metre.  Y-up, XZ floor plane, origin at warehouse centre.
 */

import { useRef, useState, useEffect, useMemo, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import { API_BASE } from "@/lib/api";
import * as THREE from "three";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PalletSlot {
  zone: string;
  rack: string;
  level: number;
  quantity: number;
  product_id: string;
  product_name: string;
  category: string;
  low_stock: boolean;
  is_filler?: boolean;
}

export type ZoneId = "all" | "A" | "B" | "C" | "D" | "E";

interface FillerPallet {
  position: [number, number, number];
  dims: [number, number, number];
  slot: PalletSlot;
}

// ─── Product catalogue (for filler assignment) ────────────────────────────────

const PRODUCTS_BY_CATEGORY: Record<string, Array<{ product_id: string; product_name: string }>> = {
  "Fan Blades": [
    { product_id: "FB-ABS-46",  product_name: 'Fan Blade 46" ABS 5-Blade Set' },
    { product_id: "FB-WD-46",   product_name: 'Fan Blade 46" Walnut Wood 5-Blade Set' },
    { product_id: "FB-ABS-52",  product_name: 'Fan Blade 52" ABS 5-Blade Set' },
    { product_id: "FB-MTL-52",  product_name: 'Fan Blade 52" Brushed Metal 5-Blade Set' },
    { product_id: "FB-WD-52",   product_name: 'Fan Blade 52" Walnut Wood 5-Blade Set' },
  ],
  "Motors": [
    { product_id: "MT-AC-36",  product_name: "Motor 36W AC Standard" },
    { product_id: "MT-DC-45",  product_name: "Motor 45W DC Brushless" },
    { product_id: "MT-AC-55",  product_name: "Motor 55W AC High-Speed" },
    { product_id: "MT-DC-60",  product_name: "Motor 60W DC Brushless" },
  ],
  "Canopies": [
    { product_id: "CP-SLIM-W",  product_name: "Canopy Slim Profile White" },
    { product_id: "CP-STD-BK",  product_name: "Canopy Standard Matte Black" },
    { product_id: "CP-STD-W",   product_name: "Canopy Standard White" },
  ],
  "Controls": [
    { product_id: "CT-PC",    product_name: "Pull Chain Kit" },
    { product_id: "CT-RC-3",  product_name: "Remote Control 3-Speed" },
    { product_id: "CT-RC-6",  product_name: "Remote Control 6-Speed + Timer" },
    { product_id: "CT-WS-3",  product_name: "Wall Switch 3-Speed" },
  ],
  "Blade Arms": [
    { product_id: "BA-3-STD",  product_name: "Blade Arm 3-Blade Standard" },
    { product_id: "BA-5-LUX",  product_name: "Blade Arm 5-Blade Chrome Luxury" },
    { product_id: "BA-5-STD",  product_name: "Blade Arm 5-Blade Standard" },
  ],
  "Lighting": [
    { product_id: "LT-BH-E27",  product_name: "Bulb Holder E27 3-Arm" },
    { product_id: "LT-LED-18",  product_name: "LED Light Kit 18W Warm White" },
    { product_id: "LT-LED-24",  product_name: "LED Light Kit 24W Daylight" },
    { product_id: "LT-COV-FR",  product_name: "Light Cover Frosted Round" },
  ],
  "Hardware": [
    { product_id: "HW-EXT-30",  product_name: "Extension Rod 30 cm" },
    { product_id: "HW-MK-SLP",  product_name: "Mounting Kit Sloped Ceiling" },
    { product_id: "HW-MK-STD",  product_name: "Mounting Kit Standard" },
    { product_id: "HW-SCR-KT",  product_name: "Screw Kit M6 (100-pc)" },
  ],
};

// ─── Layout constants ────────────────────────────────────────────────────────

const PH = 0.7; // vertical slot spacing (m)

// Zone A – Fan Blades + Blade Arms (4 cols × 14 rows × 4 levels)
// Tighter 2 m row spacing so stock looks packed
const A_COLS   = [-22, -20, -18, -16] as const;
const A_ROWS   = [-14, -12, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 12] as const;
const A_LEVELS = 4;

// Zone B – Motors on high rack (3 rows × 12 bays × 2 sides × 5 levels)
// 12 bays at 1.5 m spacing = standard rack pitch; R01-R05 map to bay 0,2,4,6,8
const B_ROW_ZS  = [-13.0, -8.5, -4.0] as const;
const B_BAY_XS  = [-15, -13.5, -12, -10.5, -9, -7.5, -6, -4.5, -3, -1.5, 0, 1.5] as const;
const B_SIDES   = [-0.5, 0.5] as const;
const B_LEVELS  = 5;
const B_LEVEL_H = 1.8;

const B_RACK_SLOTS: Record<string, [number, number, number]> = {
  R01: [0, 0, 0], R02: [0, 2, 0], R03: [0, 4, 0],
  R04: [0, 6, 0], R05: [0, 8, 0],
};

// Zone C – Canopies + Controls on medium rack (3 rows × 12 bays × 2 sides × 3 levels)
// 12 bays at 1.5 m spacing; R01-R07 map to bay 0,2,4 in each row
const C_ROW_ZS  = [-14.5, -11.5, -8.5] as const;
const C_BAY_XS  = [3.5, 5, 6.5, 8, 9.5, 11, 12.5, 14, 15.5, 17, 18.5, 20] as const;
const C_LEVELS  = 3;
const C_LEVEL_H = 1.5;

const C_RACK_SLOTS: Record<string, [number, number, number]> = {
  R01: [0, 0, 0], R02: [0, 2, 0], R03: [0, 4, 0],
  R04: [1, 0, 0], R05: [1, 2, 0], R06: [1, 4, 0],
  R07: [2, 0, 0],
};

// Zone D – Hardware + Lighting on open floor (7 cols × 3 rows × 3 levels)
const D_COLS   = [5, 7.5, 10, 12.5, 15, 17.5, 20] as const;
const D_ROWS   = [-2.5, 0, 2.5] as const;
const D_LEVELS = 3;

// Zone E – dispatch floor grid (9 cols × 3 rows × 2 levels)
const E_COLS   = [-12, -8, -4, 0, 4, 8, 12, 16, 20] as const;
const E_ROWS   = [5.5, 7.5, 9.5] as const;
const E_LEVELS = 2;

// ─── Config ───────────────────────────────────────────────────────────────────

const ZONE_BOUNDS: Record<string, [number, number, number, number]> = {
  A: [-24, -15, -16,  16],
  B: [-15,   3, -16,   4],
  C: [  3,  22, -16,  -3],
  D: [  3,  22,  -3,   4],
  E: [-15,  23,   4,  15],
};

const ZONE_FLOOR_COLORS: Record<string, string> = {
  A: "#C4E3F5", B: "#D4F0E0", C: "#FFF3CC", D: "#FFE4CC", E: "#E8D5F5",
};

const ZONE_DISPLAY: Record<string, string> = {
  A: "Zone A · Receiving Dock",
  B: "Zone B · High Rack (5 lv)",
  C: "Zone C · Medium Rack (3 lv)",
  D: "Zone D · Open Floor / Bulk",
  E: "Zone E · Dispatch & Staging",
};

export const CATEGORY_COLORS: Record<string, string> = {
  "Fan Blades": "#FF6B35",
  "Motors":     "#4A90D9",
  "Canopies":   "#9B59B6",
  "Controls":   "#27AE60",
  "Blade Arms": "#F39C12",
  "Lighting":   "#E74C8B",
  "Hardware":   "#95A5A6",
};

export const VARIANTS_BY_CATEGORY: Record<string, string[]> = {
  "Fan Blades": ["Walnut Wood", "ABS", "Brushed Metal", '46"', '52"'],
  "Motors":     ["AC", "DC Brushless"],
  "Canopies":   ["White", "Matte Black", "Slim"],
  "Controls":   ["Remote Control", "Wall Switch", "Pull Chain"],
  "Blade Arms": ["3-Blade", "5-Blade", "Chrome"],
  "Lighting":   ["LED Kit", "Bulb Holder", "Light Cover"],
  "Hardware":   ["Mounting Kit", "Screw Kit", "Extension Rod"],
};

const ZONE_CAMERAS: Record<ZoneId, [number, number, number, number, number, number]> = {
  all: [  0, 36, 52,   0,  0,   0],
  A:   [-20, 18, 22, -20,  2,   0],
  B:   [ -6, 22, 16,  -6,  5,  -6],
  C:   [ 13, 18,  6,  13,  3,  -9],
  D:   [ 13, 14, 15,  13,  2,   1],
  E:   [  4, 14, 28,   4,  2,  10],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function seededRand(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = (Math.imul(h, 0x01000193) >>> 0);
  }
  return (h >>> 0) / 0xffffffff;
}

/**
 * Pallet dims [w, h, d] based on the product category stored on it.
 * Derived from actual product dimensions in warehouse.db — fan blades are wide
 * and flat, motors are cube-ish and heavy, controls/hardware are small, etc.
 */
const CATEGORY_DIMS: Record<string, [number, number, number]> = {
  "Fan Blades":  [1.15, 0.40, 0.95], // 120-135 cm long blades laid flat in stacks
  "Blade Arms":  [0.92, 0.36, 0.78], // 18-20 cm flat arms bundled together
  "Motors":      [0.88, 0.72, 0.88], // 22-28 cm cube motors, dense and heavy
  "Canopies":    [0.82, 0.52, 0.82], // 25-30 cm diameter disc-shaped casings
  "Controls":    [0.65, 0.46, 0.65], // 8-16 cm small electronics in cartons
  "Lighting":    [0.78, 0.50, 0.78], // 18-30 cm light kits, medium fragile
  "Hardware":    [0.88, 0.58, 0.88], // bulk bags / mounting boxes, medium
};

function getPalletDims(category: string): [number, number, number] {
  return CATEGORY_DIMS[category] ?? [0.85, 0.60, 0.85];
}

function getZoneFromPos(x: number, z: number): string {
  for (const [id, [x0, x1, z0, z1]] of Object.entries(ZONE_BOUNDS)) {
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return id;
  }
  return "?";
}

function assignProduct(category: string, seed: string): { product_id: string; product_name: string } {
  const list = PRODUCTS_BY_CATEGORY[category];
  if (!list || list.length === 0) return { product_id: "—", product_name: category };
  return list[Math.floor(seededRand(seed + "p") * list.length)];
}

// ─── Filler pallet generator ──────────────────────────────────────────────────

function generateFillers(realPallets: PalletSlot[]): FillerPallet[] {
  const occupied = new Set<string>();
  for (const p of realPallets) {
    const rn = parseInt(p.rack.replace(/\D/g, ""), 10) - 1;
    if (p.zone === "A") occupied.add(`A-${rn % A_COLS.length}-${Math.floor(rn / A_COLS.length) % A_ROWS.length}-${p.level}`);
    if (p.zone === "B") { const s = B_RACK_SLOTS[p.rack]; if (s) occupied.add(`B-${s[0]}-${s[1]}-${s[2]}-${p.level}`); }
    if (p.zone === "C") { const s = C_RACK_SLOTS[p.rack]; if (s) occupied.add(`C-${s[0]}-${s[1]}-${s[2]}-${p.level}`); }
    if (p.zone === "D") occupied.add(`D-${rn % D_COLS.length}-${Math.floor(rn / D_COLS.length) % D_ROWS.length}-${p.level}`);
    if (p.zone === "E") occupied.add(`E-${rn % E_COLS.length}-${Math.floor(rn / E_COLS.length) % E_ROWS.length}-${p.level}`);
  }

  const out: FillerPallet[] = [];
  const FILL = 0.95;

  function makeSlot(k: string, x: number, y: number, z: number, cat: string, lv: number): FillerPallet {
    const zone = getZoneFromPos(x, z);
    const prod = assignProduct(cat, k);
    const qty  = 10 + Math.floor(seededRand(k + "q") * 50);
    const dims = getPalletDims(cat); // size driven by category, not zone
    return {
      position: [x, y, z],
      dims,
      slot: {
        zone,
        rack: "—",
        level: lv,
        quantity: qty,
        product_id:   prod.product_id,
        product_name: prod.product_name,
        category:     cat,
        low_stock:    false,
        is_filler:    true,
      },
    };
  }

  const ALL_CATS = Object.keys(CATEGORY_COLORS);

  // Zone A — Fan Blades (primary) + Blade Arms, matching actual DB zone A stock
  for (let ci = 0; ci < A_COLS.length; ci++)
    for (let ri = 0; ri < A_ROWS.length; ri++)
      for (let lv = 1; lv <= A_LEVELS; lv++) {
        const k = `A-${ci}-${ri}-${lv}`;
        if (!occupied.has(k) && seededRand(k) < FILL) {
          const cat = seededRand(k + "c") < 0.65 ? "Fan Blades" : "Blade Arms";
          out.push(makeSlot(k, A_COLS[ci], (lv - 1) * PH + PH / 2, A_ROWS[ri], cat, lv));
        }
      }

  // Zone B — Motors only (matches actual DB: BR racks = Motors)
  for (let ri = 0; ri < B_ROW_ZS.length; ri++)
    for (let bi = 0; bi < B_BAY_XS.length; bi++)
      for (let si = 0; si < B_SIDES.length; si++)
        for (let lv = 1; lv <= B_LEVELS; lv++) {
          const k = `B-${ri}-${bi}-${si}-${lv}`;
          if (!occupied.has(k) && seededRand(k) < FILL)
            out.push(makeSlot(k, B_BAY_XS[bi], (lv - 1) * B_LEVEL_H + PH / 2, B_ROW_ZS[ri] + B_SIDES[si] * 0.55, "Motors", lv));
        }

  // Zone C — Canopies (40%) + Controls (60%), matching actual DB: CR racks
  for (let ri = 0; ri < C_ROW_ZS.length; ri++)
    for (let bi = 0; bi < C_BAY_XS.length; bi++)
      for (let si = 0; si < B_SIDES.length; si++)
        for (let lv = 1; lv <= C_LEVELS; lv++) {
          const k = `C-${ri}-${bi}-${si}-${lv}`;
          if (!occupied.has(k) && seededRand(k) < FILL) {
            const cat = seededRand(k + "c") < 0.60 ? "Controls" : "Canopies";
            out.push(makeSlot(k, C_BAY_XS[bi], (lv - 1) * C_LEVEL_H + PH / 2, C_ROW_ZS[ri] + B_SIDES[si] * 0.55, cat, lv));
          }
        }

  // Zone D — Hardware (55%) + Lighting (45%), matching actual DB: DR racks
  for (let ci = 0; ci < D_COLS.length; ci++)
    for (let ri = 0; ri < D_ROWS.length; ri++)
      for (let lv = 1; lv <= D_LEVELS; lv++) {
        const k = `D-${ci}-${ri}-${lv}`;
        if (!occupied.has(k) && seededRand(k) < FILL) {
          const cat = seededRand(k + "c") < 0.55 ? "Hardware" : "Lighting";
          out.push(makeSlot(k, D_COLS[ci], (lv - 1) * PH + PH / 2, D_ROWS[ri], cat, lv));
        }
      }

  // Zone E — dispatch: all categories (mixed outbound)
  for (let ci = 0; ci < E_COLS.length; ci++)
    for (let ri = 0; ri < E_ROWS.length; ri++)
      for (let lv = 1; lv <= E_LEVELS; lv++) {
        const k = `E-${ci}-${ri}-${lv}`;
        if (!occupied.has(k) && seededRand(k) < FILL) {
          const cat = ALL_CATS[Math.floor(seededRand(k + "c") * ALL_CATS.length)] ?? "Hardware";
          out.push(makeSlot(k, E_COLS[ci], (lv - 1) * PH + PH / 2, E_ROWS[ri], cat, lv));
        }
      }

  return out;
}

// ─── Real pallet position calculator ─────────────────────────────────────────

function getPalletPos(zone: string, rack: string, level: number): [number, number, number] {
  const rn = parseInt(rack.replace(/\D/g, ""), 10) - 1;
  if (zone === "A") {
    return [A_COLS[rn % A_COLS.length], (level - 1) * PH + PH / 2, A_ROWS[Math.floor(rn / A_COLS.length) % A_ROWS.length]];
  }
  if (zone === "B") {
    const s = B_RACK_SLOTS[rack];
    if (!s) return [B_BAY_XS[0], (level - 1) * B_LEVEL_H + PH / 2, B_ROW_ZS[0]];
    return [B_BAY_XS[s[1]], (level - 1) * B_LEVEL_H + PH / 2, B_ROW_ZS[s[0]] + B_SIDES[s[2]] * 0.55];
  }
  if (zone === "C") {
    const s = C_RACK_SLOTS[rack];
    if (!s) return [C_BAY_XS[0], (level - 1) * C_LEVEL_H + PH / 2, C_ROW_ZS[0]];
    return [C_BAY_XS[s[1]], (level - 1) * C_LEVEL_H + PH / 2, C_ROW_ZS[s[0]] + B_SIDES[s[2]] * 0.55];
  }
  if (zone === "D") {
    return [D_COLS[rn % D_COLS.length], (level - 1) * PH + PH / 2, D_ROWS[Math.floor(rn / D_COLS.length) % D_ROWS.length]];
  }
  // Zone E
  return [E_COLS[rn % E_COLS.length], (level - 1) * PH + PH / 2, E_ROWS[Math.floor(rn / E_COLS.length) % E_ROWS.length]];
}

// ─── Zone floor + label ───────────────────────────────────────────────────────

function ZoneFloor({ id }: { id: string }) {
  const [x0, x1, z0, z1] = ZONE_BOUNDS[id];
  const w = x1 - x0, d = z1 - z0;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  return (
    <group>
      <mesh position={[cx, 0.01, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w - 0.08, d - 0.08]} />
        <meshStandardMaterial color={ZONE_FLOOR_COLORS[id]} transparent opacity={0.65} roughness={0.9} />
      </mesh>
      <Text position={[cx, 0.05, cz + d / 2 - 1.8]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.85}
        color="#1a1a2e" fontWeight="bold" anchorX="center" anchorY="middle" maxWidth={w - 1}>
        {ZONE_DISPLAY[id]}
      </Text>
    </group>
  );
}

// ─── Rack row ─────────────────────────────────────────────────────────────────

function RackRow({ x0, x1, z, levels, levelH, nBays: nBaysProp }: { x0: number; x1: number; z: number; levels: number; levelH: number; nBays?: number }) {
  const width  = x1 - x0;
  const cx     = (x0 + x1) / 2;
  const totalH = levels * levelH;
  const nBays  = nBaysProp ?? Math.round(width / 2.0);
  const uprightXs = Array.from({ length: nBays + 1 }, (_, i) => x0 + (i / nBays) * width);
  const beamYs    = Array.from({ length: levels + 1 }, (_, i) => i * levelH);

  return (
    <group>
      {uprightXs.map((ux, i) => (
        <group key={i}>
          {([-0.5, 0.5] as const).map((dz) => (
            <mesh key={dz} position={[ux, totalH / 2, z + dz]} castShadow>
              <boxGeometry args={[0.07, totalH, 0.07]} />
              <meshStandardMaterial color="#6E7B8B" metalness={0.7} roughness={0.3} />
            </mesh>
          ))}
        </group>
      ))}
      {beamYs.map((by, i) => (
        <group key={i}>
          {([-0.5, 0.5] as const).map((dz) => (
            <mesh key={dz} position={[cx, by, z + dz]}>
              <boxGeometry args={[width, 0.07, 0.05]} />
              <meshStandardMaterial color="#E8680A" roughness={0.4} />
            </mesh>
          ))}
          <mesh position={[cx, by, z]}>
            <boxGeometry args={[width, 0.04, 1.0]} />
            <meshStandardMaterial color="#B05010" roughness={0.5} transparent opacity={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ─── Pallet box (both real DB pallets and assigned filler pallets) ────────────

function PalletBox({ position, dims, category, highlighted, dimmed, lowStock, slot, onSelect }: {
  position: [number, number, number];
  dims: [number, number, number];
  category: string;
  highlighted: boolean;
  dimmed: boolean;
  lowStock: boolean;
  slot: PalletSlot;
  onSelect: (slot: PalletSlot) => void;
}) {
  const meshRef  = useRef<THREE.Mesh>(null);
  const color    = CATEGORY_COLORS[category] ?? "#888888";
  const emissive = useMemo(() => new THREE.Color(color), [color]);
  const [w, h, d] = dims; // already category-derived by caller

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = highlighted ? 0.35 + 0.35 * Math.sin(clock.elapsedTime * 4) : 0;
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      castShadow
      receiveShadow
      onClick={(e) => { e.stopPropagation(); onSelect(slot); }}
      onPointerEnter={() => { document.body.style.cursor = "pointer"; }}
      onPointerLeave={() => { document.body.style.cursor = "auto"; }}
    >
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0}
        transparent opacity={dimmed ? 0.07 : 1} depthWrite={!dimmed} roughness={0.55} metalness={0.08} />
      <mesh position={[0, -(h / 2) - 0.03, 0]}>
        <boxGeometry args={[w + 0.02, 0.06, d + 0.02]} />
        <meshStandardMaterial color="#C8A96E" roughness={0.8} transparent opacity={dimmed ? 0.07 : 1} depthWrite={!dimmed} />
      </mesh>
      {lowStock && !dimmed && (
        <mesh position={[0, h / 2 + 0.12, 0]}>
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshStandardMaterial color="#FF2020" emissive="#FF2020" emissiveIntensity={1.5} />
        </mesh>
      )}
    </mesh>
  );
}

// ─── Dock door ────────────────────────────────────────────────────────────────

function DockDoor({ z }: { z: number }) {
  return (
    <group position={[-24, 0, z]}>
      {[[-1.4, 0], [1.4, 0]].map(([lz, _], i) => (
        <mesh key={i} position={[-0.1, 1.6, lz]}>
          <boxGeometry args={[0.25, 3.2, 0.28]} />
          <meshStandardMaterial color="#8A9BA8" metalness={0.6} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[-0.1, 3.3, 0]}>
        <boxGeometry args={[0.25, 0.28, 2.9]} />
        <meshStandardMaterial color="#8A9BA8" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[-0.05, 1.5, 0]}>
        <boxGeometry args={[0.08, 3.0, 2.5]} />
        <meshStandardMaterial color="#2C3E50" roughness={0.5} />
      </mesh>
      <mesh position={[-0.05, 0.2, 0]}>
        <boxGeometry args={[0.22, 0.4, 2.6]} />
        <meshStandardMaterial color="#F1C40F" roughness={0.4} />
      </mesh>
      {[-0.8, -0.26, 0.26, 0.8].map((sz, i) => (
        <mesh key={i} position={[-0.14, 0.2, sz]}>
          <boxGeometry args={[0.24, 0.42, 0.12]} />
          <meshStandardMaterial color="#1A1A1A" />
        </mesh>
      ))}
    </group>
  );
}

// ─── Conveyor belt ────────────────────────────────────────────────────────────

function ConveyorBelt({ x0, x1, z }: { x0: number; x1: number; z: number }) {
  const length   = x1 - x0;
  const cx       = (x0 + x1) / 2;
  const nRollers = Math.floor(length * 0.9);
  const rollers  = useRef<THREE.Mesh[]>([]);

  useFrame((_, delta) => {
    rollers.current.forEach((r) => { if (r) r.rotation.z += delta * 2.5; });
  });

  return (
    <group position={[cx, 0.38, z]}>
      <mesh>
        <boxGeometry args={[length, 0.08, 1.2]} />
        <meshStandardMaterial color="#2C2C2C" roughness={0.85} />
      </mesh>
      {([-0.65, 0.65] as const).map((dz) => (
        <mesh key={dz} position={[0, 0.1, dz]}>
          <boxGeometry args={[length, 0.2, 0.07]} />
          <meshStandardMaterial color="#5A6E7A" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
      {Array.from({ length: nRollers }, (_, i) => (
        <mesh key={i}
          position={[-length / 2 + (i + 0.5) * (length / nRollers), -0.02, 0]}
          ref={(el) => { if (el) rollers.current[i] = el; }}>
          <cylinderGeometry args={[0.1, 0.1, 1.22, 10]} />
          <meshStandardMaterial color="#7A8A95" metalness={0.8} roughness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Outer shell ──────────────────────────────────────────────────────────────

function WarehouseShell() {
  const H = 11, T = 0.35;
  const mat = { color: "#C8C4BC" as const, transparent: true as const, opacity: 0.22, roughness: 0.9 };
  return (
    <>
      <mesh position={[0, H / 2, -16.5]}><boxGeometry args={[49, H, T]} /><meshStandardMaterial {...mat} /></mesh>
      <mesh position={[0, H / 2,  16.5]}><boxGeometry args={[49, H, T]} /><meshStandardMaterial {...mat} /></mesh>
      <mesh position={[24.5, H / 2, 0]}><boxGeometry args={[T, H, 34]} /><meshStandardMaterial {...mat} /></mesh>
      <mesh position={[-24.5, H / 2, 0]}><boxGeometry args={[T, H, 34]} /><meshStandardMaterial {...mat} /></mesh>
    </>
  );
}

// ─── Camera controller ────────────────────────────────────────────────────────

function CameraController({ zone }: { zone: ZoneId }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orbitRef   = useRef<any>(null);
  const animating  = useRef(false);
  const camTarget  = useRef(new THREE.Vector3(0, 36, 52));
  const lookTarget = useRef(new THREE.Vector3(0, 0, 0));
  const prevZone   = useRef<ZoneId>("all");

  useEffect(() => {
    if (zone === prevZone.current) return;
    prevZone.current = zone;
    const [cx, cy, cz, lx, ly, lz] = ZONE_CAMERAS[zone];
    camTarget.current.set(cx, cy, cz);
    lookTarget.current.set(lx, ly, lz);
    animating.current = true;
  }, [zone]);

  useFrame((state) => {
    if (!animating.current) return;
    state.camera.position.lerp(camTarget.current, 0.07);
    if (orbitRef.current) {
      (orbitRef.current.target as THREE.Vector3).lerp(lookTarget.current, 0.07);
      orbitRef.current.update();
    }
    if (state.camera.position.distanceTo(camTarget.current) < 0.12) {
      animating.current = false;
      state.camera.position.copy(camTarget.current);
      if (orbitRef.current) {
        orbitRef.current.target.copy(lookTarget.current);
        orbitRef.current.update();
      }
    }
  });

  return (
    <OrbitControls ref={orbitRef} makeDefault enableDamping dampingFactor={0.06}
      minDistance={4} maxDistance={95} maxPolarAngle={Math.PI / 2.1} />
  );
}

// ─── Full scene ───────────────────────────────────────────────────────────────

function WarehouseScene({ pallets, fillerPallets, selectedZone, filterCategory, filterVariant, onSelectPallet }: {
  pallets: PalletSlot[];
  fillerPallets: FillerPallet[];
  selectedZone: ZoneId;
  filterCategory: string;
  filterVariant: string;
  onSelectPallet: (slot: PalletSlot) => void;
}) {
  const hasFilter  = filterCategory !== "all";
  const hasVariant = hasFilter && filterVariant !== "all";

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[20, 35, 15]} intensity={1.1} castShadow
        shadow-mapSize={[2048, 2048]} shadow-camera-near={1} shadow-camera-far={120}
        shadow-camera-left={-30} shadow-camera-right={30}
        shadow-camera-top={25} shadow-camera-bottom={-25} />
      <pointLight position={[-18, 9, 0]} intensity={0.7} color="#fff8f0" distance={30} />
      <pointLight position={[  3, 9,-7]} intensity={0.7} color="#fff8f0" distance={30} />
      <pointLight position={[ 16, 9, 8]} intensity={0.7} color="#fff8f0" distance={30} />

      <CameraController zone={selectedZone} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[50, 35]} />
        <meshStandardMaterial color="#D0CEC6" roughness={0.92} />
      </mesh>

      <WarehouseShell />

      <Suspense fallback={null}>
        {(["A", "B", "C", "D", "E"] as const).map((id) => <ZoneFloor key={id} id={id} />)}
      </Suspense>

      {/* Zone B high racks — 12 bays at 1.5 m pitch */}
      <RackRow x0={-15} x1={3} z={-13.0} levels={5} levelH={1.8} nBays={12} />
      <RackRow x0={-15} x1={3} z={ -8.5} levels={5} levelH={1.8} nBays={12} />
      <RackRow x0={-15} x1={3} z={ -4.0} levels={5} levelH={1.8} nBays={12} />
      {/* Zone C medium racks — 12 bays at 1.5 m pitch */}
      <RackRow x0={3} x1={22} z={-14.5} levels={3} levelH={1.5} nBays={12} />
      <RackRow x0={3} x1={22} z={-11.5} levels={3} levelH={1.5} nBays={12} />
      <RackRow x0={3} x1={22} z={ -8.5} levels={3} levelH={1.5} nBays={12} />

      {[-11, -5, 1, 7].map((z) => <DockDoor key={z} z={z} />)}

      <ConveyorBelt x0={-14} x1={22} z={12.5} />

      {/* Filler pallets — assigned product data, fully clickable */}
      {fillerPallets.map((f, i) => {
        if (selectedZone !== "all") {
          const [x0, x1, z0, z1] = ZONE_BOUNDS[selectedZone];
          const [fx, , fz] = f.position;
          if (fx < x0 || fx > x1 || fz < z0 || fz > z1) return null;
        }
        const matchesCategory = f.slot.category === filterCategory;
        const matchesVariant  = !hasVariant || f.slot.product_name.toLowerCase().includes(filterVariant.toLowerCase());
        const highlighted = hasFilter && matchesCategory && matchesVariant;
        const dimmed      = hasFilter && !(matchesCategory && matchesVariant);
        return (
          <PalletBox key={`f${i}`} position={f.position} dims={getPalletDims(f.slot.category)}
            category={f.slot.category} slot={f.slot} highlighted={highlighted} dimmed={dimmed}
            lowStock={false} onSelect={onSelectPallet} />
        );
      })}

      {/* Real DB-backed pallets */}
      {pallets.map((p, i) => {
        if (selectedZone !== "all" && p.zone !== selectedZone) return null;
        const pos  = getPalletPos(p.zone, p.rack, p.level);
        const dims = getPalletDims(p.category);
        const matchesCategory = p.category === filterCategory;
        const matchesVariant  = !hasVariant || p.product_name.toLowerCase().includes(filterVariant.toLowerCase());
        const highlighted = hasFilter && matchesCategory && matchesVariant;
        const dimmed      = hasFilter && !(matchesCategory && matchesVariant);
        return (
          <PalletBox key={i} position={pos} dims={dims} category={p.category} slot={p}
            highlighted={highlighted} dimmed={dimmed} lowStock={p.low_stock}
            onSelect={onSelectPallet} />
        );
      })}
    </>
  );
}

// ─── Pallet info panel ────────────────────────────────────────────────────────

function PalletInfoPanel({ pallet, onClose }: { pallet: PalletSlot; onClose: () => void }) {
  const color = CATEGORY_COLORS[pallet.category] ?? "#888888";
  return (
    <div className="absolute bottom-4 right-4 bg-card border border-border rounded-xl shadow-xl p-4 w-64 z-20 pointer-events-auto select-none">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm shrink-0" style={{ background: color }} />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {pallet.category}
          </span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none -mt-0.5">×</button>
      </div>

      <h3 className="font-bold text-sm leading-snug mb-1.5">{pallet.product_name}</h3>
      <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
        {pallet.product_id}
      </code>

      <div className="mt-3 space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Zone</span>
          <span className="font-mono font-medium">Zone {pallet.zone}</span>
        </div>
        {!pallet.is_filler && (
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Location</span>
            <span className="font-mono font-medium">{pallet.rack} · Level {pallet.level}</span>
          </div>
        )}
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Qty on pallet</span>
          <span className="font-semibold">
            {pallet.quantity} units
            {pallet.is_filler && <span className="text-muted-foreground font-normal"> (est.)</span>}
          </span>
        </div>
      </div>

      {pallet.low_stock && (
        <div className="flex items-center gap-1.5 mt-3 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse shrink-0" />
          <span className="text-xs text-red-700 font-medium">Low stock alert</span>
        </div>
      )}
    </div>
  );
}

// ─── Data hook ────────────────────────────────────────────────────────────────

function useWarehouseData() {
  const [pallets, setPallets] = useState<PalletSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/warehouse/3d`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => { setPallets(d.pallets ?? []); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, []);

  return { pallets, loading, error };
}

// ─── Public components ────────────────────────────────────────────────────────

export function CategoryLegend() {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(CATEGORY_COLORS).map(([cat, col]) => (
        <div key={cat} className="flex items-center gap-1 text-[10px]">
          <span className="inline-block h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: col }} />
          <span className="text-muted-foreground">{cat}</span>
        </div>
      ))}
      <div className="flex items-center gap-1 text-[10px]">
        <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0 bg-red-500" />
        <span className="text-muted-foreground">Low stock</span>
      </div>
    </div>
  );
}

export default function Warehouse3D({ selectedZone, filterCategory, filterVariant }: {
  selectedZone: ZoneId;
  filterCategory: string;
  filterVariant: string;
}) {
  const { pallets, loading, error } = useWarehouseData();
  const fillerPallets = useMemo(() => generateFillers(pallets), [pallets]);
  const [selectedPallet, setSelectedPallet] = useState<PalletSlot | null>(null);

  if (loading) return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Loading warehouse data…
    </div>
  );
  if (error) return (
    <div className="flex h-full items-center justify-center text-sm text-red-600 gap-2">
      Could not load 3D data — is the FastAPI server running?
      <code className="text-xs bg-muted px-1 rounded">{error}</code>
    </div>
  );

  return (
    <div className="relative w-full h-full">
      <Canvas
        shadows
        camera={{ position: [0, 36, 52], fov: 50, near: 0.5, far: 200 }}
        className="w-full h-full"
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        style={{ background: "linear-gradient(to bottom, #1a2030 0%, #2a3550 100%)" }}
        onPointerMissed={() => setSelectedPallet(null)}
      >
        <WarehouseScene
          pallets={pallets}
          fillerPallets={fillerPallets}
          selectedZone={selectedZone}
          filterCategory={filterCategory}
          filterVariant={filterVariant}
          onSelectPallet={setSelectedPallet}
        />
      </Canvas>

      {selectedPallet && (
        <PalletInfoPanel pallet={selectedPallet} onClose={() => setSelectedPallet(null)} />
      )}
    </div>
  );
}
