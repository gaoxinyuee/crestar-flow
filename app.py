import streamlit as st
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
import requests

# ─── Brand Colors ──────────────────────────────────────────────────────────────
PURPLE    = "#6B2D7B"
MAGENTA   = "#D4145A"
DARK_BLUE = "#1A1F71"
GREEN     = "#16a34a"
AMBER     = "#d97706"
RED_COL   = "#dc2626"

CAT_COLORS = {
    "Fan Blades":        PURPLE,
    "Motor Components":  "#f59e0b",
    "Housing Parts":     DARK_BLUE,
    "Wiring Kits":       "#10b981",
    "Misc Hardware":     "#6b7280",
}

# ─── Page Config ───────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Crestar Warehouse Intelligence Suite",
    page_icon="🏭",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ─── Custom CSS ────────────────────────────────────────────────────────────────
st.markdown(f"""
<style>
    /* Sidebar */
    [data-testid="stSidebar"] {{
        background-color: {DARK_BLUE} !important;
    }}
    [data-testid="stSidebar"] p,
    [data-testid="stSidebar"] label,
    [data-testid="stSidebar"] .stMarkdown,
    [data-testid="stSidebar"] span {{
        color: rgba(255,255,255,0.85) !important;
    }}
    [data-testid="stSidebar"] hr {{
        border-color: rgba(255,255,255,0.15);
    }}
    /* Hide Streamlit footer */
    #MainMenu, footer {{ visibility: hidden; }}
    /* Metric cards */
    [data-testid="metric-container"] {{
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 1rem;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }}
    /* Status badges */
    .badge-healthy {{
        background: #dcfce7; color: #16a34a;
        padding: 3px 10px; border-radius: 20px;
        font-size: 12px; font-weight: 700;
        border: 1px solid #86efac; display: inline-block;
    }}
    .badge-low {{
        background: #fef3c7; color: #d97706;
        padding: 3px 10px; border-radius: 20px;
        font-size: 12px; font-weight: 700;
        border: 1px solid #fcd34d; display: inline-block;
    }}
    .badge-critical {{
        background: #fee2e2; color: #dc2626;
        padding: 3px 10px; border-radius: 20px;
        font-size: 12px; font-weight: 700;
        border: 1px solid #fca5a5; display: inline-block;
    }}
    /* Alert boxes */
    .alert-critical {{
        background: #fee2e2; border-left: 4px solid {RED_COL};
        padding: 10px 14px; border-radius: 6px; margin: 4px 0;
    }}
    .alert-low {{
        background: #fef3c7; border-left: 4px solid {AMBER};
        padding: 10px 14px; border-radius: 6px; margin: 4px 0;
    }}
    /* Section label */
    .section-label {{
        font-size: 11px; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.1em;
        color: {MAGENTA}; margin-bottom: 4px;
    }}
    /* Rec card */
    .rec-card {{
        border-radius: 10px; padding: 14px; margin-bottom: 10px;
    }}
    /* Zone chip */
    .zone-chip {{
        display: inline-block; background: #f1f5f9;
        border: 1px solid #e2e8f0; border-radius: 6px;
        padding: 2px 8px; font-family: monospace;
        font-size: 13px; font-weight: 600;
    }}
</style>
""", unsafe_allow_html=True)


# ─── Data ──────────────────────────────────────────────────────────────────────

@st.cache_data
def load_inventory():
    rows = [
        {"Part": "FBL-042", "Description": 'Fan Blade 16" 3-blade ABS',    "Category": "Fan Blades",   "Zone": "A", "Bin": "A-3-2", "Qty": 24, "Reorder": 10, "Status": "Healthy",  "Updated": "Today"},
        {"Part": "FBL-055", "Description": 'Fan Blade 18" 5-blade PP',     "Category": "Fan Blades",   "Zone": "A", "Bin": "A-1-4", "Qty": 11, "Reorder": 10, "Status": "Healthy",  "Updated": "Today"},
        {"Part": "FBL-038", "Description": 'Fan Blade 14" 3-blade ABS',    "Category": "Fan Blades",   "Zone": "B", "Bin": "B-2-1", "Qty":  4, "Reorder": 10, "Status": "Critical", "Updated": "Yesterday"},
        {"Part": "MTR-018", "Description": "Motor 45W DC",                  "Category": "Motors",       "Zone": "C", "Bin": "C-1-3", "Qty":  3, "Reorder":  8, "Status": "Critical", "Updated": "Today"},
        {"Part": "MTR-024", "Description": "Motor 60W AC",                  "Category": "Motors",       "Zone": "C", "Bin": "C-2-1", "Qty": 14, "Reorder":  8, "Status": "Healthy",  "Updated": "2 days ago"},
        {"Part": "CSG-011", "Description": 'Casing Standard 16" White',    "Category": "Casings",      "Zone": "D", "Bin": "D-1-2", "Qty": 22, "Reorder": 12, "Status": "Healthy",  "Updated": "Yesterday"},
        {"Part": "CSG-019", "Description": 'Casing Slim 18" Matte Black',  "Category": "Casings",      "Zone": "D", "Bin": "D-3-4", "Qty":  7, "Reorder": 12, "Status": "Low",      "Updated": "3 days ago"},
        {"Part": "WKT-009", "Description": "Wiring Kit Standard 3-speed",  "Category": "Wiring Kits",  "Zone": "B", "Bin": "B-2-3", "Qty":  5, "Reorder": 15, "Status": "Low",      "Updated": "Today"},
        {"Part": "WKT-014", "Description": "Wiring Kit Premium 5-speed",   "Category": "Wiring Kits",  "Zone": "E", "Bin": "E-1-1", "Qty":  2, "Reorder": 15, "Status": "Critical", "Updated": "Today"},
        {"Part": "FBL-067", "Description": 'Fan Blade 16" 5-blade Metal',  "Category": "Fan Blades",   "Zone": "A", "Bin": "A-4-3", "Qty": 18, "Reorder": 10, "Status": "Healthy",  "Updated": "Yesterday"},
        {"Part": "FBL-071", "Description": 'Fan Blade 16" 5-blade PP',     "Category": "Fan Blades",   "Zone": "A", "Bin": "A-3-5", "Qty":  8, "Reorder": 10, "Status": "Healthy",  "Updated": "2 days ago"},
        {"Part": "MTR-031", "Description": "Motor 35W DC Quiet Series",    "Category": "Motors",       "Zone": "C", "Bin": "C-3-2", "Qty":  9, "Reorder":  8, "Status": "Healthy",  "Updated": "3 days ago"},
        {"Part": "CSG-027", "Description": 'Casing Premium 20" Brushed',   "Category": "Casings",      "Zone": "D", "Bin": "D-2-1", "Qty":  3, "Reorder": 12, "Status": "Critical", "Updated": "Yesterday"},
        {"Part": "WKT-021", "Description": "Wiring Kit Standard 5-speed",  "Category": "Wiring Kits",  "Zone": "E", "Bin": "E-2-3", "Qty":  6, "Reorder": 15, "Status": "Low",      "Updated": "Today"},
        {"Part": "FBL-049", "Description": 'Fan Blade 20" 5-blade ABS',    "Category": "Fan Blades",   "Zone": "F", "Bin": "F-1-2", "Qty": 31, "Reorder": 10, "Status": "Healthy",  "Updated": "4 days ago"},
    ]
    return pd.DataFrame(rows)


