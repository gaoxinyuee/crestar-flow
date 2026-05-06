"""
forecasting.py
Holt's linear trend forecasting — Crestar Warehouse Intelligence Suite.

Loads 12-month PO history from warehouse.db, applies Holt's linear trend method
per SKU, and writes 3-month forecasts with 95% confidence intervals to the
`forecasts` table.

Usage:
    python forecasting.py           # run all forecasts and print sample
    import forecasting; forecasting.run_forecasts()
"""

import math
from datetime import datetime

import numpy as np
from statsmodels.tsa.holtwinters import Holt

import database

# ─── Schema ────────────────────────────────────────────────────────────────────

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS forecasts (
    product_id   TEXT    NOT NULL,
    horizon      INTEGER NOT NULL,
    period       TEXT    NOT NULL,
    month        INTEGER NOT NULL,
    year         INTEGER NOT NULL,
    forecast_qty REAL    NOT NULL,
    ci_low       REAL    NOT NULL,
    ci_high      REAL    NOT NULL,
    generated_at TEXT    NOT NULL,
    PRIMARY KEY (product_id, horizon)
)
"""

_MONTH_LABELS = {
    1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr",
    5: "May", 6: "Jun", 7: "Jul", 8: "Aug",
    9: "Sep", 10: "Oct", 11: "Nov", 12: "Dec",
}


def _create_table() -> None:
    with database.get_db() as conn:
        conn.execute(_CREATE_TABLE)
        conn.commit()


# ─── Holt's linear trend model ────────────────────────────────────────────────

def _fit_holt(series: list[float]) -> tuple[list[float], list[float], list[float]]:
    """
    Fit Holt's linear trend to *series* and produce a 3-step-ahead forecast.

    Returns:
        forecast  — list of 3 predicted values
        ci_low    — lower bound of 95% prediction interval
        ci_high   — upper bound of 95% prediction interval

    The confidence intervals use the residual RMSE:
        margin_h = 1.96 * RMSE * sqrt(h)   (h = horizon, 1-indexed)
    """
    arr   = np.asarray(series, dtype=float)
    model = Holt(arr, initialization_method="estimated")
    fit   = model.fit(optimized=True)

    forecast = fit.forecast(3)

    rmse = math.sqrt(float(np.mean(fit.resid ** 2))) if len(fit.resid) > 0 else 0.0

    ci_low  = [max(0.0, float(f) - 1.96 * rmse * math.sqrt(h)) for h, f in enumerate(forecast, 1)]
    ci_high = [float(f) + 1.96 * rmse * math.sqrt(h)           for h, f in enumerate(forecast, 1)]

    return [float(v) for v in forecast], ci_low, ci_high


def _next_months(base_month: int, base_year: int, n: int = 3) -> list[tuple[int, int]]:
    """Return *n* (month, year) tuples following base_month/base_year."""
    out, m, y = [], base_month, base_year
    for _ in range(n):
        m += 1
        if m > 12:
            m, y = 1, y + 1
        out.append((m, y))
    return out


# ─── Run all forecasts ─────────────────────────────────────────────────────────

def run_forecasts() -> dict[str, list[float]]:
    """
    Fit Holt's linear trend for every SKU in po_history and persist results.

    Returns {product_id: [forecast_month1, forecast_month2, forecast_month3]}.
    """
    _create_table()
    now = datetime.utcnow().isoformat()

    df = database.get_po_history()
    if df.empty:
        return {}

    results:  dict[str, list[float]] = {}
    to_insert: list[tuple]           = []

    for pid, grp in df.groupby("product_id"):
        grp_sorted = grp.sort_values(["year", "month"])
        series     = grp_sorted["quantity_ordered"].tolist()

        if len(series) < 3:
            continue

        # Pad with series mean when fewer than 12 data points exist
        while len(series) < 12:
            series = [float(np.mean(series))] + series

        fc, lo, hi = _fit_holt(series)
        results[pid] = fc

        last     = grp_sorted.iloc[-1]
        nxt_mths = _next_months(int(last["month"]), int(last["year"]), 3)

        for horizon, ((m, y), f, l, h) in enumerate(zip(nxt_mths, fc, lo, hi), 1):
            period = f"{y}-{m:02d}"
            to_insert.append((pid, horizon, period, m, y,
                               round(f, 2), round(l, 2), round(h, 2), now))

    with database.get_db() as conn:
        conn.execute("DELETE FROM forecasts")
        conn.executemany("""
            INSERT OR REPLACE INTO forecasts
                (product_id, horizon, period, month, year,
                 forecast_qty, ci_low, ci_high, generated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, to_insert)
        conn.commit()

    print(f"[forecasting] {len(to_insert)} forecast rows written for {len(results)} SKUs.")
    return results


# ─── Query helpers ─────────────────────────────────────────────────────────────

def _ensure_forecasts() -> None:
    """Create the table and run forecasts if no rows exist."""
    _create_table()
    rows = database._query_rows("SELECT COUNT(*) AS n FROM forecasts")
    if rows[0]["n"] == 0:
        run_forecasts()


