import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BellRing,
  Gauge,
  Map as MapIcon,
  Menu,
  Radar,
  RadioTower,
  ScrollText,
  Search,
  ShieldAlert,
  Cpu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useKavach } from "@/lib/kavach/store";

export type SectionKey =
  | "command"
  | "map"
  | "nodes"
  | "detections"
  | "alerts"
  | "logs"
  | "system";

export const SECTIONS: { key: SectionKey; label: string; icon: ReactNode }[] = [
  { key: "command", label: "Command Center", icon: <Gauge className="h-4 w-4" /> },
  { key: "map", label: "Live Map", icon: <MapIcon className="h-4 w-4" /> },
  { key: "nodes", label: "Sensor Nodes", icon: <RadioTower className="h-4 w-4" /> },
  { key: "detections", label: "Detections", icon: <Search className="h-4 w-4" /> },
  { key: "alerts", label: "Alerts", icon: <BellRing className="h-4 w-4" /> },
  { key: "logs", label: "Data Logs", icon: <ScrollText className="h-4 w-4" /> },
  { key: "system", label: "System Info", icon: <Cpu className="h-4 w-4" /> },
];

function Clock() {
  const [now, setNow] = useState<string>("--:--:--");
  useEffect(() => {
    const f = () => setNow(new Date().toLocaleTimeString("en-GB", { hour12: false }));
    f();
    const t = setInterval(f, 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="mono-num text-sm">{now} IST</span>;
}

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const k = useKavach();
  const unack = k.alerts.filter((a) => !a.acknowledged && a.severity === "critical").length;
  const online = k.nodes.filter((n) => n.status !== "offline").length;

  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2.5">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu}>
        <Menu />
      </Button>
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground">
          <Radar className="h-5 w-5" />
        </span>
        <div className="leading-tight">
          <p className="text-base font-semibold tracking-tight">KAVACH</p>
          <p className="text-[11px] text-muted-foreground">Rescue Command Center</p>
        </div>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              k.running ? "animate-pulse bg-success" : "bg-muted-foreground",
            )}
          />
          {k.running ? `Link active · ${online}/4 nodes` : "Link idle"}
        </span>

        <label className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs">
          <span className={k.mode === "simulation" ? "font-semibold" : "text-muted-foreground"}>
            SIM
          </span>
          <Switch
            checked={k.mode === "live"}
            onCheckedChange={(v) => k.setMode(v ? "live" : "simulation")}
            aria-label="Toggle simulation or live mode"
          />
          <span className={k.mode === "live" ? "font-semibold" : "text-muted-foreground"}>
            LIVE
          </span>
        </label>

        <Clock />

        <Badge
          variant="outline"
          className={cn(
            "gap-1",
            unack
              ? "border-critical/40 bg-critical/10 text-critical"
              : "border-success/40 bg-success/10 text-success",
          )}
        >
          {unack ? <ShieldAlert className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
          {unack ? `EMERGENCY · ${unack} critical` : "STATUS NOMINAL"}
        </Badge>
      </div>
    </header>
  );
}

export function Sidebar({
  active,
  onSelect,
  open,
  onClose,
}: {
  active: SectionKey;
  onSelect: (k: SectionKey) => void;
  open: boolean;
  onClose: () => void;
}) {
  const k = useKavach();
  const counts: Partial<Record<SectionKey, number>> = {
    alerts: k.alerts.filter((a) => !a.acknowledged).length,
    detections: k.detections.length,
  };

  return (
    <>
      {open && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-foreground/40 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="border-b border-sidebar-border px-4 py-4">
          <p className="text-sm font-semibold tracking-wide">KAVACH</p>
          <p className="text-[11px] text-sidebar-foreground/70">
            Multi-sensor survivor detection & LoRa mesh
          </p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => {
                onSelect(s.key);
                onClose();
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                active === s.key
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
              )}
            >
              {s.icon}
              <span className="flex-1 text-left">{s.label}</span>
              {counts[s.key] ? (
                <span className="mono-num rounded bg-sidebar-primary px-1.5 text-[10px] text-sidebar-primary-foreground">
                  {counts[s.key]}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-3 text-[11px] text-sidebar-foreground/70">
          <p className="font-medium text-sidebar-foreground">Prototype / Research Demonstration</p>
          <p className="mt-1">
            Estimates probable search zones from supporting evidence. Not a certified rescue system.
          </p>
        </div>
      </aside>
    </>
  );
}
