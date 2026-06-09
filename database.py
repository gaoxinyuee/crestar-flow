"""
database.py
Query helpers for warehouse.db — Crestar Warehouse Intelligence Suite.

All public functions return either a pandas DataFrame or a Python dict/list
so they can be consumed directly by app.py or the AI chatbot.

Usage:
    from database import get_inventory_summary, get_low_stock_alerts, ...
"""

import sqlite3
import os
from typing import Optional

import pandas as pd

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "warehouse.db")


# ─── Connection ────────────────────────────────────────────────────────────────

def _ensure_db_exists() -> None:
    """Create the packaged demo database when a fresh deploy has no SQLite file."""
    if os.path.exists(DB_PATH):
        return

    import create_db

    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(create_db.SCHEMA)
        create_db.seed(conn)
    finally:
        conn.close()


def get_db() -> sqlite3.Connection:
    """Return a read-optimised connection with row_factory set."""
    _ensure_db_exists()
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def _query_df(sql: str, params: tuple = ()) -> pd.DataFrame:
    """Execute *sql* and return results as a DataFrame."""
    with get_db() as conn:
        return pd.read_sql_query(sql, conn, params=params)


def _query_rows(sql: str, params: tuple = ()) -> list[dict]:
    """Execute *sql* and return a list of plain dicts."""
    with get_db() as conn:
        cur = conn.execute(sql, params)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


# ─── Products ──────────────────────────────────────────────────────────────────

def get_all_products() -> pd.DataFrame:
    """Full product catalogue with dimensions and reorder thresholds."""
    return _query_df("""
        SELECT product_id, name, category,
               length_cm, width_cm, height_cm, weight_kg,
               reorder_point, unit_cost_sgd, supplier
        FROM   products
        ORDER  BY category, name
    """)


def get_product(product_id: str) -> Optional[dict]:
    """Return a single product record as a dict, or None if not found."""
    rows = _query_rows("SELECT * FROM products WHERE product_id = ?", (product_id,))
    return rows[0] if rows else None


# ─── Inventory ─────────────────────────────────────────────────────────────────

def get_inventory_summary() -> pd.DataFrame:
    """
    One row per product with aggregated quantity and stock status.

    Columns:
        product_id, name, category, zone_list, primary_zone,
        total_qty, reorder_point, stock_status, unit_cost_sgd,
        slots_used, last_updated
    """
    return _query_df("""
        SELECT
            p.product_id,
            p.name,
            p.category,
            GROUP_CONCAT(DISTINCT i.zone)                 AS zone_list,
            MIN(i.zone)                                   AS primary_zone,
            COALESCE(SUM(i.quantity), 0)                  AS total_qty,
            p.reorder_point,
            CASE
                WHEN COALESCE(SUM(i.quantity),0) = 0             THEN 'Out of Stock'
                WHEN COALESCE(SUM(i.quantity),0) < p.reorder_point THEN 'Low Stock'
                WHEN COALESCE(SUM(i.quantity),0) < p.reorder_point*1.5 THEN 'Adequate'
                ELSE 'Healthy'
            END                                           AS stock_status,
            p.unit_cost_sgd,
            COUNT(i.slot_id)                              AS slots_used,
            MAX(i.last_updated)                           AS last_updated
        FROM      products p
        LEFT JOIN inventory i USING (product_id)
        GROUP BY  p.product_id, p.name, p.category,
                  p.reorder_point, p.unit_cost_sgd
        ORDER BY  stock_status DESC, p.category, p.name
    """)


def get_low_stock_alerts() -> list[dict]:
    """
    Products whose total on-hand quantity is below the reorder point.
    Sorted by severity (largest shortfall first).
    """
    return _query_rows("""
        SELECT
            p.product_id,
            p.name,
            p.category,
            p.reorder_point,
            p.supplier,
            COALESCE(SUM(i.quantity), 0)                AS total_qty,
            p.reorder_point - COALESCE(SUM(i.quantity),0) AS shortfall,
            CASE
                WHEN COALESCE(SUM(i.quantity),0) = 0     THEN 'Out of Stock'
                ELSE 'Low Stock'
            END                                          AS stock_status,
            GROUP_CONCAT(DISTINCT i.zone || '-' || i.rack || '-' || i.level) AS locations
        FROM      products p
        LEFT JOIN inventory i USING (product_id)
        GROUP BY  p.product_id, p.name, p.category,
                  p.reorder_point, p.supplier
        HAVING    COALESCE(SUM(i.quantity),0) < p.reorder_point
        ORDER BY  shortfall DESC
    """)


