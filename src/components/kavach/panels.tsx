import { useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  BatteryMedium,
  CircleDot,
  Pause,
  Play,
  RadioTower,
  RefreshCw,
  Radar,
  Settings2,
  Siren,
  Waves,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useKavach } from "@/lib/kavach/store";
import { FUSION_WEIGHTS } from "@/lib/kavach/engine";
import type { EvidenceBreakdown, LogEvent, SearchZone } from "@/lib/kavach/types";
import { EmptyState, PriorityBadge, Term, ago, fmtTime } from "./common";

export function KpiCard({
  icon,
  label,
  value,
  unit,
  hint,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  tone?: "default" | "critical" | "warning" | "success";
}) {
  const toneCls = {
    default: "text-primary bg-primary/10",
    critical: "text-critical bg-critical/10",
    warning: "text-warning bg-warning/10",
    success: "text-success bg-success/10",
  }[tone];
  return (
    <div className="panel flex items-start gap-3 p-4">
      <span className={cn("rounded-md p-2", toneCls)}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mono-num text-xl font-semibold leading-tight">
          {value}
          {unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>}
        </p>
        {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

export function SimulationControls({ compact = false }: { compact?: boolean }) {
  const k = useKavach();
  return (
    <div className={cn("panel p-4", compact && "p-3")}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">Scenario Console</p>
        <Badge variant="outline" className="text-[10px] uppercase">
          {k.mode === "simulation" ? "simulation engine" : "live api mode"}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        {k.running ? (
          <Button variant="secondary" onClick={k.pause}>
            <Pause /> Pause
          </Button>
        ) : (
          <Button onClick={k.start}>
            <Play /> Start Simulation
          </Button>
        )}
        <Button variant="destructive" onClick={k.generateSurvivor}>
          <Siren /> Possible Survivor
        </Button>
        <Button variant="outline" onClick={k.generateFalsePositive}>
          <Waves /> Noise / False Positive
        </Button>
        <Button variant="outline" onClick={k.simulateNodeFailure}>
          <Zap /> Simulate Node Failure
        </Button>
        <Button variant="ghost" onClick={k.reset}>
          <RefreshCw /> Reset Scenario
        </Button>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Simulation drives synthetic telemetry every 2.5 s. No LoRa hardware is attached in this
        demo — nothing shown here is a real reception.
      </p>
    </div>
  );
}

export function LocalizationSettings() {
  const { calibration, setCalibration } = useKavach();
  const [open, setOpen] = useState(false);
  const f = (key: keyof typeof calibration) => (v: string) =>
    setCalibration({ ...calibration, [key]: Number(v) });

  return (
    <div className="panel p-4">
      <button
        className="flex w-full items-center justify-between text-sm font-semibold"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-primary" /> Localization Settings
        </span>
        <span className="text-xs font-normal text-muted-foreground">{open ? "hide" : "show"}</span>
      </button>
      {open && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">
              <Term
                label="Ref RSSI @1 m"
                hint="Measured signal strength at one metre from the node; anchor of the log-distance path-loss model."
              />
            </Label>
            <Input
              type="number"
              value={calibration.refRssi}
              onChange={(e) => f("refRssi")(e.target.value)}
              className="mono-num h-8"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              <Term
                label="Path-loss n"
                hint="Environment exponent: ~2 free space, 2.7–4 through rubble and concrete."
              />
            </Label>
            <Input
              type="number"
              step="0.1"
              value={calibration.pathLossExponent}
              onChange={(e) => f("pathLossExponent")(e.target.value)}
              className="mono-num h-8"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Min confidence radius (m)</Label>
            <Input
              type="number"
              value={calibration.minRadius}
              onChange={(e) => f("minRadius")(e.target.value)}
              className="mono-num h-8"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Max confidence radius (m)</Label>
            <Input
              type="number"
              value={calibration.maxRadius}
              onChange={(e) => f("maxRadius")(e.target.value)}
              className="mono-num h-8"
            />
          </div>
          <p className="col-span-2 text-[11px] text-muted-foreground">
            d = 10^((RSSI<sub>ref</sub> − RSSI) / 10n). Weighted least-squares multilateration over
            3+ nodes produces a probable zone, never an exact victim pin.
          </p>
        </div>
      )}
    </div>
  );
}

export function EvidenceBars({ evidence }: { evidence: EvidenceBreakdown }) {
  const labels: Record<keyof EvidenceBreakdown, string> = {
    wirelessPersistence: "Wireless persistence",
    rssiStrength: "RSSI strength",
    sound: "Acoustic",
    vibration: "Vibration",
    thermal: "Thermal",
  };
  return (
    <div className="space-y-1.5">
      {(Object.keys(labels) as (keyof EvidenceBreakdown)[]).map((k) => (
        <div key={k} className="flex items-center gap-2">
          <span className="w-36 shrink-0 text-[11px] text-muted-foreground">{labels[k]}</span>
          <Progress value={evidence[k] * 100} className="h-1.5" />
          <span className="mono-num w-16 shrink-0 text-right text-[11px] text-muted-foreground">
            {(evidence[k] * 100).toFixed(0)}% ×{FUSION_WEIGHTS[k]}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ZoneCard({ zone }: { zone: SearchZone }) {
  return (
    <div className="fade-in-up rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PriorityBadge priority={zone.priority} />
          <span className="mono-num text-xs text-muted-foreground">
            {zone.lat.toFixed(5)}, {zone.lon.toFixed(5)}
          </span>
        </div>
        <span className="mono-num text-xs text-muted-foreground">{fmtTime(zone.ts)}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="mono-num text-2xl font-semibold">{zone.score}</span>
        <span className="text-xs text-muted-foreground">/100 search priority score</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {zone.note} · confidence radius ±{zone.radius} m
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {zone.contributingNodes.map((n) => (
          <Badge key={n} variant="secondary" className="text-[10px]">
            {n}
          </Badge>
        ))}
        <Badge variant="outline" className="text-[10px]">
          multilateration
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          rule-based fusion
        </Badge>
      </div>
      <div className="mt-3">
        <EvidenceBars evidence={zone.evidence} />
      </div>
    </div>
  );
}

export function PrioritySearchPanel() {
  const { zones } = useKavach();
  return (
    <div className="panel flex h-full flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Radar className="h-4 w-4 text-primary" /> Priority Search
        </p>
        <Badge variant="outline" className="text-[10px]">
          Prototype Rule-Based Fusion
        </Badge>
      </div>
      {zones.length === 0 ? (
        <EmptyState
          icon={<Radar className="h-6 w-6" />}
          title="No probable search zones"
          hint="Run the simulation or trigger a possible survivor signal to compute zones from multi-node RSSI observations."
        />
      ) : (
        <ScrollArea className="h-[420px] pr-3">
          <div className="space-y-3">
            {zones.map((z) => (
              <ZoneCard key={z.id} zone={z} />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

const levelIcon: Record<LogEvent["level"], ReactNode> = {
  info: <CircleDot className="h-3.5 w-3.5 text-info" />,
  warn: <AlertTriangle className="h-3.5 w-3.5 text-warning" />,
  critical: <Siren className="h-3.5 w-3.5 text-critical" />,
};

export function EventFeed({ height = 260 }: { height?: number }) {
  const { logs, running } = useKavach();
  return (
    <div className="panel flex flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4 text-primary" /> Live Event Feed
        </p>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              running ? "bg-success animate-pulse" : "bg-muted-foreground",
            )}
          />
          {running ? "streaming" : "idle"}
        </span>
      </div>
      {logs.length === 0 ? (
        <EmptyState
          icon={<RadioTower className="h-6 w-6" />}
          title="No events yet"
          hint="Start the simulation to stream node telemetry, detections and mesh routing events."
        />
      ) : (
        <ScrollArea style={{ height }} className="pr-3">
          <ul className="space-y-2">
            {logs.slice(0, 60).map((l) => (
              <li key={l.id} className="fade-in-up flex items-start gap-2 text-xs">
                <span className="mt-0.5">{levelIcon[l.level]}</span>
                <span className="mono-num shrink-0 text-muted-foreground">{fmtTime(l.ts)}</span>
                <span className="shrink-0 font-medium text-primary">{l.source}</span>
                <span className="text-foreground/85">{l.message}</span>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  );
}

export function MeshHealth() {
  const { nodes } = useKavach();
  const online = nodes.filter((n) => n.status !== "offline");
  const avgSnr = online.length
    ? online.reduce((s, n) => s + n.loraSnr, 0) / online.length
    : 0;
  return (
    <div className="panel p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <RadioTower className="h-4 w-4 text-primary" /> LoRa Mesh Health
      </p>
      <div className="space-y-2">
        {nodes.map((n) => (
          <div key={n.id} className="flex items-center gap-3 text-xs">
            <span className="mono-num w-9 font-semibold">{n.id}</span>
            <Progress
              value={Math.max(0, Math.min(100, ((n.loraRssi + 120) / 60) * 100))}
              className="h-1.5"
            />
            <span className="mono-num w-32 shrink-0 text-right text-muted-foreground">
              {n.status === "offline"
                ? "no link"
                : `${n.loraRssi.toFixed(0)} dBm / ${n.loraSnr.toFixed(1)} dB`}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        <BatteryMedium className="h-3.5 w-3.5" /> Average SNR {avgSnr.toFixed(1)} dB · gateway N04 ·
        {online.length}/{nodes.length} nodes reporting
      </p>
    </div>
  );
}

export function LastSeenTicker() {
  const { nodes } = useKavach();
  return (
    <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
      {nodes.map((n) => (
        <span key={n.id} className="rounded border border-border bg-card px-2 py-1">
          {n.id} · {ago(n.lastPacket)}
        </span>
      ))}
    </div>
  );
}
