#!/usr/bin/env python3
"""
create_db.py
Creates and seeds warehouse.db for the Crestar Warehouse Intelligence Suite.

Run:  python create_db.py
"""

import sqlite3
import os
import hashlib
from datetime import date, timedelta, datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "warehouse.db")
TODAY   = date(2026, 5, 4)   # fixed reference date for reproducible demo data


# ─── Helpers ───────────────────────────────────────────────────────────────────

def ts(offset_days: int = 0, hour: int = 9, minute: int = 0) -> str:
    """ISO datetime string offset from TODAY."""
    d = TODAY + timedelta(days=offset_days)
    return datetime(d.year, d.month, d.day, hour, minute).strftime("%Y-%m-%d %H:%M")


def ds(offset_days: int) -> str:
    """ISO date string offset from TODAY."""
    return (TODAY + timedelta(days=offset_days)).isoformat()


def _jitter(key: str, month: int, year: int) -> float:
    """Deterministic pseudo-random factor in [0.85, 1.15], no random seed needed."""
    h = int(hashlib.md5(f"{key}|{month}|{year}".encode()).hexdigest()[:8], 16)
    return 0.85 + (h % 301) / 1000.0


# ─── Schema ────────────────────────────────────────────────────────────────────

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
    product_id      TEXT    PRIMARY KEY,
    name            TEXT    NOT NULL,
    category        TEXT    NOT NULL,
    length_cm       REAL    NOT NULL,
    width_cm        REAL    NOT NULL,
    height_cm       REAL    NOT NULL,
    weight_kg       REAL    NOT NULL,
    reorder_point   INTEGER NOT NULL,
    unit_cost_sgd   REAL    NOT NULL,
    supplier        TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS zones (
    zone_id             TEXT    PRIMARY KEY,
    name                TEXT    NOT NULL,
    zone_type           TEXT    NOT NULL,
    length_m            REAL    NOT NULL,
    width_m             REAL    NOT NULL,
    height_m            REAL    NOT NULL,
    max_pallet_height_m REAL    NOT NULL,
    capacity_slots      INTEGER NOT NULL,
    current_occupancy   INTEGER NOT NULL DEFAULT 0,
    primary_category    TEXT
);

