Keep everything you already have exactly as is — the 3D warehouse digital twin, Demand Forecast, Route Optimisation, AI Assistant, current branding ("Crestar Warehouse Intelligence Suite"), navy + green palette, and Lim Wei Ming as the user. I'll only **add** three new screens from the CWIS spec: Inventory, Inbound Shipments, and Outbound Orders.

## Sidebar (final order)
Warehouse View · Demand Forecast · **Inventory** · **Inbound Shipments** · **Outbound Orders** · Route Optimisation · AI Assistant

The three new items slot in between the existing screens. All other nav items stay untouched and the active-state styling stays the same.

## New screen 1 — Inventory (`/inventory`)
A full inventory table styled to match the existing dashboard cards (white card, navy headers, green/amber/red status pills already defined in `styles.css`).

- **Columns:** Part Number · Description · Category · Zone · Bin · Qty On Hand · Reorder Point · Status · Last Updated
- **Rows:** the 15 realistic Crestar rows from the brief (FBL-042, FBL-055, FBL-038, MTR-018, MTR-024, CSG-011, CSG-019, WKT-009, WKT-014, FBL-067, FBL-071, MTR-031, CSG-027, WKT-021, FBL-049) with exact qty / reorder / status values.
- **Status pills:** ✅ Healthy (green-soft), 🟡 Low (amber-soft), 🔴 Critical (red-soft) — colour-coded pills, never plain text.
- **Hover:** rows highlight on hover.
- **Filters:** Category, Zone, Status dropdowns + a search box (filters the table client-side).
- **Buttons:** "Export to CSV" (visual only) and an amber "Scan New Item" button that opens a modal with a simulated camera viewfinder graphic and the label *"Point camera at bin QR code to log stock movement"* + Cancel button.

## New screen 2 — Inbound Shipments (`/inbound`)
Shipment schedule table + container detail panel.

- **Table columns:** Container ID · Origin · ETA · Status · SKUs · Total Units · Assigned Zone(s) · Actions
- **Rows:** CN-2024-12 (In Transit, amber pill), CN-2024-13 (Scheduled, blue pill), CN-2024-11 (Received, green pill), CN-2024-10 (Received, green pill) with the exact ETAs/units/zones from the brief.
- **View Details** on CN-2024-12 opens a right-side slide-out panel showing: container ID, supplier "Crestar China Manufacturing Partner", ETA 18 Dec 2024, status, a 5-row SKU manifest (FBL-042 → Zone A, MTR-018 → Zone C, WKT-014 → Zone E, CSG-019 → Zone D, FBL-038 → Zone B with the listed unit counts), the Sarah note, and an amber **Mark as Received** button (visual only).

## New screen 3 — Outbound Orders (`/outbound`)
Order table + weekly dispatch calendar strip.

- **Calendar strip:** Mon–Sun for the current week with a small badge per day showing how many orders dispatch that day (derived from the rows below).
- **Table columns:** Order ID · Customer · Items · Total Units · Dispatch Date · Status · Driver · Actions
- **Rows:** ORD-2294 (Bright Electrical, Picking, amber), ORD-2293 (CoolBreeze, Picking, amber), ORD-2292 (Metro HVAC, Ready, blue, James), ORD-2291 (Bright Electrical, Dispatched, green, James), ORD-2290 (Airflow Trade Centre, Dispatched, green, Marcus) — exact items/units/dates from the brief.
- **+ New Order** button top-right (visual only).

## Visual / behaviour rules across all three screens
- Same `AppLayout` shell (sidebar + top bar) so the user stays inside the suite.
- Reuse existing tokens: `bg-card`, `border-border`, `text-navy`, `text-green`, `bg-green-soft`, `bg-amber-soft`, `bg-red-soft`. No new colours added to `styles.css`.
- Status fields are always pills, never raw text.
- Tables have hover states.
- Desktop/tablet only — no mobile work.
- All data is hardcoded in the new route files; no dataset refactor of existing screens.

## Files to create
- `src/routes/inventory.tsx`
- `src/routes/inbound.tsx`
- `src/routes/outbound.tsx`

## Files to edit
- `src/components/AppLayout.tsx` — add the 3 new sidebar entries (Package, Truck, ShoppingCart icons from lucide-react). No other changes.

## Files NOT touched
- `src/components/WarehouseFloor.tsx` — 3D twin stays exactly as is.
- `src/routes/index.tsx`, `forecast.tsx`, `routes.tsx`, `assistant.tsx` — unchanged.
- `src/lib/warehouse-data.ts` — unchanged.
- `src/styles.css` — unchanged.