def get_product_locations(product_id: str) -> pd.DataFrame:
    """All rack slots holding a specific product."""
    return _query_df("""
        SELECT i.slot_id,
               i.zone,
               i.rack,
               i.level,
               i.quantity,
               i.last_updated,
               z.name AS zone_name
        FROM   inventory i
        JOIN   zones     z ON z.zone_id = i.zone
        WHERE  i.product_id = ?
        ORDER  BY i.zone, i.rack, i.level
    """, (product_id,))


def search_inventory(query: str) -> pd.DataFrame:
    """
    Full-text search across product_id, name, category, and zone.
    Returns inventory summary rows that match.
    """
    pattern = f"%{query}%"
    return _query_df("""
        SELECT
            p.product_id,
            p.name,
            p.category,
            p.supplier,
            GROUP_CONCAT(DISTINCT i.zone || '-' || i.rack || '-' || i.level) AS locations,
            COALESCE(SUM(i.quantity), 0)  AS total_qty,
            p.reorder_point,
            CASE
                WHEN COALESCE(SUM(i.quantity),0) < p.reorder_point THEN 'Low Stock'
                ELSE 'Healthy'
            END AS stock_status
        FROM      products p
        LEFT JOIN inventory i USING (product_id)
        WHERE     p.product_id LIKE ?
           OR     p.name       LIKE ?
           OR     p.category   LIKE ?
           OR     i.zone       = UPPER(?)
        GROUP BY  p.product_id, p.name, p.category, p.supplier, p.reorder_point
        ORDER BY  stock_status DESC, p.name
    """, (pattern, pattern, pattern, query.strip().upper()))


# ─── Zones ─────────────────────────────────────────────────────────────────────

def get_zone_stats() -> pd.DataFrame:
    """
    Zone capacity, occupancy, floor area, and top product categories.
    """
    return _query_df("""
        SELECT
            z.zone_id,
            z.name,
            z.zone_type,
            z.length_m,
            z.width_m,
            z.height_m,
            ROUND(z.length_m * z.width_m, 1)           AS floor_area_sqm,
            z.max_pallet_height_m,
            z.capacity_slots,
            z.current_occupancy,
            ROUND(100.0 * z.current_occupancy / z.capacity_slots, 1) AS occupancy_pct,
            z.primary_category,
            COALESCE(SUM(i.quantity), 0)                AS total_units
        FROM      zones z
        LEFT JOIN inventory i ON i.zone = z.zone_id
        GROUP BY  z.zone_id, z.name, z.zone_type,
                  z.length_m, z.width_m, z.height_m,
                  z.max_pallet_height_m, z.capacity_slots,
                  z.current_occupancy, z.primary_category
        ORDER BY  z.zone_id
    """)


def get_zone_inventory(zone_id: str) -> pd.DataFrame:
    """All stock slots within a specific zone, with product details."""
    return _query_df("""
        SELECT
            i.slot_id,
            i.rack,
            i.level,
            p.product_id,
            p.name,
            p.category,
            i.quantity,
            p.reorder_point,
            CASE WHEN i.quantity < p.reorder_point THEN 'Low' ELSE 'OK' END AS status,
            i.last_updated
        FROM   inventory i
        JOIN   products  p USING (product_id)
        WHERE  i.zone = UPPER(?)
        ORDER  BY i.rack, i.level
    """, (zone_id,))


# ─── Inbound Shipments ─────────────────────────────────────────────────────────

