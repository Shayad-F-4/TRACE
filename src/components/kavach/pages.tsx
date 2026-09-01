import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BatteryFull,
  BellRing,
  CheckCircle2,
  Cpu,
  Database,
  Download,
  Layers,
  MapPin,
  Radar,
  RadioTower,
  ScrollText,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useKavach } from "@/lib/kavach/store";
import { rssiToDistance } from "@/lib/kavach/engine";
import type { SensorNode } from "@/lib/kavach/types";
import { MapCanvas } from "./MapCanvas";
import { NodeDetail } from "./NodeDetail";
import {
  EventFeed,
  KpiCard,
  LastSeenTicker,
  LocalizationSettings,
  MeshHealth,
  PrioritySearchPanel,
  SimulationControls,
} from "./panels";
import {
  EmptyState,
  PriorityBadge,
  SectionHeader,
  SeverityBadge,
  StatusDot,
  Term,
  ago,
  fmtDateTime,
  fmtTime,
} from "./common";

/* ------------------------------- Command Center ------------------------------ */

export function CommandCenter() {
  const k = useKavach();
  const [selected, setSelected] = useState<string | null>(null);
  const node = k.nodes.find((n) => n.id === selected) ?? null;

  const activeNodes = k.nodes.filter((n) => n.status === "online").length;
  const possibleDevices = k.nodes.reduce((s, n) => s + n.bleDetected + n.wifiDetected, 0);
  const highZones = k.zones.filter((z) => z.priority === "HIGH").length;
  const avgBattery = k.nodes.reduce((s, n) => s + n.battery, 0) / k.nodes.length;
  const meshOk = activeNodes >= 3;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Command Center"
        subtitle="Multi-sensor evidence overview for the active search sector"
        action={<LastSeenTicker />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard icon={<RadioTower className="h-4 w-4" />} label="Active Nodes" value={`${activeNodes}/4`} hint="reporting over LoRa mesh" />
        <KpiCard icon={<Users className="h-4 w-4" />} label="Possible Devices" value={possibleDevices} hint="anonymised Wi-Fi/BLE observations" tone="success" />
        <KpiCard icon={<Radar className="h-4 w-4" />} label="High Priority Zones" value={highZones} hint="probable search zones" tone={highZones ? "critical" : "default"} />
        <KpiCard icon={<Layers className="h-4 w-4" />} label="LoRa Network" value={meshOk ? "STABLE" : "DEGRADED"} hint="gateway N04 · 868 MHz" tone={meshOk ? "success" : "warning"} />
        <KpiCard icon={<BatteryFull className="h-4 w-4" />} label="Average Battery" value={avgBattery.toFixed(0)} unit="%" hint="18650 packs" tone={avgBattery < 30 ? "warning" : "default"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <div className="panel p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-sm font-semibold">Search Area · Sector A–D</p>
              <span className="text-[11px] text-muted-foreground">
                click a node marker for full telemetry
              </span>
            </div>
            <MapCanvas
              nodes={k.nodes}
              zones={k.zones}
              calibration={k.calibration}
              selectedNode={selected}
              onSelectNode={setSelected}
              className="aspect-[4/3] w-full"
            />
          </div>
          <EventFeed />
        </div>
        <div className="space-y-4">
          <SimulationControls />
          <PrioritySearchPanel />
          <LocalizationSettings />
          <MeshHealth />
        </div>
      </div>

      <NodeDetail
        node={node}
        calibration={k.calibration}
        open={!!node}
        onOpenChange={(v) => !v && setSelected(null)}
      />
    </div>
  );
}

/* --------------------------------- Live Map ---------------------------------- */

export function LiveMapPage() {
  const k = useKavach();
  const [selected, setSelected] = useState<string | null>(null);
  const node = k.nodes.find((n) => n.id === selected) ?? null;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Live Map"
        subtitle="Node positions, RSSI range estimates and overlapping probable search zones"
      />
      <div className="panel p-3">
        <MapCanvas
          nodes={k.nodes}
          zones={k.zones}
          calibration={k.calibration}
          selectedNode={selected}
          onSelectNode={setSelected}
          className="aspect-[16/10] w-full"
        />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {k.nodes.map((n) => (
          <button
            key={n.id}
            onClick={() => setSelected(n.id)}
            className="panel p-3 text-left transition-colors hover:border-primary/50"
          >
            <div className="flex items-center justify-between">
              <span className="mono-num font-semibold">{n.id}</span>
              <StatusDot status={n.status} />
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{n.label}</p>
            <p className="mono-num mt-2 text-xs">
              {n.lat.toFixed(5)}°N {n.lon.toFixed(5)}°E
            </p>
            <p className="mono-num text-xs text-muted-foreground">
              RSSI {n.rssi.toFixed(0)} dBm · ≈{rssiToDistance(n.rssi, k.calibration).toFixed(0)} m ·
              batt {n.battery.toFixed(0)}%
            </p>
          </button>
        ))}
      </div>
      <NodeDetail
        node={node}
        calibration={k.calibration}
        open={!!node}
        onOpenChange={(v) => !v && setSelected(null)}
      />
    </div>
  );
}

