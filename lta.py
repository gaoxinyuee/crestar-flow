"""
lta.py
LTA DataMall traffic incident integration — Crestar Warehouse Intelligence Suite.

Fetches live traffic incidents from the LTA DataMall REST API, classifies
severity, maps incidents to Singapore delivery districts, and converts
lat/lng to approximate SVG coordinates for the route optimisation map.

Endpoint:
    GET https://datamall2.mytransport.sg/ltaodataservice/TrafficIncidents
"""

from datetime import datetime, timezone

import httpx

# ─── Config ────────────────────────────────────────────────────────────────────

LTA_URL = "https://datamall2.mytransport.sg/ltaodataservice/TrafficIncidents"
LTA_KEY = "VeEnkxeVRBKILoo0EfARYQ=="

# ─── Severity classification ───────────────────────────────────────────────────

_SEVERITY: dict[str, str] = {
    "Accident":            "heavy",
    "Road Closure":        "heavy",
    "Bus Accident":        "heavy",
    "Vehicle Breakdown":   "moderate",
    "Road Works":          "moderate",
    "Traffic Light Fault": "moderate",
    "Obstacle":            "moderate",
    "Weather":             "moderate",
    "Other":               "moderate",
}

# ─── District keyword mapping ──────────────────────────────────────────────────
# Keys are district names used in the delivery schedule.
# Values are lowercase keyword fragments matched against the LTA Message field.

_DISTRICTS: dict[str, list[str]] = {
    "Tuas":         ["tuas", "jalan bahar", "pioneer rd", "pioneer road"],
    "Jurong West":  ["jurong west", "boon lay", "hong kah", "corporation rd"],
    "Jurong East":  ["jurong east", "jurong gateway", "jurong town hall", "ayer rajah"],
    "Clementi":     ["clementi", "west coast", "west coast highway"],
    "Buona Vista":  ["buona vista", "one-north", "north buona vista", "south buona vista", "vista exchange"],
    "Queenstown":   ["queenstown", "margaret drive", "dover", "ghim moh", "commonwealth ave", "dawson"],
    "CBD":          ["raffles", "shenton", "robinson", "marina", "anson", "harbour", "market st",
                     "cross st", "south bridge", "boat quay", "chinatown"],
    "Orchard":      ["orchard", "somerset", "scotts", "grange rd", "tanglin rd"],
    "Toa Payoh":    ["toa payoh", "lor 1 toa payoh", "lor 2 toa payoh", "lor 3 toa payoh",
                     "lor 4 toa payoh", "lor 5 toa payoh", "lor 6 toa payoh", "lor 7 toa payoh",
                     "lor 8 toa payoh", "kim keat"],
    "Bishan":       ["bishan", "marymount", "sin ming", "braddell"],
    "Ang Mo Kio":   ["ang mo kio", "amk ave", "lentor", "yio chu kang"],
    "Tampines":     ["tampines", "simei", "pasir ris", "loyang", "changi south"],
    "Changi":       ["changi", "expo", "upper changi"],
    "Woodlands":    ["woodlands", "marsiling", "admiralty", "kranji"],
    "Yishun":       ["yishun", "sembawang", "canberra"],
    "Sengkang":     ["sengkang", "punggol", "hougang", "serangoon north"],
    "Bedok":        ["bedok", "tanah merah", "kembangan", "upper east coast"],
    "Kallang":      ["kallang", "geylang", "aljunied", "paya lebar", "eunos"],
    "Novena":       ["novena", "thomson", "newton", "balestier"],
}

# ─── SVG coordinate mapping ────────────────────────────────────────────────────
# The route map uses a hand-crafted SVG viewBox "0 0 100 78".
# Calibrated from two known points:
#   Tuas warehouse  lat=1.321, lng=103.638 → SVG (8, 62)
#   Bishan          lat=1.350, lng=103.849 → SVG (60, 28)
#
# Derived linear transform:
#   x = (lng − 103.638) × 246.4 + 8
#   y = 62 − (lat − 1.321) × 1172.4

def _to_svg(lat: float, lng: float) -> tuple[float, float]:
    x = (lng - 103.638) * 246.4 + 8.0
    y = 62.0 - (lat - 1.321) * 1172.4
    return round(max(3.0, min(97.0, x)), 1), round(max(3.0, min(75.0, y)), 1)


def _classify_district(message: str) -> str:
    text = message.lower()
    for district, keywords in _DISTRICTS.items():
        if any(kw in text for kw in keywords):
            return district
    return "Other"


# ─── Main public function ──────────────────────────────────────────────────────

def get_incidents() -> list[dict]:
    """
    Fetch live traffic incidents from LTA DataMall.

    Returns a list of dicts:
    {
        type        — LTA incident type string
        severity    — "heavy" | "moderate"
        message     — raw LTA message (contains road name + description)
        latitude    — float
        longitude   — float
        svg_x       — approximate SVG x coordinate (0–100 scale)
        svg_y       — approximate SVG y coordinate (0–78 scale)
        district    — matched Singapore delivery district, or "Other"
    }

    Returns an empty list if the API is unreachable.
    """
    try:
        resp = httpx.get(
            LTA_URL,
            headers={"AccountKey": LTA_KEY, "accept": "application/json"},
            timeout=8,
        )
        resp.raise_for_status()
        raw = resp.json().get("value", [])
    except Exception as exc:
        print(f"[lta] API fetch failed: {exc}")
        return []

    incidents: list[dict] = []
    for item in raw:
        lat = float(item.get("Latitude")  or 0)
        lng = float(item.get("Longitude") or 0)
        if lat == 0.0 and lng == 0.0:
            continue

        inc_type = item.get("Type", "Other")
        message  = item.get("Message", "")
        svg_x, svg_y = _to_svg(lat, lng)

        incidents.append({
            "type":      inc_type,
            "severity":  _SEVERITY.get(inc_type, "moderate"),
            "message":   message,
            "latitude":  lat,
            "longitude": lng,
            "svg_x":     svg_x,
            "svg_y":     svg_y,
            "district":  _classify_district(message),
        })

    return incidents


# ─── Delivery-district affected flag ──────────────────────────────────────────

def get_affected_districts(incidents: list[dict]) -> dict[str, str]:
    """
    Reduce incidents to a dict of {district: worst_severity}.
    Useful for quickly checking whether a delivery district is affected.
    """
    result: dict[str, str] = {}
    for inc in incidents:
        d = inc["district"]
        if d == "Other":
            continue
        existing = result.get(d)
        if not existing or inc["severity"] == "heavy":
            result[d] = inc["severity"]
    return result


# ─── CLI self-test ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Fetching live LTA traffic incidents…")
    incs = get_incidents()
    print(f"  {len(incs)} incidents returned.")
    affected = get_affected_districts(incs)
    if affected:
        print("  Affected delivery districts:")
        for d, s in affected.items():
            print(f"    {d:<20} {s}")
    else:
        print("  No known delivery districts currently affected.")
    print("\nFirst 5 incidents:")
    for inc in incs[:5]:
        print(f"  [{inc['severity'].upper():<8}] {inc['type']:<22} district={inc['district']:<18} svg=({inc['svg_x']},{inc['svg_y']})")
        print(f"             {inc['message'][:90]}")