def get_inbound_shipments(status: Optional[str] = None) -> pd.DataFrame:
    """
    Inbound shipments with a comma-separated item summary.
    Pass status='In Transit', 'Ordered', 'Received', etc. to filter.
    """
    where = "WHERE s.status = ?" if status else ""
    params = (status,) if status else ()
    return _query_df(f"""
        SELECT
            s.shipment_id,
            s.supplier,
            s.expected_date,
            s.received_date,
            s.status,
            s.total_cartons,
            s.total_weight_kg,
            s.notes,
            COUNT(si.id)                               AS line_items,
            SUM(si.quantity)                           AS total_units,
            GROUP_CONCAT(p.name || ' ×' || si.quantity, ' | ')
                                                       AS items_summary
        FROM      inbound_shipments s
        LEFT JOIN inbound_shipment_items si USING (shipment_id)
        LEFT JOIN products              p  USING (product_id)
        {where}
        GROUP BY  s.shipment_id, s.supplier, s.expected_date, s.received_date,
                  s.status, s.total_cartons, s.total_weight_kg, s.notes
        ORDER BY  s.expected_date
    """, params)


def get_inbound_shipment_items(shipment_id: str) -> pd.DataFrame:
    """Detailed line items for a single inbound shipment."""
    return _query_df("""
        SELECT
            si.id,
            p.product_id,
            p.name,
            p.category,
            si.quantity,
            si.cartons,
            ROUND(si.quantity * p.unit_cost_sgd, 2) AS line_value_sgd
        FROM   inbound_shipment_items si
        JOIN   products               p  USING (product_id)
        WHERE  si.shipment_id = ?
        ORDER  BY p.category, p.name
    """, (shipment_id,))


# ─── Outbound Orders ───────────────────────────────────────────────────────────

def get_outbound_orders(status: Optional[str] = None) -> pd.DataFrame:
    """
    Outbound orders with item summary.
    Pass status='Pending', 'Picking', 'Packed', 'Dispatched', 'Delivered' to filter.
    """
    where = "WHERE o.status = ?" if status else ""
    params = (status,) if status else ()
    return _query_df(f"""
        SELECT
            o.order_id,
            o.customer,
            o.customer_type,
            o.order_date,
            o.delivery_date,
            o.status,
            o.delivery_address,
            o.notes,
            COUNT(oi.id)                               AS line_items,
            SUM(oi.quantity)                           AS total_units,
            ROUND(SUM(oi.quantity * p.unit_cost_sgd * 1.35), 2)
                                                       AS order_value_sgd,
            GROUP_CONCAT(p.name || ' ×' || oi.quantity, ' | ')
                                                       AS items_summary
        FROM      outbound_orders      o
        LEFT JOIN outbound_order_items oi USING (order_id)
        LEFT JOIN products             p  USING (product_id)
        {where}
        GROUP BY  o.order_id, o.customer, o.customer_type,
                  o.order_date, o.delivery_date, o.status,
                  o.delivery_address, o.notes
        ORDER BY  o.delivery_date
    """, params)


def get_outbound_order_items(order_id: str) -> pd.DataFrame:
    """Detailed line items for a single outbound order."""
    return _query_df("""
        SELECT
            oi.id,
            p.product_id,
            p.name,
            p.category,
            oi.quantity,
            ROUND(oi.quantity * p.unit_cost_sgd * 1.35, 2) AS line_value_sgd
        FROM   outbound_order_items oi
        JOIN   products             p  USING (product_id)
        WHERE  oi.order_id = ?
        ORDER  BY p.category, p.name
    """, (order_id,))


# ─── PO History & Forecasting ──────────────────────────────────────────────────

def get_po_history(product_id: Optional[str] = None) -> pd.DataFrame:
    """
    Monthly purchase order history.
    If product_id is given, returns that product's 12-month history.
    Otherwise returns all products (useful for pivot / multi-line charts).
    """
    where  = "WHERE ph.product_id = ?" if product_id else ""
    params = (product_id,) if product_id else ()
    return _query_df(f"""
        SELECT
            ph.product_id,
            p.name,
            p.category,
            ph.month,
            ph.year,
            ph.year || '-' || SUBSTR('0'||ph.month,-2) AS period,
            ph.quantity_ordered,
            ph.quantity_received,
            ph.quantity_ordered - ph.quantity_received  AS shortfall,
            ph.unit_cost_sgd,
            ROUND(ph.quantity_ordered * ph.unit_cost_sgd, 2) AS order_value_sgd,
            ph.supplier
        FROM   po_history ph
        JOIN   products   p  USING (product_id)
        {where}
        ORDER  BY ph.product_id, ph.year, ph.month
    """, params)


