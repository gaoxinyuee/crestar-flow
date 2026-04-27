## Goals

1. **Calmer interaction** — drop the free orbit/zoom (it's causing motion sickness). Replace with a small set of **fixed preset camera angles** the user picks from (Isometric · Front · Top-down). No more drag-to-rotate.
2. **Zone selector dropdown** — dropdown to focus a single zone (A–E) or "Overall view" showing all 5 zones at once. When a zone is focused, the camera frames just that zone and the others fade back.
3. **More realistic, "lived-in" item placement** — items still belong to category groups, but within each zone they are scattered with imperfections: gaps between cartons, misaligned stacks, slight rotation, mixed sizes, occasional empty bays. Looks like a real warehouse, not a perfect grid.
4. **Always 3D boxes** — when filtering by product, the highlighted boxes stay as 3D cuboids (currently they look correct already; we will keep that and just make sure the dim state doesn't flatten them — keep stroke + 3D faces visible even when dimmed).

## UX changes

- Add a **View dropdown** in the existing filter bar (`src/routes/index.tsx`) with options:
  - Overall view (all zones) — default
  - Zone A — High Racking · Fan Blades
  - Zone B — High Racking · Motor Components
  - Zone C — Open Floor Stack · Housing Parts
  - Zone D — Open Floor Stack · Misc Hardware
  - Zone E — Mid Shelving · Wiring Kits
- Add a **Camera angle** segmented control (3 buttons) in the floor's HUD: `Iso` / `Front` / `Top`.
- Remove drag-to-orbit, scroll-zoom, shift-pan, double-click-reset, "Reset view" button. Replace HUD text with: "Use the View dropdown and camera angles to navigate · Click any box to inspect".

## Component changes (`src/components/WarehouseFloor.tsx`)

- New props: `focusZone: "all" | "A"…"E"`.
- Replace pointer/wheel handlers + `cam` state with:
  - `angle: "iso" | "front" | "top"` state (default `iso`)
  - Derived camera transform from a lookup table of `{pitch, yaw, scale}` per angle.
  - When `focusZone !== "all"`, compute the focused zone's bounding box from `placements` and translate the scene so that zone is centered + scaled up ~1.5x. Other zones get `opacity: 0.18` + greyscale to recede.
- Remove `useEffect` wheel listener, `dragRef`, `onPointerDown/Move/Up`, `onWheel`, `onDoubleClick`.
- Keep all rendering (racks, pallets, ladder, forklift, dispatch/receiving). Keep click-to-inspect tooltip.
- For dim state on `Cuboid`: keep current opacity but drop it less aggressively (0.35 → keep 0.55 as already implemented) and ensure all 5 cuboid faces still render (already true). No flattening to 2D anywhere.
- Camera presets:
  - `iso`:   pitch 58°, yaw -32°, scale 0.9
  - `front`: pitch 78°, yaw 0°,   scale 0.85
  - `top`:   pitch 0°,  yaw 0°,   scale 0.85

## Realism in placement (`src/lib/warehouse-data.ts`)

Update the unit generator so it no longer fills a perfect grid:

- **Rack zones**: keep level + bay structure, but introduce per-unit jitter:
  - `dx`, `dy`: small offset within bay (-4..+4 px) so cartons don't sit flush
  - `rot`: tiny rotation (-6°..+6°)
  - `sizeMul`: 0.85, 1.0, or 1.15 — vary carton width so some bays look heavier
  - Skip ~10% of bays randomly so there are visible empty shelves
  - Same category clusters together (already the case per zone), but variants within mix more freely
- **Floor-stack zones**: vary stack height per cluster more (1–4), allow misalignment between stacked levels (`dx`, `dy` jitter per stacked carton), allow some pallet cells to be empty (~15%), occasional rotation. Cartons in a single cluster can be a mix of 2 variants from that zone's category.

Add fields `dx: number; dy: number; rot: number; sizeMul: number;` to `StorageUnit` (deterministic, derived from a seeded hash of the id so layout stays stable across renders).

Render code applies these via `transform: translate(dx, dy) rotateZ(rot)` on each box wrapper, and uses `sizeMul` on `boxW`/`palletBoxW`.

## Files touched

- `src/components/WarehouseFloor.tsx` — replace orbit camera with angle presets + zone focus; apply per-unit jitter; HUD updated
- `src/lib/warehouse-data.ts` — add jitter/rotation/size fields, generate them deterministically, allow empty cells & varied stack heights
- `src/routes/index.tsx` — add View dropdown (focusZone), pass to `WarehouseFloor`; minor copy update; segmented camera control rendered inside the floor (not here)

## Out of scope

- True WebGL/Three.js (still pure CSS 3D — same look, much calmer interaction).
- Drag-to-rearrange items.
- Persisting selected zone/angle across reloads.