@st.cache_data
def load_warehouse_units():
    """90 storage units across 6 zones A–F, mirroring the React warehouse-data.ts"""
    fan_list = (
        [{"variant": "Wooden Blades 52-inch", "name": 'Fan Blade 52" Wooden', "sku": "FB-W52", "qty": 4,  "cat": "Fan Blades"}] * 5 +
        [{"variant": "Wooden Blades 46-inch", "name": 'Fan Blade 46" Wooden', "sku": "FB-W46", "qty": 6,  "cat": "Fan Blades"}] * 5 +
        [{"variant": "Metal Blades 52-inch",  "name": 'Fan Blade 52" Metal',  "sku": "FB-M52", "qty": 8,  "cat": "Fan Blades"}] * 4 +
        [{"variant": "Metal Blades 46-inch",  "name": 'Fan Blade 46" Metal',  "sku": "FB-M46", "qty": 5,  "cat": "Fan Blades"}] * 3 +
        [{"variant": "Plastic Blades 36-inch","name": 'Fan Blade 36" Plastic',"sku": "FB-P36", "qty": 12, "cat": "Fan Blades"}] * 3
    )
    motor_list = (
        [{"variant": "Motor Unit Type-A", "name": "Motor Unit Type-A",    "sku": "MT-A",   "qty":  3, "cat": "Motor Components"}] * 10 +
        [{"variant": "Motor Unit Type-B", "name": "Motor Unit Type-B",    "sku": "MT-B",   "qty":  6, "cat": "Motor Components"}] * 5 +
        [{"variant": "Motor Capacitor",   "name": "Motor Capacitor 4uF",  "sku": "MT-CAP", "qty": 24, "cat": "Motor Components"}] * 3
    )
    housing_list = (
        [{"variant": "Housing Casing L",  "name": "Housing Casing L",       "sku": "HC-L",  "qty":  4, "cat": "Housing Parts"}] * 8 +
        [{"variant": "Housing Casing M",  "name": "Housing Casing M",       "sku": "HC-M",  "qty":  5, "cat": "Housing Parts"}] * 6 +
        [{"variant": "Mounting Bracket",  "name": "Ceiling Mount Bracket",  "sku": "HC-MB", "qty": 12, "cat": "Housing Parts"}] * 4
    )
    wiring_list = (
        [{"variant": "Wiring Kit Standard",  "name": "Wiring Kit Standard", "sku": "WK-S",  "qty":  3, "cat": "Wiring Kits"}] * 8 +
        [{"variant": "Wiring Kit Premium",   "name": "Wiring Kit Premium",  "sku": "WK-P",  "qty":  4, "cat": "Wiring Kits"}] * 5 +
        [{"variant": "Remote Control Module","name": "RF Remote Module",    "sku": "WK-RF", "qty":  9, "cat": "Wiring Kits"}] * 3
    )
    misc_list = (
        [{"variant": "Screw Pack M6", "name": "Screw Pack M6 (50pc)", "sku": "MS-S6", "qty": 30, "cat": "Misc Hardware"}] * 8 +
        [{"variant": "Pull Chain",    "name": "Brass Pull Chain",      "sku": "MS-PC", "qty": 14, "cat": "Misc Hardware"}] * 6 +
        [{"variant": "Light Globe",   "name": "LED Light Globe",       "sku": "MS-LG", "qty":  8, "cat": "Misc Hardware"}] * 4
    )

    plan = (fan_list + motor_list + housing_list + wiring_list + misc_list)[:90]
    zones = ["A", "B", "C", "D", "E", "F"]

    records = []
    for i, p in enumerate(plan):
        zone_idx = i // 15
        within   = i % 15
        cell_col = within % 5
        cell_row = within // 5
        zr = zone_idx // 2   # zone grid row (0,1,2)
        zc = zone_idx % 2    # zone grid col (0,1)
        x = zc * 7 + cell_col
        y = zr * 4 + cell_row   # 4-unit gap between zone rows
        zone  = zones[zone_idx]
        shelf = chr(65 + (cell_col % 5))
        records.append({
            "id":       f"{zone}-{i}",
            "sku":      f"{p['sku']}-{str(100 + i).zfill(3)}",
            "name":     p["name"],
            "variant":  p["variant"],
            "category": p["cat"],
            "zone":     zone,
            "level":    cell_row + 1,
            "shelf":    shelf,
            "qty":      p["qty"],
            "x":        x,
            "y":        y,
        })
    return pd.DataFrame(records)