def get_demand_forecast_data(top_n: int = 8) -> pd.DataFrame:
    """
    Monthly ordered quantities for the top-N products by total volume.
    Returns a wide DataFrame suitable for multi-line Plotly charts:
        columns = ['period', 'product_A', 'product_B', ...]
    """
    # Identify top N products by total ordered volume
    top_df = _query_df(f"""
        SELECT ph.product_id, p.name, SUM(ph.quantity_ordered) AS total
        FROM   po_history ph
        JOIN   products   p USING (product_id)
        GROUP  BY ph.product_id, p.name
        ORDER  BY total DESC
        LIMIT  {int(top_n)}
    """)
    top_ids = top_df["product_id"].tolist()
    if not top_ids:
        return pd.DataFrame()

    placeholders = ",".join("?" * len(top_ids))
    long = _query_df(f"""
        SELECT
            ph.year || '-' || SUBSTR('0'||ph.month,-2) AS period,
            p.name                                      AS product,
            ph.quantity_ordered
        FROM   po_history ph
        JOIN   products   p USING (product_id)
        WHERE  ph.product_id IN ({placeholders})
        ORDER  BY ph.year, ph.month
    """, tuple(top_ids))

    if long.empty:
        return long

    wide = long.pivot_table(
        index="period", columns="product", values="quantity_ordered", aggfunc="sum"
    ).reset_index()
    wide.columns.name = None
    return wide


def get_monthly_spend() -> pd.DataFrame:
    """Total purchasing spend per month across all products."""
    return _query_df("""
        SELECT
            year || '-' || SUBSTR('0'||month,-2) AS period,
            month,
            year,
            ROUND(SUM(quantity_ordered * unit_cost_sgd), 2) AS total_spend_sgd,
            SUM(quantity_ordered)                            AS total_units
        FROM   po_history
        GROUP  BY year, month
        ORDER  BY year, month
    """)


# ─── Dashboard KPIs ────────────────────────────────────────────────────────────

def get_dashboard_kpis() -> dict:
    """
    Single dict with all headline numbers for the Home page.

    Keys:
        total_skus, total_units, low_stock_count, out_of_stock_count,
        inbound_pending, outbound_active,
        warehouse_occupancy_pct, total_zones,
        pending_orders_value_sgd, inbound_units_expected
    """
    with get_db() as conn:
        def scalar(sql, params=()):
            return conn.execute(sql, params).fetchone()[0]

        total_skus   = scalar("SELECT COUNT(*) FROM products")
        total_units  = scalar("SELECT COALESCE(SUM(quantity),0) FROM inventory")

        low_stock = scalar("""
            SELECT COUNT(*) FROM (
                SELECT p.product_id
                FROM   products p
                LEFT   JOIN inventory i USING (product_id)
                GROUP  BY p.product_id, p.reorder_point
                HAVING COALESCE(SUM(i.quantity),0) < p.reorder_point
            )
        """)
        out_of_stock = scalar("""
            SELECT COUNT(*) FROM (
                SELECT p.product_id
                FROM   products p
                LEFT   JOIN inventory i USING (product_id)
                GROUP  BY p.product_id
                HAVING COALESCE(SUM(i.quantity),0) = 0
            )
        """)

        inbound_pending = scalar(
            "SELECT COUNT(*) FROM inbound_shipments WHERE status IN ('Ordered','In Transit')"
        )
        outbound_active = scalar(
            "SELECT COUNT(*) FROM outbound_orders WHERE status NOT IN ('Delivered')"
        )

        occ_row = conn.execute("""
            SELECT SUM(current_occupancy), SUM(capacity_slots) FROM zones
        """).fetchone()
        occ_pct = round(100.0 * occ_row[0] / occ_row[1], 1) if occ_row[1] else 0.0

        total_zones = scalar("SELECT COUNT(*) FROM zones")

        pending_val = scalar("""
            SELECT ROUND(COALESCE(SUM(oi.quantity * p.unit_cost_sgd * 1.35),0),2)
            FROM   outbound_orders      o
            JOIN   outbound_order_items oi USING (order_id)
            JOIN   products             p  USING (product_id)
            WHERE  o.status IN ('Pending','Picking','Packed')
        """)

        inbound_units = scalar("""
            SELECT COALESCE(SUM(si.quantity),0)
            FROM   inbound_shipments      s
            JOIN   inbound_shipment_items si USING (shipment_id)
            WHERE  s.status IN ('Ordered','In Transit')
        """)

    return {
        "total_skus":              total_skus,
        "total_units":             total_units,
        "low_stock_count":         low_stock,
        "out_of_stock_count":      out_of_stock,
        "inbound_pending":         inbound_pending,
        "outbound_active":         outbound_active,
        "warehouse_occupancy_pct": occ_pct,
        "total_zones":             total_zones,
        "pending_orders_value_sgd":pending_val,
        "inbound_units_expected":  inbound_units,
    }