/* ------------------------------- Sensor Nodes -------------------------------- */

export function NodesPage() {
  const k = useKavach();
  const [selected, setSelected] = useState<string | null>(null);
  const node = k.nodes.find((n) => n.id === selected) ?? null;

  const health = (n: SensorNode) => {
    const vals = Object.values(n.sensorHealth);
    const fails = vals.filter((v) => v === "fail").length;
    const warns = vals.filter((v) => v === "warn").length;
    return fails ? `${fails} fault` : warns ? `${warns} warning` : "all nominal";
  };

  return (
    <div className="space-y-4">
      <SectionHeader title="Sensor Nodes" subtitle="ESP32 + SX1278 field units N01–N04" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {k.nodes.map((n) => (
          <div key={n.id} className="panel space-y-2 p-4">
            <div className="flex items-center justify-between">
              <span className="mono-num text-base font-semibold">{n.id}</span>
              <StatusDot status={n.status} />
            </div>
            <p className="text-xs text-muted-foreground">{n.label}</p>
            <Progress value={n.battery} className="h-1.5" />
            <p className="mono-num text-xs text-muted-foreground">{n.battery.toFixed(0)}% battery</p>
            <div className="mono-num space-y-0.5 text-xs">
              <p>GPS {n.lat.toFixed(5)}, {n.lon.toFixed(5)}</p>
              <p>LoRa {n.loraRssi.toFixed(0)} dBm / SNR {n.loraSnr.toFixed(1)} dB</p>
              <p className="text-muted-foreground">last packet {ago(n.lastPacket)}</p>
            </div>
            <Badge variant="outline" className="text-[10px]">{health(n)}</Badge>
            <Button size="sm" variant="outline" className="w-full" onClick={() => setSelected(n.id)}>
              Node detail
            </Button>
          </div>
        ))}
      </div>

      <div className="panel overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Node</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Battery</TableHead>
              <TableHead>GPS</TableHead>
              <TableHead>LoRa RSSI / SNR</TableHead>
              <TableHead>Sound</TableHead>
              <TableHead>Vibration</TableHead>
              <TableHead>Thermal</TableHead>
              <TableHead>Last packet</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {k.nodes.map((n) => (
              <TableRow key={n.id} className="mono-num text-xs">
                <TableCell className="font-semibold">{n.id}</TableCell>
                <TableCell><StatusDot status={n.status} /></TableCell>
                <TableCell>{n.battery.toFixed(0)}%</TableCell>
                <TableCell>{n.lat.toFixed(5)}, {n.lon.toFixed(5)}</TableCell>
                <TableCell>{n.loraRssi.toFixed(0)} dBm / {n.loraSnr.toFixed(1)} dB</TableCell>
                <TableCell>{n.sound.toFixed(1)} dB</TableCell>
                <TableCell>{n.vibration.toFixed(3)} g</TableCell>
                <TableCell>{n.temperature.toFixed(1)} °C</TableCell>
                <TableCell>{fmtTime(n.lastPacket)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <NodeDetail
        node={node}
        calibration={k.calibration}
        open={!!node}
        onOpenChange={(v) => !v && setSelected(null)}
      />
    </div>
  );
}

/* -------------------------------- Detections --------------------------------- */

export function DetectionsPage() {
  const k = useKavach();
  const [type, setType] = useState<string>("all");

  const rows = k.detections.filter((d) => type === "all" || d.signalType === type);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Detections"
        subtitle="Wireless observations captured by node radios — supporting evidence only"
        action={
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All signal types</SelectItem>
              <SelectItem value="BLE">BLE</SelectItem>
              <SelectItem value="Wi-Fi">Wi-Fi</SelectItem>
            </SelectContent>
          </Select>
        }
      />
      <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
        Device MAC addresses are never stored. Each observation is shown as an anonymised temporary
        ID (TMP-…) generated per node per session. A detected device indicates a possible person, not
        a confirmed survivor.
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="No wireless observations"
          hint="Start the simulation or inject a possible survivor signal to populate detections."
        />
      ) : (
        <div className="panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Node</TableHead>
                <TableHead>Signal</TableHead>
                <TableHead>Temporary ID</TableHead>
                <TableHead>RSSI</TableHead>
                <TableHead>
                  <Term label="Est. distance" hint="From the log-distance path-loss model using current calibration." />
                </TableHead>
                <TableHead>
                  <Term label="Persistence" hint="How consistently the same temporary ID is re-observed across sweeps." />
                </TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 120).map((d) => (
                <TableRow key={d.id} className="mono-num text-xs">
                  <TableCell>{fmtTime(d.ts)}</TableCell>
                  <TableCell className="font-semibold">{d.nodeId}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px]">{d.signalType}</Badge>
                  </TableCell>
                  <TableCell>{d.tempId}</TableCell>
                  <TableCell>{d.rssi} dBm</TableCell>
                  <TableCell>{d.distance} m</TableCell>
                  <TableCell>{(d.persistence * 100).toFixed(0)}%</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        d.status === "tracking"
                          ? "border-success/40 bg-success/10 text-success"
                          : d.status === "intermittent"
                            ? "border-warning/40 bg-warning/10 text-warning"
                            : "text-muted-foreground"
                      }
                    >
                      {d.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- Alerts ----------------------------------- */

export function AlertsPage() {
  const k = useKavach();
  const groups = [
    { key: "zone" as const, title: "High priority search zones", icon: <Radar className="h-4 w-4" /> },
    { key: "anomaly" as const, title: "Sensor anomalies", icon: <AlertTriangle className="h-4 w-4" /> },
    { key: "node" as const, title: "Node offline / low battery", icon: <RadioTower className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Alerts"
        subtitle="Operator acknowledgement queue"
        action={
          <Badge variant="outline">
            {k.alerts.filter((a) => !a.acknowledged).length} unacknowledged
          </Badge>
        }
      />
      {groups.map((g) => {
        const items = k.alerts.filter((a) => a.kind === g.key);
        return (
          <div key={g.key} className="panel p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
              {g.icon} {g.title}
            </p>
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground">No alerts in this category.</p>
            ) : (
              <div className="space-y-2">
                {items.map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={a.severity} />
                        <span className="text-sm font-medium">{a.title}</span>
                        <span className="mono-num text-[11px] text-muted-foreground">
                          {a.target}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{a.reason}</p>
                      <p className="mono-num text-[11px] text-muted-foreground">
                        {fmtDateTime(a.ts)}
                      </p>
                    </div>
                    {a.acknowledged ? (
                      <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> acknowledged
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          k.acknowledge(a.id);
                          toast.success(`Alert acknowledged · ${a.target}`);
                        }}
                      >
                        Acknowledge
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------- Data Logs --------------------------------- */

export function LogsPage() {
  const k = useKavach();
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("all");

  const rows = useMemo(
    () =>
      k.logs.filter(
        (l) =>
          (level === "all" || l.level === level) &&
          (q === "" ||
            `${l.source} ${l.message}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [k.logs, q, level],
  );

  const exportCsv = () => {
    const csv = [
      "timestamp,iso,level,source,message",
      ...rows.map(
        (l) =>
          `${l.ts},${new Date(l.ts).toISOString()},${l.level},${l.source},"${l.message.replace(/"/g, "'")}"`,
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `kavach-logs-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} records to CSV`);
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Data Logs"
        subtitle="Every packet, detection and mesh event recorded this session"
        action={
          <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download /> Export CSV
          </Button>
        }
      />
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search source or message…"
            className="pl-8"
          />
        </div>
        <Select value={level} onValueChange={setLevel}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warning</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-6 w-6" />}
          title="No log records match"
          hint="Start the simulation, or clear the search filter to see all captured events."
        />
      ) : (
        <div className="panel">
          <ScrollArea className="h-[540px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((l) => (
                  <TableRow key={l.id} className="text-xs">
                    <TableCell className="mono-num whitespace-nowrap">{fmtDateTime(l.ts)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          l.level === "critical"
                            ? "border-critical/40 bg-critical/10 text-critical"
                            : l.level === "warn"
                              ? "border-warning/40 bg-warning/10 text-warning"
                              : "text-muted-foreground"
                        }
                      >
                        {l.level}
                      </Badge>
                    </TableCell>
                    <TableCell className="mono-num">{l.source}</TableCell>
                    <TableCell>{l.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

/* -------------------------------- System Info -------------------------------- */

const HARDWARE = [
  ["ESP32 DevKit v1", "Node MCU, dual-core, Wi-Fi/BLE scanning"],
  ["SX1278 / SX1276 LoRa", "433/868 MHz sub-GHz transceiver"],
  ["LoRa antenna", "Spring / SMA whip, tuned to band"],
  ["NEO-6M GPS", "Node geolocation and UTC time base"],
  ["INMP441 / MAX9814 mic", "Acoustic evidence (tapping, voice band)"],
  ["SW-420 / piezo", "Vibration and knock detection"],
  ["AMG8833 / MLX90640", "Thermal grid evidence"],
  ["SSD1306 OLED", "On-node status display"],
  ["Buzzer + status LEDs", "Field indication"],
  ["18650 / LiPo cell", "Field power"],
  ["TP4056 charger", "Protected charging circuit"],
];

const SOFTWARE = [
  ["ESP32 firmware", "Arduino/C++ sensor sampling and packet framing"],
  ["LoRa mesh layer", "Store-and-forward relay to gateway node N04"],
  ["Gateway + REST API", "Packet ingest endpoint for telemetry and observations"],
  ["Localization engine", "Log-distance path-loss + weighted least-squares multilateration"],
  ["Sensor fusion", "Prototype rule-based scoring; ML model can replace scoreEvidence()"],
  ["Web dashboard", "React + TypeScript + Tailwind rescue console"],
];

const PIPELINE = [
  { icon: <Cpu className="h-4 w-4" />, label: "Sensor Nodes", sub: "ESP32 + multi-sensor" },
  { icon: <RadioTower className="h-4 w-4" />, label: "LoRa Mesh", sub: "SX1278 store & forward" },
  { icon: <Layers className="h-4 w-4" />, label: "Gateway", sub: "N04 aggregator" },
  { icon: <Database className="h-4 w-4" />, label: "Backend / API", sub: "REST telemetry ingest" },
  { icon: <Radar className="h-4 w-4" />, label: "Localization & Fusion", sub: "Zones + priority score" },
  { icon: <MapPin className="h-4 w-4" />, label: "Dashboard", sub: "Rescue command console" },
];

export function SystemInfoPage() {
  const k = useKavach();
  return (
    <div className="space-y-4">
      <SectionHeader title="System Info" subtitle="Architecture, hardware and software stack" />

      <div className="panel p-4">
        <p className="mb-4 text-sm font-semibold">Data pipeline</p>
        <div className="flex flex-wrap items-stretch gap-2">
          {PIPELINE.map((p, i) => (
            <div key={p.label} className="flex items-center gap-2">
              <div className="min-w-40 rounded-md border border-border bg-secondary/40 p-3">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {p.icon} {p.label}
                </span>
                <p className="mt-1 text-[11px] text-muted-foreground">{p.sub}</p>
              </div>
              {i < PIPELINE.length - 1 && <span className="text-muted-foreground">→</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <p className="mb-3 text-sm font-semibold">Hardware</p>
          <ul className="space-y-2 text-xs">
            {HARDWARE.map(([h, d]) => (
              <li key={h} className="flex justify-between gap-3 border-b border-border pb-1.5">
                <span className="font-medium">{h}</span>
                <span className="text-right text-muted-foreground">{d}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-4">
          <div className="panel p-4">
            <p className="mb-3 text-sm font-semibold">Software stack</p>
            <ul className="space-y-2 text-xs">
              {SOFTWARE.map(([h, d]) => (
                <li key={h} className="flex justify-between gap-3 border-b border-border pb-1.5">
                  <span className="font-medium">{h}</span>
                  <span className="text-right text-muted-foreground">{d}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">API integration</p>
              <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
                <ShieldCheck className="mr-1 h-3 w-3" /> API integration ready
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Current mode: <strong>{k.mode === "live" ? "LIVE" : "SIMULATION"}</strong>. In live
              mode the dashboard waits for real gateway packets — no LoRa reception is fabricated.
            </p>
            <pre className="mono-num mt-3 overflow-x-auto rounded-md border border-border bg-secondary/40 p-3 text-[11px] leading-relaxed">
{`POST /api/public/telemetry
{
  "nodeId": "N02", "latitude": 19.87710, "longitude": 74.47990,
  "sound": 46.2, "vibration": 0.21, "temperature": 31.4,
  "bleDetected": 1, "wifiDetected": 2, "rssi": -71,
  "battery": 76, "timestamp": 1756699200000,
  "loraRssi": -84, "loraSnr": 7.5
}

GET  /api/public/nodes        → node roster + last telemetry
GET  /api/public/zones        → probable search zones + scores
POST /api/public/observation  → single Wi-Fi/BLE observation`}
            </pre>
          </div>
        </div>
      </div>

      <div className="panel p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <BellRing className="h-4 w-4 text-primary" /> Project context
        </p>
        <div className="grid gap-3 text-xs md:grid-cols-2">
          <div className="space-y-1">
            <p><strong>Sanjivani College of Engineering, Kopargaon</strong></p>
            <p className="text-muted-foreground">Department of Computer Engineering</p>
            <p className="text-muted-foreground">MDC0321 — Internet of Things Laboratory</p>
            <p className="text-muted-foreground">Academic Year 2026–27 · T.Y. Computer B.Tech · Semester V</p>
            <p className="text-muted-foreground">Course Teacher: Dr. T. Bhaskar</p>
          </div>
          <div>
            <p className="mb-1 font-medium">Group members</p>
            <ul className="space-y-0.5 text-muted-foreground">
              <li>Adesh Somenath Gawali (102)</li>
              <li>Trupti Hiraman Gode (113)</li>
              <li>Shayad Bashir Fakir (117)</li>
              <li>Shubham Sanjay Khose (122)</li>
              <li>Sanika Sandip Naikwadi (128)</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
        Prototype / research demonstration. KAVACH estimates probable search zones from supporting
        evidence. It does not detect survivors with certainty and is not a certified rescue system.
      </div>
    </div>
  );
}

export const PRIORITY_BADGE = PriorityBadge;