@st.cache_data
def load_forecast_data():
    months = [
        "Jan 24","Feb 24","Mar 24","Apr 24","May 24","Jun 24",
        "Jul 24","Aug 24","Sep 24","Oct 24","Nov 24","Dec 24",
        "Jan 25","Feb 25","Mar 25",
    ]
    series = {
        'Fan Blade 52" Wooden': [14,16,13,18,20,17,19,22,21,24,23,25,22,24,27],
        'Fan Blade 46" Metal':  [10,11,12,12,14,15,13,14,16,15,17,16,15,14,16],
        "Motor Unit Type-A":    [12,13,15,14,16,18,17,19,18,20,19,21,19,20,22],
        "Housing Casing L":     [18,17,19,20,21,19,22,20,23,21,22,24,20,21,23],
        "Wiring Kit Standard":  [ 9,10,11,13,12,14,15,14,16,15,17,16,18,17,19],
    }
    fc_low  = [None]*12 + [18, 19, 22]
    fc_high = [None]*12 + [26, 28, 32]

    rows = []
    for i, m in enumerate(months):
        row = {"Month": m, "isForecast": i >= 12, "FC_Low": fc_low[i], "FC_High": fc_high[i]}
        for k, v in series.items():
            row[k] = v[i]
        rows.append(row)
    return pd.DataFrame(rows)


REORDER_RECS = [
    {"name": 'Fan Blade 52" Wooden', "sku": "FB-W52", "stock":  5, "forecast": 22, "order": 20, "urgency": "critical", "trend": [14,16,18,20,22,25,22]},
    {"name": 'Fan Blade 46" Metal',  "sku": "FB-M46", "stock": 18, "forecast": 15, "order":  0, "urgency": "healthy",  "trend": [12,14,15,14,16,15,14]},
    {"name": "Motor Unit Type-A",    "sku": "MT-A",   "stock":  8, "forecast": 19, "order": 15, "urgency": "critical", "trend": [12,15,17,18,20,21,20]},
    {"name": "Housing Casing L",     "sku": "HC-L",   "stock": 24, "forecast": 20, "order":  0, "urgency": "healthy",  "trend": [18,20,21,22,21,24,21]},
    {"name": "Wiring Kit Standard",  "sku": "WK-S",   "stock": 11, "forecast": 18, "order": 10, "urgency": "low",      "trend": [10,12,13,15,16,16,18]},
]


# ─── Helpers ───────────────────────────────────────────────────────────────────