# ─── Convenience: plain-text summary for the AI chatbot ───────────────────────

def get_chatbot_context() -> str:
    """
    Return a concise text block describing current warehouse state.
    Injected into the AI chatbot system prompt for grounded answers.
    """
    kpis   = get_dashboard_kpis()
    alerts = get_low_stock_alerts()
    zones  = get_zone_stats()
    inbound = get_inbound_shipments(status="In Transit")

    lines = [
        "=== CRESTAR LIVE WAREHOUSE CONTEXT ===",
        f"Total SKUs: {kpis['total_skus']}  |  Total units on hand: {kpis['total_units']}",
        f"Warehouse occupancy: {kpis['warehouse_occupancy_pct']}%  |  Zones: {kpis['total_zones']}",
        f"Active outbound orders: {kpis['outbound_active']}  |  Inbound pending: {kpis['inbound_pending']}",
        "",
        "LOW-STOCK ALERTS (below reorder point):",
    ]
    for a in alerts:
        lines.append(
            f"  {a['product_id']:<14} {a['name'][:40]:<40} "
            f"qty={a['total_qty']:>4}  reorder={a['reorder_point']:>4}  "
            f"shortfall={a['shortfall']:>4}  supplier: {a['supplier']}"
        )

    lines += ["", "ZONE SUMMARY:"]
    for _, row in zones.iterrows():
        lines.append(
            f"  Zone {row['zone_id']}  {row['occupancy_pct']:>5}% full  "
            f"({row['current_occupancy']}/{row['capacity_slots']} slots)  "
            f"— {row['primary_category']}"
        )

    if not inbound.empty:
        lines += ["", "SHIPMENTS IN TRANSIT:"]
        for _, row in inbound.iterrows():
            lines.append(
                f"  {row['shipment_id']}  ETA {row['expected_date']}  "
                f"from {row['supplier']}  —  {row['items_summary']}"
            )

    return "\n".join(lines)


# ─── Quick self-test ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=== database.py self-test ===\n")

    print("KPIs:")
    for k, v in get_dashboard_kpis().items():
        print(f"  {k:<32} {v}")

    print("\nLow-stock alerts:")
    for a in get_low_stock_alerts():
        print(f"  {a['product_id']:<14} qty={a['total_qty']:>4} / reorder={a['reorder_point']:>4}  ({a['name']})")

    print("\nZone stats:")
    print(get_zone_stats()[["zone_id","occupancy_pct","total_units","primary_category"]].to_string(index=False))

    print("\nInbound (In Transit):")
    df = get_inbound_shipments("In Transit")
    if not df.empty:
        print(df[["shipment_id","supplier","expected_date","total_units"]].to_string(index=False))

    print("\nForecast data (top 5 products, first 3 periods):")
    fc = get_demand_forecast_data(top_n=5)
    if not fc.empty:
        print(fc.head(3).to_string(index=False))

    print("\nChatbot context snippet (first 20 lines):")
    ctx = get_chatbot_context()
    for line in ctx.split("\n")[:20]:
        print(" ", line)
