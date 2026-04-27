## Goal

Turn the current 6-zone uniform racking scene into a realistic mixed-layout warehouse with **5 distinct areas** — some high-racking (ladder/forklift retrieval), some open-floor stack zones (boxes piled directly on the floor) — and make the whole 3D scene **drag-to-orbit + scroll-to-zoom** so the user can inspect from any angle.

## The 5 areas

Laid out on a single floor slab, each clearly labelled:

1. **Zone A — High Racking (Fan Blades)**
   2 tall racks, 5 levels each, ladder icon at the aisle. Holds long fan-blade cartons (Wooden / Metal / Plastic, 36–52").
2. **Zone B — High Racking (Motor Components)**
   2 tall racks, 4 levels, forklift silhouette parked at end. Motor Type-A/B + capacitors.
3. **Zone C — Open Floor Stack (Housing Parts)**
   No racks. Large casing boxes stacked 2–3 high directly on the floor in pallet-sized clusters (Casing L, Casing M, Mounting Brackets). Pallet outlines painted on floor.
4. **Zone D — Open Floor Stack (Misc Hardware)**
   Smaller cartons (Screws, Pull Chains, LED globes) stacked in tighter clusters, some 4 high.
5. **Zone E — Mid Shelving (Wiring Kits)**
   Short 2-level shelving units accessible without equipment. Standard / Premium kits + RF modules.

Receiving Bay (top edge) and Dispatch Bay (bottom edge) remain. Equipment props (ladder near A, forklift near B, pallet jack near C) added as simple cuboid silhouettes for context.

## Drag-to-inspect interaction

Replace the fixed `rotateX(58deg) rotateZ(-32deg)` transform with stateful camera angles:

- **Left-mouse drag** → orbit (updates `rotateX` pitch 25–80°, `rotateZ` yaw −180–180°)
- **Scroll wheel** → zoom (scale 0.5–1.6)
- **Shift+drag** (or middle-mouse) → pan (translate offset)
- **Double-click empty floor** → reset camera to default isometric
- **Click a box** → still opens the existing inspection tooltip (unchanged)

A small HUD bottom-left shows: "Drag to orbit · Scroll to zoom · Shift+drag to pan · Double-click to reset". Cursor changes to `grab` / `grabbing` during drag. Drag is suppressed when the click originates on a box so single-click selection still works.

All handlers are pointer-events on the scene container; no extra libraries needed.

## Data model changes (`src/lib/warehouse-data.ts`)

Extend `StorageUnit` with:
- `area: "rack-high" | "rack-mid" | "floor-stack"` — render mode
- `stack: number` — for floor-stack: how high in a pile (0 = bottom)
- `cluster: number` — for floor-stack: which pallet cluster within the zone
- `level` stays for racked items (now supports up to 5 levels)

Rebuild the unit generator into 5 zones (A–E) instead of 6, with category and area mappings above. Total unit count stays ~80–90.

## Component changes (`src/components/WarehouseFloor.tsx`)

- Add `useRef` + pointer event handlers and `useState` for `{pitch, yaw, zoom, panX, panY}`. Apply them to the scene transform.
- Replace `ZONE_LAYOUT` with 5 zone definitions including `area` and per-zone footprint (rack zones are deep×narrow, floor zones are wider squares).
- New `FloorStackCluster` helper: renders N cuboids stacked vertically + side-by-side on a painted pallet rectangle on the floor. No `RackFrame`.
- Existing `RackFrame` extended to accept `levels` (4 or 5) for high racking.
- Add small static prop cuboids for ladder (thin tall rectangle with rungs drawn as inset shadows) and forklift (low body + mast rectangle) — purely decorative.
- Highlight / dim / glow / click-to-select behavior is preserved for all rendering modes.

## Out of scope

- True WebGL / Three.js (keeping pure CSS 3D for performance and consistency with current look).
- Editing inventory by dragging boxes between locations (drag here = camera only).
- Changes to Forecast, Routes, or Assistant screens.

## Files touched

- `src/lib/warehouse-data.ts` — extend type, regenerate units across 5 mixed-layout zones
- `src/components/WarehouseFloor.tsx` — orbit camera + floor-stack rendering + equipment props + 5-zone layout