def get_forecast(product_id: str) -> dict:
    """
    Full historical + 3-month forecast for one SKU.

    Response shape:
    {
        product_id, name, category, unit_cost_sgd,
        historical: [{label, period, quantity}, ...],   # 12 months
        forecast:   [{label, period, forecast_qty, ci_low, ci_high}, ...],  # 3 months
        total_stock, reorder_point,
        trend: "up" | "down" | "flat",
        suggested_order: int,
        urgency: "red" | "amber" | "green"
    }
    """
    product = database.get_product(product_id)
    if product is None:
        return {}

    hist_df = database.get_po_history(product_id)
    if hist_df.empty:
        return {"error": "no history"}

    hist_sorted = hist_df.sort_values(["year", "month"])
    historical = [
        {
            "label":    f"{_MONTH_LABELS[int(r['month'])]} {str(int(r['year']))[2:]}",
            "period":   r["period"],
            "quantity": int(r["quantity_ordered"]),
        }
        for _, r in hist_sorted.iterrows()
    ]

    _ensure_forecasts()
    fc_rows = database._query_rows("""
        SELECT horizon, period, month, year, forecast_qty, ci_low, ci_high
        FROM   forecasts
        WHERE  product_id = ?
        ORDER  BY horizon
    """, (product_id,))

    forecast_out = [
        {
            "label":        f"{_MONTH_LABELS[r['month']]} {str(r['year'])[2:]}",
            "period":       r["period"],
            "forecast_qty": round(float(r["forecast_qty"]), 1),
            "ci_low":       round(float(r["ci_low"]),       1),
            "ci_high":      round(float(r["ci_high"]),      1),
        }
        for r in fc_rows
    ]

    inv = database._query_rows("""
        SELECT COALESCE(SUM(quantity), 0) AS qty
        FROM   inventory WHERE product_id = ?
    """, (product_id,))
    total_stock   = int(inv[0]["qty"]) if inv else 0
    reorder_point = int(product["reorder_point"])
    unit_cost     = float(product["unit_cost_sgd"])

    next_fc   = forecast_out[0]["forecast_qty"] if forecast_out else 0.0
    shortage  = max(0.0, next_fc - total_stock)
    suggested = math.ceil(shortage * 1.2) if shortage > 0 else 0  # 20% safety buffer

    if total_stock == 0 or total_stock <= reorder_point * 0.5:
        urgency = "red"
    elif total_stock < reorder_point or shortage > 0:
        urgency = "amber"
    else:
        urgency = "green"

    qty_list = [h["quantity"] for h in historical]
    if len(qty_list) >= 6:
        early = sum(qty_list[:3]) / 3
        late  = sum(qty_list[-3:]) / 3
        trend = "up" if late > early * 1.05 else ("down" if late < early * 0.95 else "flat")
    else:
        trend = "flat"

    return {
        "product_id":      product_id,
        "name":            product["name"],
        "category":        product["category"],
        "unit_cost_sgd":   unit_cost,
        "historical":      historical,
        "forecast":        forecast_out,
        "total_stock":     total_stock,
        "reorder_point":   reorder_point,
        "trend":           trend,
        "suggested_order": suggested,
        "urgency":         urgency,
    }


def get_all_forecasts() -> list[dict]:
    """
    Summary list for all SKUs — used by the recommendations panel and dropdown.

    Sorted red → amber → green.
    """
    _ensure_forecasts()

    products = database._query_rows("""
        SELECT p.product_id, p.name, p.category,
               p.reorder_point, p.unit_cost_sgd,
               COALESCE(SUM(i.quantity), 0) AS total_stock
        FROM   products p
        LEFT JOIN inventory i USING (product_id)
        GROUP BY p.product_id, p.name, p.category, p.reorder_point, p.unit_cost_sgd
        ORDER BY p.category, p.name
    """)

    fc_map: dict[str, dict] = {}
    for r in database._query_rows(
        "SELECT product_id, forecast_qty FROM forecasts WHERE horizon = 1"
    ):
        fc_map[r["product_id"]] = r

    result = []
    for p in products:
        pid   = p["product_id"]
        stock = int(p["total_stock"])
        rp    = int(p["reorder_point"])
        fc    = fc_map.get(pid)
        fc_qty    = round(float(fc["forecast_qty"]), 1) if fc else 0.0
        shortage  = max(0.0, fc_qty - stock)
        suggested = math.ceil(shortage * 1.2) if shortage > 0 else 0

        if stock == 0 or stock <= rp * 0.5:
            urgency = "red"
        elif stock < rp or shortage > 0:
            urgency = "amber"
        else:
            urgency = "green"

        result.append({
            "product_id":      pid,
            "name":            p["name"],
            "category":        p["category"],
            "total_stock":     stock,
            "reorder_point":   rp,
            "forecast_qty":    fc_qty,
            "suggested_order": suggested,
            "urgency":         urgency,
            "unit_cost_sgd":   float(p["unit_cost_sgd"]),
        })

    _order = {"red": 0, "amber": 1, "green": 2}
    result.sort(key=lambda x: _order[x["urgency"]])
    return result


# ─── CLI self-test ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import json
    print("Running Holt's linear trend forecasts for all SKUs...")
    run_forecasts()
    print("\nSample forecast — FB-ABS-52:")
    fc = get_forecast("FB-ABS-52")
    print(f"  Historical months : {len(fc.get('historical', []))}")
    print(f"  Forecast months   : {[f['label'] for f in fc.get('forecast', [])]}")
    print(f"  Forecast values   : {[f['forecast_qty'] for f in fc.get('forecast', [])]}")
    print(f"  95% CI (month 1)  : [{fc['forecast'][0]['ci_low']}, {fc['forecast'][0]['ci_high']}]")
    print(f"  Urgency           : {fc.get('urgency')} | suggested order: {fc.get('suggested_order')}")
    print("\nAll forecasts summary (first 5):")
    for item in get_all_forecasts()[:5]:
        print(f"  {item['product_id']:<14} stock={item['total_stock']:>4}  "
              f"fc={item['forecast_qty']:>6.1f}  urgency={item['urgency']}")