def call_ollama(messages, model="llama3"):
    try:
        resp = requests.post(
            "http://localhost:11434/api/chat",
            json={"model": model, "messages": messages, "stream": False},
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json()["message"]["content"]
    except requests.exceptions.ConnectionError:
        return (
            "**Cannot connect to Ollama.**\n\n"
            "Make sure Ollama is running locally:\n"
            "```\nollama serve\n```\n"
            "And that the selected model is pulled:\n"
            "```\nollama pull llama3\n```"
        )
    except Exception as e:
        return f"Error calling Ollama: {e}"


# ─── Sidebar ───────────────────────────────────────────────────────────────────

with st.sidebar:
    st.markdown(f"""
    <div style="display:flex;align-items:center;gap:10px;
                padding:0.25rem 0 1.25rem 0;
                border-bottom:1px solid rgba(255,255,255,0.15);
                margin-bottom:1rem">
        <div style="width:40px;height:40px;border-radius:8px;
                    background:{MAGENTA};display:flex;align-items:center;
                    justify-content:center;font-size:20px;flex-shrink:0">🏭</div>
        <div>
            <div style="font-weight:700;letter-spacing:0.08em;
                        color:white;font-size:15px">CRESTAR</div>
            <div style="font-size:10px;letter-spacing:0.12em;
                        color:rgba(255,255,255,0.5);text-transform:uppercase">
                Intelligence Suite
            </div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    page = st.radio(
        "Navigation",
        ["Home", "Warehouse View", "Demand Forecast", "Inventory", "AI Chatbot"],
        label_visibility="collapsed",
    )

    st.markdown("---")
    st.markdown("""
    <div style="font-size:11px;color:rgba(255,255,255,0.4);line-height:1.6">
        v2.4.1 &nbsp;·&nbsp; Tuas HQ<br>
        17,000 sq ft &nbsp;·&nbsp; 6 Zones<br>
        <span style="color:rgba(255,255,255,0.25)">Powered by Ollama / Llama 3</span>
    </div>
    """, unsafe_allow_html=True)


# ─── Page: Home ────────────────────────────────────────────────────────────────

def page_home():
    st.markdown('<p class="section-label">Overview</p>', unsafe_allow_html=True)
    st.title("Crestar Warehouse Intelligence Suite")
    st.markdown(
        f"**Tuas HQ** &nbsp;·&nbsp; 17,000 sq ft &nbsp;·&nbsp; 6 Zones &nbsp;·&nbsp; "
        f'<span style="color:{GREEN};font-weight:600">● ONLINE</span> &nbsp;·&nbsp; Last sync 24 sec ago',
        unsafe_allow_html=True,
    )

    st.markdown("---")

    # ── Key metrics ──────────────────────────────────────────────────────────
    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Total SKUs",       "90",     "6 active zones")
    c2.metric("Units On Hand",    "195",    "+12 today")
    c3.metric("Stockout Alerts",  "3",      delta="-1 resolved", delta_color="inverse")
    c4.metric("Low Stock Items",  "4",      "Order soon")
    c5.metric("Capacity Used",    "94%",    "of 17,000 sq ft")

    st.markdown("---")

    col_left, col_right = st.columns([3, 2])

    # ── Zone overview table ───────────────────────────────────────────────
    with col_left:
        st.subheader("Zone Breakdown")
        zone_df = pd.DataFrame([
            {"Zone": "A", "Area Focus": "Fan Blades",          "Units On Hand": 61, "SKUs": 5, "Status": "Healthy"},
            {"Zone": "B", "Area Focus": "Fan Blades / Wiring", "Units On Hand": 14, "SKUs": 3, "Status": "Low"},
            {"Zone": "C", "Area Focus": "Motors",              "Units On Hand": 26, "SKUs": 3, "Status": "Critical"},
            {"Zone": "D", "Area Focus": "Casings",             "Units On Hand": 32, "SKUs": 3, "Status": "Critical"},
            {"Zone": "E", "Area Focus": "Wiring Kits",         "Units On Hand":  8, "SKUs": 2, "Status": "Critical"},
            {"Zone": "F", "Area Focus": "Fan Blades",          "Units On Hand": 31, "SKUs": 1, "Status": "Healthy"},
        ])

        def _row_color(row):
            s = row["Status"]
            color = "#fee2e2" if s == "Critical" else "#fef3c7" if s == "Low" else "#f0fdf4"
            return [f"background-color:{color}"] * len(row)

        st.dataframe(
            zone_df.style.apply(_row_color, axis=1),
            use_container_width=True,
            hide_index=True,
        )

    # ── Donut chart ────────────────────────────────────────────────────────
    with col_right:
        st.subheader("Stock by Category")
        fig_pie = px.pie(
            names=["Fan Blades", "Motors", "Housing Parts", "Wiring Kits", "Misc Hardware"],
            values=[72, 45, 51, 37, 52],
            color_discrete_sequence=[PURPLE, MAGENTA, DARK_BLUE, "#10b981", "#6b7280"],
            hole=0.45,
        )
        fig_pie.update_traces(textposition="inside", textinfo="percent+label")
        fig_pie.update_layout(
            margin=dict(t=10, b=10, l=10, r=10),
            showlegend=False,
            height=270,
        )
        st.plotly_chart(fig_pie, use_container_width=True)

    st.markdown("---")

    # ── Active alerts ─────────────────────────────────────────────────────
    st.subheader("Active Alerts")
    alerts = [
        ("critical", "FBL-038 — Fan Blade 14\" 3-blade ABS",    "Zone B · Bin B-2-1 · Qty: 4 (Reorder: 10) — ORDER NOW"),
        ("critical", "MTR-018 — Motor 45W DC",                   "Zone C · Bin C-1-3 · Qty: 3 (Reorder: 8) — ORDER NOW"),
        ("critical", "WKT-014 — Wiring Kit Premium 5-speed",     "Zone E · Bin E-1-1 · Qty: 2 (Reorder: 15) — ORDER NOW"),
        ("low",      "CSG-019 — Casing Slim 18\" Matte Black",   "Zone D · Bin D-3-4 · Qty: 7 (Reorder: 12) — Order this week"),
        ("low",      "WKT-009 — Wiring Kit Standard 3-speed",    "Zone B · Bin B-2-3 · Qty: 5 (Reorder: 15) — Order this week"),
    ]
    for level, title, detail in alerts:
        icon = "🔴" if level == "critical" else "🟡"
        css  = "alert-critical" if level == "critical" else "alert-low"
        st.markdown(
            f'<div class="{css}"><strong>{icon} {title}</strong><br>'
            f'<span style="font-size:13px;color:#475569">{detail}</span></div>',
            unsafe_allow_html=True,
        )

    st.markdown("---")

    # ── Estimated order value callout ─────────────────────────────────────
    cta1, cta2, cta3 = st.columns([3, 1, 1])
    with cta1:
        st.info("**3 parts require immediate action.** Auto-generated at 06:00 SGT. Estimated total order value: **SGD 4,280**.")
    with cta2:
        st.metric("Purchase Orders", "Ready", "3 drafts")
    with cta3:
        st.markdown("<br>", unsafe_allow_html=True)
        if st.button("Draft Purchase Orders", type="primary", use_container_width=True):
            st.success("Purchase orders drafted (demo mode).")


# ─── Page: Warehouse View ───────────────────────────────────────────────────────

def page_warehouse():
    st.markdown('<p class="section-label">Digital Twin</p>', unsafe_allow_html=True)
    st.title("Warehouse Floor — Tuas HQ")
    st.markdown("Live view of **90 storage units** across **6 zones** · Last sync 12 sec ago &nbsp; "
                f'<span style="color:{GREEN};font-weight:600">● 94% capacity utilised</span>',
                unsafe_allow_html=True)

    df = load_warehouse_units()

    # ── Filters ──────────────────────────────────────────────────────────
    fc1, fc2, fc3 = st.columns([3, 2, 2])
    with fc1:
        search = st.text_input(
            "Search",
            placeholder='e.g. "Walnut Brown", "Motor Type-A", "FB-W52"',
            label_visibility="collapsed",
        )
    with fc2:
        cats = ["All Categories"] + sorted(df["category"].unique().tolist())
        cat_filter = st.selectbox("Category", cats, key="wh_cat")
    with fc3:
        zone_opts = ["All Zones"] + sorted(df["zone"].unique().tolist())
        zone_filter = st.selectbox("Zone", zone_opts, key="wh_zone")

    # Apply filters
    filt = df.copy()
    if search:
        q = search.lower()
        filt = filt[
            filt["name"].str.lower().str.contains(q, na=False)
            | filt["sku"].str.lower().str.contains(q, na=False)
            | filt["variant"].str.lower().str.contains(q, na=False)
        ]
    if cat_filter != "All Categories":
        filt = filt[filt["category"] == cat_filter]
    if zone_filter != "All Zones":
        filt = filt[filt["zone"] == zone_filter]

    # ── Floor legend ─────────────────────────────────────────────────────
    legend_cols = st.columns(len(CAT_COLORS))
    for col, (cat, color) in zip(legend_cols, CAT_COLORS.items()):
        col.markdown(
            f'<div style="display:flex;align-items:center;gap:6px;font-size:12px">'
            f'<span style="width:12px;height:12px;border-radius:3px;background:{color};display:inline-block"></span>'
            f'{cat}</div>',
            unsafe_allow_html=True,
        )

    st.caption(f"Showing **{len(filt)}** of 90 storage units — click any unit for details")

    # ── Plotly warehouse floor ────────────────────────────────────────────
    fig = go.Figure()

    # Zone background rectangles and labels
    zone_layout = {
        "A": (0, 0), "B": (7, 0),
        "C": (0, 4), "D": (7, 4),
        "E": (0, 8), "F": (7, 8),
    }
    zone_focus = {
        "A": "Fan Blades", "B": "Fan Blades / Wiring",
        "C": "Motors",     "D": "Casings",
        "E": "Wiring Kits","F": "Fan Blades",
    }

    for zname, (zx, zy) in zone_layout.items():
        fig.add_shape(
            type="rect",
            x0=zx - 0.65, y0=zy - 0.55,
            x1=zx + 4.65, y1=zy + 2.55,
            fillcolor="rgba(241,245,249,0.7)",
            line=dict(color="#cbd5e1", width=1.5),
            layer="below",
        )
        fig.add_annotation(
            x=zx + 2, y=zy + 2.7,
            text=f"<b>Zone {zname}</b>  <span style='font-weight:400;font-size:10px'>{zone_focus[zname]}</span>",
            showarrow=False,
            font=dict(size=11, color=DARK_BLUE),
            xanchor="center", yanchor="bottom",
        )

    # Dim non-matching units
    dim = df[~df["id"].isin(filt["id"])]
    if len(dim):
        fig.add_trace(go.Scatter(
            x=dim["x"], y=dim["y"],
            mode="markers",
            marker=dict(size=18, color="rgba(203,213,225,0.4)", symbol="square"),
            hoverinfo="skip",
            showlegend=False,
        ))

    # Highlighted units per category
    for cat, color in CAT_COLORS.items():
        cat_df = filt[filt["category"] == cat]
        if len(cat_df) == 0:
            continue
        hover = cat_df.apply(
            lambda r: (
                f"<b>{r['name']}</b><br>"
                f"SKU: {r['sku']}<br>"
                f"Variant: {r['variant']}<br>"
                f"Zone {r['zone']} &nbsp;·&nbsp; Shelf {r['shelf']} &nbsp;·&nbsp; Level {r['level']}<br>"
                f"Qty on hand: <b>{r['qty']}</b>"
            ),
            axis=1,
        )
        fig.add_trace(go.Scatter(
            x=cat_df["x"], y=cat_df["y"],
            mode="markers",
            marker=dict(
                size=20, color=color, symbol="square",
                line=dict(color="white", width=1.5),
            ),
            name=cat,
            text=hover,
            hovertemplate="%{text}<extra></extra>",
        ))

    fig.update_layout(
        height=520,
        paper_bgcolor="white",
        plot_bgcolor="#f8fafc",
        margin=dict(t=30, b=10, l=10, r=10),
        xaxis=dict(showgrid=False, zeroline=False, showticklabels=False, range=[-1.2, 13]),
        yaxis=dict(showgrid=False, zeroline=False, showticklabels=False, range=[-1, 12]),
        showlegend=False,
    )

    st.plotly_chart(fig, use_container_width=True)

    # ── Detail table (collapsible) ────────────────────────────────────────
    with st.expander(f"Show unit details ({len(filt)} units)"):
        display = filt[["sku","name","variant","category","zone","shelf","level","qty"]].rename(columns={
            "sku": "SKU", "name": "Name", "variant": "Variant",
            "category": "Category", "zone": "Zone",
            "shelf": "Shelf", "level": "Level", "qty": "Qty On Hand",
        })
        st.dataframe(display, use_container_width=True, hide_index=True)


# ─── Page: Demand Forecast ──────────────────────────────────────────────────────

def page_forecast():
    st.markdown('<p class="section-label">Predictive Analytics</p>', unsafe_allow_html=True)
    st.title("Demand Forecast & Purchasing Recommendations")
    st.markdown("12 months of order history &nbsp;·&nbsp; 3-month forecast horizon &nbsp;·&nbsp; Updated daily")

    df = load_forecast_data()

    col_chart, col_recs = st.columns([3, 2], gap="large")

    # ── Demand chart ─────────────────────────────────────────────────────
    with col_chart:
        st.subheader("12-Month Order Volume — Top 5 Parts")
        st.caption("Solid = actual &nbsp;·&nbsp; Dashed = AI forecast &nbsp;·&nbsp; Shaded = 95% confidence interval")

        line_colors = {
            'Fan Blade 52" Wooden': PURPLE,
            'Fan Blade 46" Metal':  DARK_BLUE,
            "Motor Unit Type-A":    MAGENTA,
            "Housing Casing L":     "#f59e0b",
            "Wiring Kit Standard":  "#6b7280",
        }

        hist_df = df[~df["isForecast"]]
        fc_df   = df[df["isForecast"]]

        fig = go.Figure()

        # 95% CI shading for Fan Blade 52" Wooden
        x_ci = fc_df["Month"].tolist()
        y_hi = fc_df["FC_High"].tolist()
        y_lo = fc_df["FC_Low"].tolist()
        fig.add_trace(go.Scatter(
            x=x_ci + x_ci[::-1],
            y=y_hi + y_lo[::-1],
            fill="toself",
            fillcolor=f"rgba(107,45,123,0.12)",
            line=dict(color="rgba(0,0,0,0)"),
            showlegend=True,
            name="95% CI (Fan Blade 52\" Wooden)",
            hoverinfo="skip",
        ))

        for part, color in line_colors.items():
            is_primary = 'Wooden' in part
            # Historical (solid line)
            fig.add_trace(go.Scatter(
                x=hist_df["Month"],
                y=hist_df[part],
                mode="lines",
                line=dict(color=color, width=2.8 if is_primary else 1.8),
                name=part,
                legendgroup=part,
            ))
            # Forecast (dashed) — connect from last historical point
            bridge = pd.concat([hist_df.tail(1), fc_df])
            fig.add_trace(go.Scatter(
                x=bridge["Month"],
                y=bridge[part],
                mode="lines",
                line=dict(color=color, width=2.2 if is_primary else 1.6, dash="dash"),
                showlegend=False,
                legendgroup=part,
                hoverinfo="skip",
            ))

        # Vertical divider at forecast boundary (index 11.5 = between Dec 24 and Jan 25)
        fig.add_vline(
            x=11.5,
            line_dash="dot",
            line_color="#94a3b8",
            line_width=1.5,
            annotation_text="  Forecast →",
            annotation_position="top right",
            annotation_font=dict(size=10, color="#64748b"),
        )

        fig.update_layout(
            height=400,
            paper_bgcolor="white",
            plot_bgcolor="#f8fafc",
            margin=dict(t=10, b=40, l=10, r=10),
            xaxis=dict(title=None, tickfont=dict(size=10), tickangle=-30),
            yaxis=dict(title="Units ordered", tickfont=dict(size=10)),
            legend=dict(
                orientation="h", y=-0.22, x=0.5, xanchor="center",
                font=dict(size=10), bgcolor="rgba(0,0,0,0)",
            ),
            hovermode="x unified",
        )
        st.plotly_chart(fig, use_container_width=True)

    # ── Reorder recommendations ──────────────────────────────────────────
    with col_recs:
        st.subheader("Reorder Recommendations")
        st.caption("5 parts analysed · Forecast horizon: 30 days")

        for rec in REORDER_RECS:
            urgency = rec["urgency"]
            if urgency == "critical":
                border = RED_COL; bg = "#fff5f5"; label = "🔴 Order Now"
            elif urgency == "low":
                border = AMBER;   bg = "#fffbeb"; label = "🟡 Order This Week"
            else:
                border = GREEN;   bg = "#f0fdf4"; label = "✅ Stock Sufficient"

            trend_up  = rec["trend"][-1] > rec["trend"][0]
            trend_txt = "↑ Demand rising" if trend_up else "↓ Demand easing"
            trend_col = RED_COL if trend_up else GREEN

            # Sparkline SVG
            td = rec["trend"]
            mn, mx = min(td), max(td)
            rng = mx - mn or 1
            W, H = 72, 22
            pts = " ".join(
                f"{round((i/(len(td)-1))*W,1)},{round(H - ((v-mn)/rng)*H, 1)}"
                for i, v in enumerate(td)
            )
            spark = (
                f'<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
                f'style="overflow:visible">'
                f'<polyline points="{pts}" fill="none" stroke="{border}" '
                f'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
                f'</svg>'
            )

            st.markdown(f"""
<div style="border:1px solid {border};border-radius:10px;padding:14px;
            margin-bottom:10px;background:{bg}">
    <div style="display:flex;justify-content:space-between;
                align-items:flex-start;margin-bottom:10px">
        <div>
            <div style="font-weight:700;font-size:14px">{rec['name']}</div>
            <code style="font-size:11px;color:#64748b">{rec['sku']}</code>
        </div>
        <span style="font-size:11px;font-weight:700;
                     background:{bg};border:1px solid {border};
                     padding:3px 9px;border-radius:20px;color:{border};
                     white-space:nowrap">{label}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;
                margin-bottom:10px">
        <div style="background:white;border-radius:6px;padding:8px;text-align:center;
                    border:1px solid #e2e8f0">
            <div style="font-size:10px;color:#64748b;text-transform:uppercase;
                        letter-spacing:.05em">Stock</div>
            <div style="font-weight:700;font-size:18px">{rec['stock']}</div>
        </div>
        <div style="background:white;border-radius:6px;padding:8px;text-align:center;
                    border:1px solid #e2e8f0">
            <div style="font-size:10px;color:#64748b;text-transform:uppercase;
                        letter-spacing:.05em">Forecast</div>
            <div style="font-weight:700;font-size:18px">{rec['forecast']}</div>
        </div>
        <div style="background:white;border-radius:6px;padding:8px;text-align:center;
                    border:1px solid #e2e8f0">
            <div style="font-size:10px;color:#64748b;text-transform:uppercase;
                        letter-spacing:.05em">Order Qty</div>
            <div style="font-weight:700;font-size:18px;
                        color:{border if rec['order'] > 0 else GREEN}">
                {rec['order'] if rec['order'] > 0 else '—'}
            </div>
        </div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:11px;color:{trend_col};font-weight:600">
            {trend_txt}
        </span>
        {spark}
    </div>
</div>
""", unsafe_allow_html=True)

    # ── Summary action bar ───────────────────────────────────────────────
    st.markdown("---")
    action_n   = sum(1 for r in REORDER_RECS if r["urgency"] != "healthy")
    critical_n = sum(1 for r in REORDER_RECS if r["urgency"] == "critical")

    bar1, bar2, bar3 = st.columns([3, 1.5, 1.5])
    with bar1:
        st.error(
            f"**{action_n} parts require action this week** — "
            f"{critical_n} critical · 1 advisory · Auto-generated 06:00 SGT"
        )
    with bar2:
        st.metric("Est. Order Value", "SGD 4,280")
    with bar3:
        st.markdown("<br>", unsafe_allow_html=True)
        if st.button("Draft Purchase Orders →", type="primary", use_container_width=True):
            st.success("Purchase orders drafted! (Demo mode)")


# ─── Page: Inventory ───────────────────────────────────────────────────────────

def page_inventory():
    st.markdown('<p class="section-label">Inventory</p>', unsafe_allow_html=True)
    st.title("Live Stock — Tuas HQ")

    df = load_inventory()

    # ── Filters ──────────────────────────────────────────────────────────
    fi1, fi2, fi3, fi4 = st.columns([3, 1.8, 1.2, 1.2])
    with fi1:
        search = st.text_input("Search", placeholder="Part number or description…", label_visibility="collapsed")
    with fi2:
        cat_opts = ["All Categories"] + sorted(df["Category"].unique().tolist())
        cat_f = st.selectbox("Category", cat_opts, key="inv_cat")
    with fi3:
        zone_opts = ["All Zones"] + sorted(df["Zone"].unique().tolist())
        zone_f = st.selectbox("Zone", zone_opts, key="inv_zone")
    with fi4:
        stat_opts = ["All Status", "Healthy", "Low", "Critical"]
        stat_f = st.selectbox("Status", stat_opts)

    # Apply filters
    filt = df.copy()
    if search:
        q = search.lower()
        filt = filt[
            filt["Part"].str.lower().str.contains(q, na=False)
            | filt["Description"].str.lower().str.contains(q, na=False)
        ]
    if cat_f  != "All Categories": filt = filt[filt["Category"] == cat_f]
    if zone_f != "All Zones":      filt = filt[filt["Zone"]     == zone_f]
    if stat_f != "All Status":     filt = filt[filt["Status"]   == stat_f]

    # ── Summary metrics ───────────────────────────────────────────────────
    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Showing SKUs",    f"{len(filt)} / {len(df)}")
    m2.metric("Units On Hand",   int(filt["Qty"].sum()))
    m3.metric("Critical Items",  int((filt["Status"] == "Critical").sum()))
    m4.metric("Low Stock Items", int((filt["Status"] == "Low").sum()))

    # ── Export ────────────────────────────────────────────────────────────
    csv = filt.to_csv(index=False)
    st.download_button("Download CSV", csv, "crestar_inventory.csv", "text/csv")

    # ── Styled table ──────────────────────────────────────────────────────
    def _status_color(val):
        return {
            "Critical": "background-color:#fee2e2;color:#dc2626;font-weight:700",
            "Low":      "background-color:#fef3c7;color:#d97706;font-weight:700",
            "Healthy":  "background-color:#dcfce7;color:#16a34a;font-weight:700",
        }.get(val, "")

    def _qty_color(row):
        styles = [""] * len(filt.columns)
        idx = list(filt.columns).index("Qty")
        if row["Status"] == "Critical":
            styles[idx] = "color:#dc2626;font-weight:700"
        elif row["Status"] == "Low":
            styles[idx] = "color:#d97706;font-weight:700"
        return styles

    styled = (
        filt.style
        .applymap(_status_color, subset=["Status"])
        .apply(_qty_color, axis=1)
    )
    st.dataframe(styled, use_container_width=True, hide_index=True)

    # ── Category breakdown chart ──────────────────────────────────────────
    if len(filt) > 0:
        with st.expander("Category breakdown chart"):
            cat_summary = (
                filt.groupby("Category")["Qty"]
                .sum()
                .reset_index()
                .sort_values("Qty", ascending=True)
            )
            fig = px.bar(
                cat_summary, x="Qty", y="Category",
                orientation="h",
                color="Category",
                color_discrete_sequence=[PURPLE, MAGENTA, DARK_BLUE, "#10b981", "#f59e0b"],
                labels={"Qty": "Units On Hand"},
            )
            fig.update_layout(
                height=250,
                margin=dict(t=10, b=10, l=10, r=10),
                showlegend=False,
                paper_bgcolor="white",
                plot_bgcolor="#f8fafc",
            )
            st.plotly_chart(fig, use_container_width=True)


# ─── Page: AI Chatbot ──────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are the Crestar Warehouse AI Assistant for Crestar, a Singapore SME that manufactures \
customisable ceiling fans at a 17,000 sq ft warehouse in Tuas, Singapore.

Warehouse zones:
  Zone A — Fan Blades (primary)
  Zone B — Fan Blades / Wiring Kits
  Zone C — Motors
  Zone D — Casings
  Zone E — Wiring Kits
  Zone F — Fan Blades (overflow)

Current CRITICAL stock alerts:
  FBL-038  Fan Blade 14" 3-blade ABS    Zone B, Bin B-2-1   Qty 4  / Reorder 10
  MTR-018  Motor 45W DC                 Zone C, Bin C-1-3   Qty 3  / Reorder 8
  WKT-014  Wiring Kit Premium 5-speed   Zone E, Bin E-1-1   Qty 2  / Reorder 15

Current LOW stock alerts:
  CSG-019  Casing Slim 18" Matte Black  Zone D, Bin D-3-4   Qty 7  / Reorder 12
  WKT-009  Wiring Kit Standard 3-speed  Zone B, Bin B-2-3   Qty 5  / Reorder 15

3-month AI demand forecast highlights:
  Fan Blade 52" Wooden  — Stock: 5,  Forecast need: 22  → ORDER 20 units NOW
  Motor Unit Type-A     — Stock: 8,  Forecast need: 19  → ORDER 15 units NOW
  Wiring Kit Standard   — Stock: 11, Forecast need: 18  → Order 10 units this week

Key inventory (selected healthy SKUs):
  FBL-042  Fan Blade 16" 3-blade ABS    Zone A, Bin A-3-2   Qty 24
  MTR-024  Motor 60W AC                 Zone C, Bin C-2-1   Qty 14
  CSG-011  Casing Standard 16" White    Zone D, Bin D-1-2   Qty 22
  FBL-049  Fan Blade 20" 5-blade ABS    Zone F, Bin F-1-2   Qty 31

Total: 90 storage units, 15 SKUs on the live inventory page, ~200 units on hand.
Estimated reorder cost this cycle: SGD 4,280.

Respond concisely. Use bullet points and emojis. Always cite Zone and Bin when answering \
location queries. If asked about items not in the data, say you don't have that record and \
suggest the user check the Warehouse View page.
"""


def page_chatbot():
    st.markdown('<p class="section-label">AI Assistant</p>', unsafe_allow_html=True)

    # Header
    hc1, hc2 = st.columns([0.6, 9.4])
    with hc1:
        st.markdown(
            f'<div style="width:48px;height:48px;border-radius:50%;background:{DARK_BLUE};'
            f'display:flex;align-items:center;justify-content:center;font-size:24px;margin-top:6px">🤖</div>',
            unsafe_allow_html=True,
        )
    with hc2:
        st.markdown(
            f'### Crestar AI Assistant &nbsp; '
            f'<span style="font-size:12px;background:#dcfce7;color:#16a34a;'
            f'padding:3px 10px;border-radius:20px;font-weight:700">● Online</span>',
            unsafe_allow_html=True,
        )
        st.caption("Powered by Ollama · Llama 3 running locally · Ask me anything about the warehouse")

    # ── Settings expander ──────────────────────────────────────────────────
    with st.expander("Settings", expanded=False):
        sc1, sc2 = st.columns([2, 1])
        with sc1:
            model = st.selectbox(
                "Ollama Model",
                ["llama3", "llama3.1", "llama3.2", "llama3:8b", "mistral", "qwen2.5"],
                key="ollama_model",
            )
        with sc2:
            st.markdown("<br>", unsafe_allow_html=True)
            if st.button("Clear Chat History"):
                st.session_state.chat_messages = []
                st.rerun()

    # ── Initialise chat history ───────────────────────────────────────────
    if "chat_messages" not in st.session_state:
        st.session_state.chat_messages = [
            {
                "role": "assistant",
                "content": (
                    "Hi! I'm the **Crestar Warehouse AI Assistant**.\n\n"
                    "I can help you with:\n"
                    "- **Finding parts** — zone, bin, and quantity\n"
                    "- **Stock alerts** — what's running low right now\n"
                    "- **Demand forecasts** — what to order and when\n"
                    "- **Purchasing advice** — recommended order quantities\n\n"
                    "What would you like to know?"
                ),
            }
        ]

    # ── Quick-suggestion chips ────────────────────────────────────────────
    suggestions = [
        "Where are the wooden fan blades?",
        "What should I reorder this week?",
        "Show all critical stock alerts",
        "Which parts will run out next month?",
        "How many motors do we have?",
    ]
    st.markdown("**Quick questions:**")
    chip_cols = st.columns(len(suggestions))
    for col, sug in zip(chip_cols, suggestions):
        with col:
            if st.button(sug, use_container_width=True, key=f"chip_{sug[:10]}"):
                st.session_state.chat_messages.append({"role": "user", "content": sug})
                with st.spinner("Thinking…"):
                    api_msgs = [{"role": "system", "content": SYSTEM_PROMPT}]
                    api_msgs += [
                        {"role": m["role"], "content": m["content"]}
                        for m in st.session_state.chat_messages
                    ]
                    reply = call_ollama(api_msgs, model=st.session_state.get("ollama_model", "llama3"))
                st.session_state.chat_messages.append({"role": "assistant", "content": reply})
                st.rerun()

    st.markdown("---")

    # ── Render chat history ───────────────────────────────────────────────
    for msg in st.session_state.chat_messages:
        avatar = "🤖" if msg["role"] == "assistant" else "👤"
        with st.chat_message(msg["role"], avatar=avatar):
            st.markdown(msg["content"])

    # ── Chat input ────────────────────────────────────────────────────────
    if prompt := st.chat_input("Ask me about stock levels, locations, forecasts…"):
        st.session_state.chat_messages.append({"role": "user", "content": prompt})

        with st.chat_message("user", avatar="👤"):
            st.markdown(prompt)

        with st.chat_message("assistant", avatar="🤖"):
            with st.spinner("Thinking…"):
                api_msgs = [{"role": "system", "content": SYSTEM_PROMPT}]
                api_msgs += [
                    {"role": m["role"], "content": m["content"]}
                    for m in st.session_state.chat_messages
                ]
                reply = call_ollama(api_msgs, model=st.session_state.get("ollama_model", "llama3"))
            st.markdown(reply)

        st.session_state.chat_messages.append({"role": "assistant", "content": reply})
        st.rerun()


# ─── Router ────────────────────────────────────────────────────────────────────

if page == "Home":
    page_home()
elif page == "Warehouse View":
    page_warehouse()
elif page == "Demand Forecast":
    page_forecast()
elif page == "Inventory":
    page_inventory()
elif page == "AI Chatbot":
    page_chatbot()
