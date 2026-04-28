import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Boxes, LineChart, Map, Bot, Warehouse, Package, Truck, ShoppingCart } from "lucide-react";
import type { ReactNode } from "react";

const navItems = [
  { to: "/", label: "Warehouse View", icon: Boxes },
  { to: "/forecast", label: "Demand Forecast", icon: LineChart },
  { to: "/inventory", label: "Inventory", icon: Package },
  { to: "/inbound", label: "Inbound Shipments", icon: Truck },
  { to: "/outbound", label: "Outbound Orders", icon: ShoppingCart },
  { to: "/routes", label: "Route Optimisation", icon: Map },
  { to: "/assistant", label: "AI Assistant", icon: Bot },
] as const;

export function AppLayout({ children }: { children?: ReactNode }) {
  const { location } = useRouterState();
  const path = location.pathname;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 bg-navy text-navy-foreground flex flex-col">
        <div className="px-5 h-16 flex items-center gap-2 border-b border-white/10">
          <div className="h-8 w-8 rounded-md bg-green flex items-center justify-center">
            <Warehouse className="h-4 w-4 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-wide">CRESTAR</div>
            <div className="text-[10px] uppercase tracking-widest text-white/60">Intelligence Suite</div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-5 space-y-1">
          {navItems.map((item) => {
            const active = path === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-green text-white shadow-sm"
                    : "text-white/75 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-4 border-t border-white/10 text-[11px] text-white/50">
          v2.4.1 · Tuas HQ
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-navy text-navy-foreground border-b border-white/10 flex items-center justify-between px-6">
          <h1 className="text-base font-semibold tracking-wide">
            Crestar Warehouse Intelligence Suite
          </h1>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-sm font-medium">Lim Wei Ming</div>
              <div className="text-[11px] text-white/60 uppercase tracking-wide">Warehouse Manager</div>
            </div>
            <div className="h-9 w-9 rounded-full bg-green/90 flex items-center justify-center text-sm font-semibold">
              LW
            </div>
          </div>
        </header>
        <main className="flex-1 min-w-0 overflow-auto">{children ?? <Outlet />}</main>
      </div>
    </div>
  );
}