CREATE TABLE IF NOT EXISTS inventory (
    slot_id         TEXT    PRIMARY KEY,
    zone            TEXT    NOT NULL REFERENCES zones(zone_id),
    rack            TEXT    NOT NULL,
    level           INTEGER NOT NULL,
    product_id      TEXT    NOT NULL REFERENCES products(product_id),
    quantity        INTEGER NOT NULL DEFAULT 0,
    last_updated    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS inbound_shipments (
    shipment_id     TEXT    PRIMARY KEY,
    supplier        TEXT    NOT NULL,
    expected_date   TEXT    NOT NULL,
    received_date   TEXT,
    status          TEXT    NOT NULL,
    total_cartons   INTEGER NOT NULL,
    total_weight_kg REAL    NOT NULL,
    notes           TEXT
);

CREATE TABLE IF NOT EXISTS inbound_shipment_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id     TEXT    NOT NULL REFERENCES inbound_shipments(shipment_id),
    product_id      TEXT    NOT NULL REFERENCES products(product_id),
    quantity        INTEGER NOT NULL,
    cartons         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS outbound_orders (
    order_id         TEXT    PRIMARY KEY,
    customer         TEXT    NOT NULL,
    customer_type    TEXT    NOT NULL,
    order_date       TEXT    NOT NULL,
    delivery_date    TEXT,
    status           TEXT    NOT NULL,
    delivery_address TEXT,
    notes            TEXT
);

CREATE TABLE IF NOT EXISTS outbound_order_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id        TEXT    NOT NULL REFERENCES outbound_orders(order_id),
    product_id      TEXT    NOT NULL REFERENCES products(product_id),
    quantity        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS po_history (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id        TEXT    NOT NULL REFERENCES products(product_id),
    month             INTEGER NOT NULL,
    year              INTEGER NOT NULL,
    quantity_ordered  INTEGER NOT NULL,
    quantity_received INTEGER NOT NULL,
    unit_cost_sgd     REAL    NOT NULL,
    supplier          TEXT    NOT NULL,
    UNIQUE(product_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_inv_product  ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_zone     ON inventory(zone);
CREATE INDEX IF NOT EXISTS idx_po_product   ON po_history(product_id);
CREATE INDEX IF NOT EXISTS idx_po_period    ON po_history(year, month);
"""


# ─── Products (27 SKUs across 7 categories) ────────────────────────────────────
# Columns: product_id, name, category, length_cm, width_cm, height_cm,
#          weight_kg, reorder_point, unit_cost_sgd, supplier

PRODUCTS = [
    # ── Fan Blades (5) ────────────────────────────────────────────────────────
    ("FB-ABS-52", 'Fan Blade 52" ABS 5-Blade Set',       "Fan Blades",  135.0, 15.0,  2.0,  1.2,  50,  42.00, "SinoFan Industrial Co."),
    ("FB-ABS-46", 'Fan Blade 46" ABS 5-Blade Set',       "Fan Blades",  120.0, 14.0,  2.0,  1.0,  40,  38.00, "SinoFan Industrial Co."),
    ("FB-WD-52",  'Fan Blade 52" Walnut Wood 5-Blade Set',"Fan Blades",  135.0, 15.0,  3.5,  2.5,  30,  78.00, "Sarawak Timber Works"),
    ("FB-WD-46",  'Fan Blade 46" Walnut Wood 5-Blade Set',"Fan Blades",  120.0, 14.0,  3.5,  2.2,  25,  68.00, "Sarawak Timber Works"),
    ("FB-MTL-52", 'Fan Blade 52" Brushed Metal 5-Blade Set',"Fan Blades",135.0, 12.0,  0.8,  3.5,  20,  58.00, "SinoFan Industrial Co."),
    # ── Motors (4) ────────────────────────────────────────────────────────────
    ("MT-DC-45",  "Motor 45W DC Brushless",               "Motors",       25.0, 25.0, 18.0,  3.2,  40, 185.00, "Malaysia Parts Hub"),
    ("MT-DC-60",  "Motor 60W DC Brushless",               "Motors",       28.0, 28.0, 20.0,  4.1,  30, 235.00, "Malaysia Parts Hub"),
    ("MT-AC-36",  "Motor 36W AC Standard",                "Motors",       22.0, 22.0, 16.0,  2.8,  50, 118.00, "Malaysia Parts Hub"),
    ("MT-AC-55",  "Motor 55W AC High-Speed",              "Motors",       26.0, 26.0, 19.0,  3.6,  25, 155.00, "Malaysia Parts Hub"),
    # ── Canopies (3) ──────────────────────────────────────────────────────────
    ("CP-STD-W",  "Canopy Standard White",                "Canopies",     30.0, 30.0, 12.0,  1.5,  30,  32.00, "SinoFan Industrial Co."),
    ("CP-STD-BK", "Canopy Standard Matte Black",          "Canopies",     30.0, 30.0, 12.0,  1.5,  25,  34.00, "SinoFan Industrial Co."),
    ("CP-SLIM-W", "Canopy Slim Profile White",            "Canopies",     25.0, 25.0,  8.0,  1.0,  20,  28.00, "SinoFan Industrial Co."),
    # ── Controls (4) ──────────────────────────────────────────────────────────
    ("CT-RC-3",   "Remote Control 3-Speed",               "Controls",     15.0,  6.0,  3.0,  0.2,  60,  22.00, "Elektro SG Pte Ltd"),
    ("CT-RC-6",   "Remote Control 6-Speed + Timer",       "Controls",     16.0,  7.0,  3.0,  0.3,  40,  38.00, "Elektro SG Pte Ltd"),
    ("CT-WS-3",   "Wall Switch 3-Speed",                  "Controls",     10.0,  8.0,  4.0,  0.3,  50,  18.00, "Elektro SG Pte Ltd"),
    ("CT-PC",     "Pull Chain Kit",                       "Controls",      8.0,  3.0,  3.0,  0.1, 100,   5.50, "Elektro SG Pte Ltd"),
    # ── Blade Arms (3) ────────────────────────────────────────────────────────
    ("BA-5-STD",  "Blade Arm 5-Blade Standard",           "Blade Arms",   20.0,  8.0,  3.0,  0.4,  60,  12.00, "SinoFan Industrial Co."),
    ("BA-5-LUX",  "Blade Arm 5-Blade Chrome Luxury",      "Blade Arms",   20.0,  8.0,  3.0,  0.6,  30,  22.00, "SinoFan Industrial Co."),
    ("BA-3-STD",  "Blade Arm 3-Blade Standard",           "Blade Arms",   18.0,  7.0,  3.0,  0.3,  40,   9.50, "SinoFan Industrial Co."),
    # ── Lighting (4) ──────────────────────────────────────────────────────────
    ("LT-LED-18", "LED Light Kit 18W Warm White",         "Lighting",     20.0, 20.0, 10.0,  0.8,  40,  52.00, "LightTech Asia"),
    ("LT-LED-24", "LED Light Kit 24W Daylight",           "Lighting",     22.0, 22.0, 12.0,  1.0,  30,  68.00, "LightTech Asia"),
    ("LT-BH-E27", "Bulb Holder E27 3-Arm",               "Lighting",     18.0, 18.0,  8.0,  0.5,  50,  28.00, "LightTech Asia"),
    ("LT-COV-FR", "Light Cover Frosted Round",            "Lighting",     30.0, 30.0,  8.0,  0.7,  35,  24.00, "LightTech Asia"),
    # ── Hardware (4) ──────────────────────────────────────────────────────────
    ("HW-MK-STD", "Mounting Kit Standard",                "Hardware",     15.0, 12.0,  8.0,  1.8,  80,  18.00, "Bolt & Bracket SG"),
    ("HW-MK-SLP", "Mounting Kit Sloped Ceiling",          "Hardware",     18.0, 14.0, 10.0,  2.2,  40,  28.00, "Bolt & Bracket SG"),
    ("HW-SCR-KT", "Screw Kit M6 (100-pc)",               "Hardware",     10.0,  8.0,  5.0,  0.5, 150,   7.80, "Bolt & Bracket SG"),
    ("HW-EXT-30", "Extension Rod 30 cm",                  "Hardware",      5.0,  5.0, 32.0,  0.8,  60,  16.00, "Bolt & Bracket SG"),
]


# ─── Zones (A–E) ───────────────────────────────────────────────────────────────
# Columns: zone_id, name, zone_type, length_m, width_m, height_m,
#          max_pallet_height_m, capacity_slots, current_occupancy, primary_category

ZONES = [
    ("A", "Zone A — Fan Blades & Blade Arms", "Rack Storage", 36.0, 12.0, 6.0, 2.8, 24, 0, "Fan Blades, Blade Arms"),
    ("B", "Zone B — Motors",                  "Rack Storage", 20.0, 10.0, 6.0, 2.5, 12, 0, "Motors"),
    ("C", "Zone C — Canopies & Controls",     "Rack Storage", 18.0, 10.0, 5.0, 2.5, 16, 0, "Canopies, Controls"),
    ("D", "Zone D — Lighting & Hardware",     "Rack Storage", 18.0, 12.0, 5.0, 2.0, 22, 0, "Lighting, Hardware"),
    ("E", "Zone E — Staging & Overflow",      "Open Storage", 15.0, 22.0, 4.0, 3.0,  8, 0, "Mixed / Overflow"),
]
# Totals: capacity 82 slots; 65 occupied → 79.3% occupancy


# ─── Inventory (65 slots) ──────────────────────────────────────────────────────
# Columns: slot_id, zone, rack, level, product_id, quantity, last_updated
# NOTE: 5 products are deliberately below their reorder_point (marked ← ALERT)

INVENTORY = [
    # ── Zone A — Fan Blades ───────────────────────────────────────────────────
    ("A-R01-1", "A", "R01", 1, "FB-ABS-52",  120, ts(-3,  8, 30)),
    ("A-R01-2", "A", "R01", 2, "FB-ABS-52",   85, ts(-3,  8, 45)),
    ("A-R02-1", "A", "R02", 1, "FB-ABS-52",   45, ts(-10, 9,  0)),
    ("A-R02-2", "A", "R02", 2, "FB-ABS-46",   90, ts(-5, 10,  0)),
    ("A-R03-1", "A", "R03", 1, "FB-ABS-46",   60, ts(-5, 10, 15)),
    ("A-R03-2", "A", "R03", 2, "FB-ABS-46",   45, ts(-8,  9,  0)),
    ("A-R04-1", "A", "R04", 1, "FB-WD-52",    18, ts(-1, 14,  0)),   # ← ALERT: total 18 < reorder 30
    ("A-R04-2", "A", "R04", 2, "FB-WD-46",    45, ts(-6,  9,  0)),
    ("A-R04-3", "A", "R04", 3, "FB-WD-46",    28, ts(-6,  9, 30)),
    ("A-R05-1", "A", "R05", 1, "FB-MTL-52",   45, ts(-12, 9,  0)),
    ("A-R05-2", "A", "R05", 2, "FB-MTL-52",   28, ts(-12, 9, 15)),
    # ── Zone A — Blade Arms ───────────────────────────────────────────────────
    ("A-R06-1", "A", "R06", 1, "BA-5-STD",   180, ts(-2,  8,  0)),
    ("A-R06-2", "A", "R06", 2, "BA-5-STD",   140, ts(-2,  8, 15)),
    ("A-R06-3", "A", "R06", 3, "BA-5-STD",    80, ts(-7,  9,  0)),
    ("A-R07-1", "A", "R07", 1, "BA-5-LUX",    75, ts(-9,  9,  0)),
    ("A-R07-2", "A", "R07", 2, "BA-5-LUX",    45, ts(-9,  9, 30)),
    ("A-R08-1", "A", "R08", 1, "BA-3-STD",    95, ts(-4,  9,  0)),
    ("A-R08-2", "A", "R08", 2, "BA-3-STD",    60, ts(-4,  9, 15)),
    ("A-R09-1", "A", "R09", 1, "FB-ABS-46",   35, ts(-15, 9,  0)),  # overflow bay
    # ── Zone B — Motors ───────────────────────────────────────────────────────
    ("B-R01-1", "B", "R01", 1, "MT-DC-45",    55, ts(-7,  8,  0)),
    ("B-R01-2", "B", "R01", 2, "MT-DC-45",    40, ts(-7,  8, 30)),
    ("B-R02-1", "B", "R02", 1, "MT-DC-45",    30, ts(-14, 9,  0)),
    ("B-R02-2", "B", "R02", 2, "MT-DC-60",    12, ts(-2, 15,  0)),   # ← ALERT: total 12 < reorder 30
    ("B-R03-1", "B", "R03", 1, "MT-AC-36",    65, ts(-5,  9,  0)),
    ("B-R03-2", "B", "R03", 2, "MT-AC-36",    50, ts(-5,  9, 30)),
    ("B-R04-1", "B", "R04", 1, "MT-AC-36",    35, ts(-11, 9,  0)),
    ("B-R04-2", "B", "R04", 2, "MT-AC-55",    42, ts(-8,  9,  0)),
    ("B-R05-1", "B", "R05", 1, "MT-AC-55",    28, ts(-8,  9, 30)),
    ("B-R05-2", "B", "R05", 2, "MT-DC-45",    25, ts(-20, 9,  0)),  # older pallet
    # ── Zone C — Canopies ─────────────────────────────────────────────────────
    ("C-R01-1", "C", "R01", 1, "CP-STD-W",    55, ts(-4,  9,  0)),
    ("C-R01-2", "C", "R01", 2, "CP-STD-W",    40, ts(-4,  9, 30)),
    ("C-R02-1", "C", "R02", 1, "CP-STD-BK",   45, ts(-6,  9,  0)),
    ("C-R02-2", "C", "R02", 2, "CP-STD-BK",   30, ts(-6,  9, 30)),
    ("C-R03-1", "C", "R03", 1, "CP-SLIM-W",   38, ts(-9,  9,  0)),
    # ── Zone C — Controls ─────────────────────────────────────────────────────
    ("C-R03-2", "C", "R03", 2, "CT-RC-3",    120, ts(-3, 10,  0)),
    ("C-R04-1", "C", "R04", 1, "CT-RC-3",     80, ts(-3, 10, 15)),
    ("C-R04-2", "C", "R04", 2, "CT-RC-6",     15, ts(-1, 16,  0)),   # ← ALERT: total 25 < reorder 40
    ("C-R05-1", "C", "R05", 1, "CT-RC-6",     10, ts(-1, 16, 30)),   # ← same product, 2nd slot
    ("C-R05-2", "C", "R05", 2, "CT-WS-3",     80, ts(-5,  9,  0)),
    ("C-R06-1", "C", "R06", 1, "CT-WS-3",     60, ts(-5,  9, 30)),
    ("C-R06-2", "C", "R06", 2, "CT-PC",      200, ts(-10, 9,  0)),
    ("C-R07-1", "C", "R07", 1, "CT-PC",      150, ts(-10, 9, 30)),
    # ── Zone D — Lighting ─────────────────────────────────────────────────────
    ("D-R01-1", "D", "R01", 1, "LT-LED-18",   65, ts(-4, 10,  0)),
    ("D-R01-2", "D", "R01", 2, "LT-LED-18",   50, ts(-4, 10, 30)),
    ("D-R02-1", "D", "R02", 1, "LT-LED-24",   12, ts(-2, 14,  0)),   # ← ALERT: total 20 < reorder 30
    ("D-R02-2", "D", "R02", 2, "LT-LED-24",    8, ts(-2, 14, 30)),   # ← same product, 2nd slot
    ("D-R03-1", "D", "R03", 1, "LT-BH-E27",   90, ts(-6,  9,  0)),
    ("D-R03-2", "D", "R03", 2, "LT-BH-E27",   65, ts(-6,  9, 30)),
    ("D-R04-1", "D", "R04", 1, "LT-COV-FR",   55, ts(-8, 10,  0)),
    ("D-R04-2", "D", "R04", 2, "LT-COV-FR",   40, ts(-8, 10, 30)),
    # ── Zone D — Hardware ─────────────────────────────────────────────────────
    ("D-R05-1", "D", "R05", 1, "HW-MK-STD",  120, ts(-3,  9,  0)),
    ("D-R05-2", "D", "R05", 2, "HW-MK-STD",   90, ts(-3,  9, 30)),
    ("D-R06-1", "D", "R06", 1, "HW-MK-STD",   60, ts(-7,  9,  0)),
    ("D-R06-2", "D", "R06", 2, "HW-MK-SLP",   15, ts(-1, 11,  0)),   # ← ALERT: total 15 < reorder 40
    ("D-R07-1", "D", "R07", 1, "HW-SCR-KT",  400, ts(-5, 10,  0)),
    ("D-R07-2", "D", "R07", 2, "HW-SCR-KT",  300, ts(-5, 10, 30)),
    ("D-R08-1", "D", "R08", 1, "HW-SCR-KT",  200, ts(-12, 9,  0)),
    ("D-R08-2", "D", "R08", 2, "HW-EXT-30",   85, ts(-9,  9,  0)),
    ("D-R09-1", "D", "R09", 1, "HW-EXT-30",   60, ts(-9,  9, 30)),
    # ── Zone E — Staging & Overflow ──────────────────────────────────────────
    ("E-S01-1", "E", "S01", 1, "FB-ABS-52",   30, ts(-1, 16,  0)),  # just received (SHIP-006)
    ("E-S01-2", "E", "S01", 2, "MT-DC-45",    25, ts(-1, 16, 30)),  # just received
    ("E-S02-1", "E", "S02", 1, "HW-SCR-KT",  500, ts(-1, 17,  0)),  # bulk pallet
    ("E-S02-2", "E", "S02", 2, "BA-5-STD",   120, ts(-2, 14,  0)),  # overflow from last shipment
    ("E-S03-1", "E", "S03", 1, "CP-STD-W",    20, ts( 0, 10,  0)),  # staging, being put away today
    ("E-S03-2", "E", "S03", 2, "CT-RC-3",     40, ts(-1, 15,  0)),  # staging
]
# Zone A: 19 slots / capacity 24 = 79.2%
# Zone B: 10 slots / capacity 12 = 83.3%
# Zone C: 13 slots / capacity 16 = 81.3%
# Zone D: 17 slots / capacity 22 = 77.3%
# Zone E:  6 slots / capacity  8 = 75.0%
# Total:  65 slots / capacity 82 = 79.3% ≈ 80%


# ─── Inbound Shipments ─────────────────────────────────────────────────────────
# Columns: shipment_id, supplier, expected_date, received_date, status,
#          total_cartons, total_weight_kg, notes

INBOUND_SHIPMENTS = [
    # Upcoming — addresses the 5 low-stock alerts
    ("SHIP-2026-001", "Sarawak Timber Works",   ds(3),  None,        "In Transit", 12,  198.0,
     "Restocking FB-WD-52 (supplier delay resolved). Truck departs JB today."),
    ("SHIP-2026-002", "Malaysia Parts Hub",      ds(5),  None,        "In Transit", 18,  534.6,
     "MT-DC-60 restock + MT-AC-55 top-up. Sea freight via Port Klang."),
    ("SHIP-2026-003", "Elektro SG Pte Ltd",     ds(11), None,        "Ordered",    22,   96.2,
     "CT-RC-6 restock + CT-RC-3 top-up. Local supplier, 2-week lead time."),
    ("SHIP-2026-004", "LightTech Asia",          ds(15), None,        "Ordered",    16,  165.4,
     "LT-LED-24 restock + LT-LED-18 bulk order. Air freight from Guangzhou."),
    ("SHIP-2026-005", "Bolt & Bracket SG",       ds(17), None,        "Ordered",    30,  340.0,
     "HW-MK-SLP restock (customs cleared) + HW-SCR-KT bulk replenishment."),
    # Past — received (goods now on shelves / Zone E)
    ("SHIP-2026-006", "SinoFan Industrial Co.", ds(-18), ds(-1),     "Received",   45,  685.0,
     "Scheduled quarterly replenishment. FB-ABS-52, BA-5-STD, BA-5-LUX."),
    ("SHIP-2026-007", "Malaysia Parts Hub",      ds(-10), ds(-3),    "Received",   28,  520.8,
     "MT-DC-45 & MT-AC-36 top-up following Q1 demand spike."),
]

# Items per shipment: (shipment_id, product_id, quantity, cartons)
INBOUND_ITEMS = [
    # SHIP-2026-001
    ("SHIP-2026-001", "FB-WD-52",  50, 5),
    ("SHIP-2026-001", "FB-WD-46",  40, 4),
    ("SHIP-2026-001", "FB-MTL-52", 30, 3),
    # SHIP-2026-002
    ("SHIP-2026-002", "MT-DC-60",  40, 8),
    ("SHIP-2026-002", "MT-AC-55",  30, 6),
    ("SHIP-2026-002", "MT-DC-45",  20, 4),
    # SHIP-2026-003
    ("SHIP-2026-003", "CT-RC-6",   80, 8),
    ("SHIP-2026-003", "CT-RC-3",  100, 8),
    ("SHIP-2026-003", "CT-WS-3",   60, 6),
    # SHIP-2026-004
    ("SHIP-2026-004", "LT-LED-24", 60, 6),
    ("SHIP-2026-004", "LT-LED-18", 80, 8),
    ("SHIP-2026-004", "LT-BH-E27", 50, 2),
    # SHIP-2026-005
    ("SHIP-2026-005", "HW-MK-SLP", 60, 6),
    ("SHIP-2026-005", "HW-SCR-KT",500,20),
    ("SHIP-2026-005", "HW-EXT-30", 80, 4),
    # SHIP-2026-006 (received)
    ("SHIP-2026-006", "FB-ABS-52",300,15),
    ("SHIP-2026-006", "BA-5-STD", 400,20),
    ("SHIP-2026-006", "BA-5-LUX", 100, 5),
    ("SHIP-2026-006", "CP-STD-W",  60, 5),
    # SHIP-2026-007 (received)
    ("SHIP-2026-007", "MT-DC-45",  80, 12),
    ("SHIP-2026-007", "MT-AC-36", 100, 14),
    ("SHIP-2026-007", "MT-DC-60",  15,  2),
]


# ─── Outbound Orders ───────────────────────────────────────────────────────────
# Columns: order_id, customer, customer_type, order_date, delivery_date,
#          status, delivery_address, notes

OUTBOUND_ORDERS = [
    ("ORD-2026-038", "HomeStyle Furniture SG",   "Distributor", ds(-10), ds(-7),
     "Delivered",
     "Blk 123 Aljunied Ave 2, Singapore 380123",
     "Quarterly top-up order. All delivered on time."),

    ("ORD-2026-039", "BTO Renovation SG",        "Contractor",  ds(-5),  ds(-2),
     "Delivered",
     "5 Tampines Central 6, Singapore 529482",
     "32-unit BTO project. 2nd tranche of 3."),

    ("ORD-2026-040", "Cool Air Pte Ltd",          "Distributor", ds(-3),  ds(1),
     "Dispatched",
     "10 Ubi Crescent #03-58, Singapore 408564",
     "Express delivery. Driver Ahmad, GBD 4421X."),

    ("ORD-2026-041", "Lazada SG Fulfilment Hub",  "Online",      ds(-2),  ds(2),
     "Picking",
     "1 Changi Business Park, Singapore 486058",
     "Mixed SKU pallet. Barcode labels printed."),

    ("ORD-2026-042", "Renovation Hub SG",         "Contractor",  ds(-1),  ds(3),
     "Pending",
     "88 Woodlands Ave 1, Singapore 739065",
     "60-unit condo project. Includes walnut blades — check stock alert."),

    ("ORD-2026-043", "Island Home Décor",         "Retail",      ds( 0),  ds(5),
     "Pending",
     "313 Orchard Road #04-12, Singapore 238895",
     "Showroom display + retail floor stock."),
]

# Items per order: (order_id, product_id, quantity)
OUTBOUND_ITEMS = [
    # ORD-2026-038 (Delivered)
    ("ORD-2026-038", "FB-ABS-52",  60),
    ("ORD-2026-038", "BA-5-STD",   60),
    ("ORD-2026-038", "MT-DC-45",   12),
    ("ORD-2026-038", "CP-STD-W",   20),
    # ORD-2026-039 (Delivered)
    ("ORD-2026-039", "FB-ABS-46",  20),
    ("ORD-2026-039", "MT-AC-36",   10),
    ("ORD-2026-039", "CP-STD-W",   20),
    ("ORD-2026-039", "HW-MK-STD",  20),
    # ORD-2026-040 (Dispatched)
    ("ORD-2026-040", "MT-DC-60",    5),
    ("ORD-2026-040", "MT-AC-55",    8),
    ("ORD-2026-040", "CT-RC-6",    10),
    ("ORD-2026-040", "LT-LED-18",  15),
    # ORD-2026-041 (Picking)
    ("ORD-2026-041", "CT-RC-3",    50),
    ("ORD-2026-041", "CT-PC",     100),
    ("ORD-2026-041", "LT-LED-18",  30),
    ("ORD-2026-041", "LT-COV-FR",  25),
    ("ORD-2026-041", "HW-SCR-KT",  80),
    # ORD-2026-042 (Pending)
    ("ORD-2026-042", "FB-WD-52",   10),
    ("ORD-2026-042", "FB-WD-46",   15),
    ("ORD-2026-042", "LT-LED-24",   8),
    ("ORD-2026-042", "HW-MK-STD",  20),
    # ORD-2026-043 (Pending)
    ("ORD-2026-043", "CP-SLIM-W",  15),
    ("ORD-2026-043", "LT-COV-FR",  20),
    ("ORD-2026-043", "HW-MK-STD",  20),
    ("ORD-2026-043", "BA-5-LUX",   12),
    ("ORD-2026-043", "CT-RC-6",     8),
]


# ─── PO History generation ─────────────────────────────────────────────────────

# 12 months: May 2025 → April 2026
PO_PERIOD = [
    (5,2025),(6,2025),(7,2025),(8,2025),(9,2025),(10,2025),
    (11,2025),(12,2025),(1,2026),(2,2026),(3,2026),(4,2026),
]

# Seasonal demand multipliers (Singapore renovation cycle)
SEASONAL = {
    5:1.40, 6:1.20, 7:0.90, 8:0.95, 9:1.10, 10:1.30,
    11:1.40,12:1.15, 1:0.70, 2:0.85, 3:1.10, 4:1.30,
}

# Base monthly order quantity per product (mid-season baseline)
BASE_QTY = {
    "FB-ABS-52":  80, "FB-ABS-46":  60, "FB-WD-52":  25, "FB-WD-46":  35, "FB-MTL-52": 20,
    "MT-DC-45":   40, "MT-DC-60":   20, "MT-AC-36":  50, "MT-AC-55":  25,
    "CP-STD-W":   35, "CP-STD-BK":  28, "CP-SLIM-W": 22,
    "CT-RC-3":    60, "CT-RC-6":    30, "CT-WS-3":   50, "CT-PC":    120,
    "BA-5-STD":  100, "BA-5-LUX":   35, "BA-3-STD":  55,
    "LT-LED-18":  45, "LT-LED-24":  28, "LT-BH-E27": 55, "LT-COV-FR": 40,
    "HW-MK-STD":  90, "HW-MK-SLP":  35, "HW-SCR-KT":250, "HW-EXT-30": 65,
}

# Supply disruptions (received_qty = ordered_qty × ratio) for low-stock narrative
# These explain why the 5 products are below reorder point today
DISRUPTIONS = {
    "FB-WD-52":  {(3,2026): 0.0, (4,2026): 0.0},   # Sarawak supplier delay (now in transit SHIP-001)
    "MT-DC-60":  {(3,2026): 0.6, (4,2026): 0.5},   # Malaysia partial shipments
    "CT-RC-6":   {(3,2026): 0.7, (4,2026): 0.5},   # Elektro SG stockout at source
    "LT-LED-24": {(3,2026): 0.6, (4,2026): 0.4},   # LightTech air freight delays
    "HW-MK-SLP": {(4,2026): 0.0},                   # Customs hold (now cleared, SHIP-005 ordered)
}


def _build_po_history():
    rows = []
    # Build a quick lookup: product_id → (unit_cost_sgd, supplier)
    prod_info = {p[0]: (p[8], p[9]) for p in PRODUCTS}

    for pid, (base_cost, supplier) in prod_info.items():
        base = BASE_QTY[pid]
        for month, year in PO_PERIOD:
            mult  = SEASONAL[month]
            j_qty = _jitter(pid, month, year)
            j_cst = _jitter(pid + "_cost", month, year)

            qty_ordered  = max(1, round(base * mult * j_qty))
            recv_ratio   = DISRUPTIONS.get(pid, {}).get((month, year), 1.0)
            qty_received = round(qty_ordered * recv_ratio)

            # Historical cost: ±8% variation around current unit_cost
            unit_cost = round(base_cost * (0.92 + j_cst * 0.16), 2)

            rows.append((pid, month, year, qty_ordered, qty_received, unit_cost, supplier))
    return rows


# ─── Seed function ─────────────────────────────────────────────────────────────

def seed(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()

    # Products
    cur.executemany(
        "INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?)",
        PRODUCTS,
    )

    # Zones (current_occupancy computed after inventory insert)
    cur.executemany(
        "INSERT INTO zones VALUES (?,?,?,?,?,?,?,?,?,?)",
        ZONES,
    )

    # Inventory
    cur.executemany(
        "INSERT INTO inventory VALUES (?,?,?,?,?,?,?)",
        INVENTORY,
    )

    # Update zone current_occupancy from actual inventory counts
    cur.execute("""
        UPDATE zones SET current_occupancy = (
            SELECT COUNT(*) FROM inventory WHERE inventory.zone = zones.zone_id
        )
    """)

    # Inbound shipments
    cur.executemany(
        "INSERT INTO inbound_shipments VALUES (?,?,?,?,?,?,?,?)",
        INBOUND_SHIPMENTS,
    )
    cur.executemany(
        "INSERT INTO inbound_shipment_items(shipment_id,product_id,quantity,cartons) VALUES (?,?,?,?)",
        INBOUND_ITEMS,
    )

    # Outbound orders
    cur.executemany(
        "INSERT INTO outbound_orders VALUES (?,?,?,?,?,?,?,?)",
        OUTBOUND_ORDERS,
    )
    cur.executemany(
        "INSERT INTO outbound_order_items(order_id,product_id,quantity) VALUES (?,?,?)",
        OUTBOUND_ITEMS,
    )

    # PO history
    cur.executemany(
        "INSERT OR IGNORE INTO po_history(product_id,month,year,quantity_ordered,"
        "quantity_received,unit_cost_sgd,supplier) VALUES (?,?,?,?,?,?,?)",
        _build_po_history(),
    )

    conn.commit()


# ─── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        print(f"Removed existing  {DB_PATH}")

    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(SCHEMA)
        seed(conn)

        print(f"\nCreated  {DB_PATH}\n")
        print("Table counts:")
        for tbl in ["products","zones","inventory","inbound_shipments",
                     "inbound_shipment_items","outbound_orders",
                     "outbound_order_items","po_history"]:
            n = conn.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
            print(f"  {tbl:<28} {n:>4} rows")

        # Quick sanity: products below reorder
        alerts = conn.execute("""
            SELECT p.product_id, p.reorder_point,
                   COALESCE(SUM(i.quantity),0) AS total_qty
            FROM products p
            LEFT JOIN inventory i USING (product_id)
            GROUP BY p.product_id, p.reorder_point
            HAVING total_qty < p.reorder_point
            ORDER BY (p.reorder_point - total_qty) DESC
        """).fetchall()
        print(f"\nLow-stock alerts ({len(alerts)} products below reorder point):")
        for pid, rp, qty in alerts:
            print(f"  {pid:<14}  qty {qty:>3}  /  reorder {rp}")

        # Zone occupancy
        zones_stats = conn.execute("""
            SELECT zone_id, current_occupancy, capacity_slots,
                   ROUND(100.0*current_occupancy/capacity_slots,1) AS pct
            FROM zones ORDER BY zone_id
        """).fetchall()
        print("\nZone occupancy:")
        for zid, occ, cap, pct in zones_stats:
            bar = "█" * int(pct / 5)
            print(f"  Zone {zid}  {occ:>2}/{cap}  {pct:>5}%  {bar}")

    finally:
        conn.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
