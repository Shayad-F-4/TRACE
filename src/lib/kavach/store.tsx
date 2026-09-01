import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  buildEvidence,
  clamp,
  distanceToRssi,
  localize,
  makeRng,
  metresBetween,
  offsetMetres,
  priorityOf,
  rssiToDistance,
  scoreEvidence,
} from "./engine";
import type {
  AlertItem,
  CalibrationSettings,
  Detection,
  LogEvent,
  NodeId,
  SearchZone,
  SensorNode,
  TelemetryPacket,
} from "./types";

export const SITE_ORIGIN = { lat: 19.8762, lon: 74.4785 }; // Kopargaon, MH

const NODE_LAYOUT: { id: NodeId; label: string; east: number; north: number }[] = [
  { id: "N01", label: "Sector A – Collapsed Block", east: -120, north: 90 },
  { id: "N02", label: "Sector B – Stairwell Debris", east: 130, north: 105 },
  { id: "N03", label: "Sector C – Parking Slab", east: 145, north: -110 },
  { id: "N04", label: "Sector D – Perimeter / Gateway", east: -135, north: -95 },
];

export const DEFAULT_CALIBRATION: CalibrationSettings = {
  refRssi: -48,
  pathLossExponent: 2.7,
  minRadius: 8,
  maxRadius: 60,
};

const rng = makeRng(20260901);
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
const jitter = (amp: number) => (rng() - 0.5) * 2 * amp;

function seedNodes(): SensorNode[] {
  return NODE_LAYOUT.map((n, i) => {
    const pos = offsetMetres(SITE_ORIGIN, n.east, n.north);
    return {
      id: n.id,
      label: n.label,
      lat: pos.lat,
      lon: pos.lon,
      status: "online",
      battery: [88, 76, 64, 93][i]!,
      sound: 34 + i,
      vibration: 0.04 + i * 0.01,
      temperature: 27.4 + i * 0.3,
      bleDetected: 0,
      wifiDetected: 1,
      rssi: -94 - i,
      loraRssi: -72 - i * 4,
      loraSnr: 9.5 - i * 1.2,
      lastPacket: Date.now(),
      sensorHealth: {
        gps: "ok",
        mic: "ok",
        vibration: "ok",
        thermal: i === 2 ? "warn" : "ok",
        lora: "ok",
      },
      hops: i === 3 ? 0 : 1,
    };
  });
}

interface KavachState {
  running: boolean;
  mode: "simulation" | "live";
  bootstrapped: boolean;
  nodes: SensorNode[];
  detections: Detection[];
  zones: SearchZone[];
  alerts: AlertItem[];
  logs: LogEvent[];
  calibration: CalibrationSettings;
  tick: number;
}

interface KavachApi extends KavachState {
  start: () => void;
  pause: () => void;
  reset: () => void;
  setMode: (m: "simulation" | "live") => void;
  setCalibration: (c: CalibrationSettings) => void;
  generateSurvivor: () => void;
  generateFalsePositive: () => void;
  simulateNodeFailure: () => void;
  acknowledge: (id: string) => void;
  ingestPacket: (p: TelemetryPacket) => void;
}

const Ctx = createContext<KavachApi | null>(null);

const CAP = <T,>(arr: T[], n: number) => (arr.length > n ? arr.slice(0, n) : arr);

export function KavachProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<KavachState>(() => ({
    running: false,
    mode: "simulation",
    bootstrapped: false,
    nodes: seedNodes(),
    detections: [],
    zones: [],
    alerts: [],
    logs: [],
    calibration: DEFAULT_CALIBRATION,
    tick: 0,
  }));

  /** hidden simulated source: null = ambient only */
  const source = useRef<{
    lat: number;
    lon: number;
    kind: "survivor" | "noise";
    until: number;
  } | null>(null);

  const pushLog = (s: KavachState, level: LogEvent["level"], src: string, msg: string) => {
    s.logs = CAP(
      [{ id: uid("log"), ts: Date.now(), level, source: src, message: msg }, ...s.logs],
      400,
    );
  };

  const pushAlert = (s: KavachState, a: Omit<AlertItem, "id" | "ts" | "acknowledged">) => {
    s.alerts = CAP(
      [{ ...a, id: uid("alr"), ts: Date.now(), acknowledged: false }, ...s.alerts],
      120,
    );
  };

  const runTick = useCallback(() => {
    setState((prev) => {
      const s: KavachState = {
        ...prev,
        nodes: prev.nodes.map((n) => ({ ...n })),
        detections: [...prev.detections],
        zones: [...prev.zones],
        alerts: [...prev.alerts],
        logs: [...prev.logs],
        tick: prev.tick + 1,
      };
      const now = Date.now();
      const src = source.current && source.current.until > now ? source.current : null;
      if (source.current && source.current.until <= now) source.current = null;

      const observations: { nodeId: NodeId; lat: number; lon: number; rssi: number }[] = [];

      for (const n of s.nodes) {
        if (n.status === "offline") continue;
        n.lastPacket = now;
        n.battery = clamp(n.battery - (rng() < 0.35 ? 0.1 : 0), 0, 100);
        n.loraRssi = clamp(n.loraRssi + jitter(2), -118, -55);
        n.loraSnr = clamp(n.loraSnr + jitter(0.6), -8, 12);
        n.sound = clamp(n.sound + jitter(1.4), 30, 92);
        n.vibration = clamp(n.vibration + jitter(0.015), 0.01, 0.9);
        n.temperature = clamp(n.temperature + jitter(0.15), 25.5, 39);

        if (src) {
          const d = metresBetween(n, src);
          const noiseAmp = src.kind === "survivor" ? 3 : 9;
          const rssi = clamp(
            distanceToRssi(d, s.calibration) + jitter(noiseAmp),
            -103,
            -42,
          );
          n.rssi = rssi;
          n.bleDetected = src.kind === "survivor" ? 1 : rng() < 0.5 ? 1 : 0;
          n.wifiDetected = 1 + (rng() < 0.4 ? 1 : 0);
          observations.push({ nodeId: n.id, lat: n.lat, lon: n.lon, rssi });

          if (src.kind === "survivor") {
            n.sound = clamp(n.sound + 6 / Math.max(1, d / 25), 30, 95);
            n.vibration = clamp(n.vibration + 0.12 / Math.max(1, d / 25), 0, 1);
            n.temperature = clamp(n.temperature + 2.2 / Math.max(1, d / 25), 25, 40);
          }

          if (rng() < 0.55) {
            s.detections = CAP(
              [
                {
                  id: uid("det"),
                  ts: now,
                  nodeId: n.id,
                  signalType: rng() < 0.6 ? "BLE" : "Wi-Fi",
                  tempId: `TMP-${n.id}-${(1000 + Math.floor(rng() * 8999)).toString(16).toUpperCase()}`,
                  rssi: Math.round(rssi),
                  distance: Math.round(rssiToDistance(rssi, s.calibration) * 10) / 10,
                  persistence:
                    src.kind === "survivor"
                      ? clamp(0.6 + rng() * 0.35, 0, 1)
                      : clamp(rng() * 0.45, 0, 1),
                  status:
                    src.kind === "survivor"
                      ? "tracking"
                      : rng() < 0.5
                        ? "intermittent"
                        : "lost",
                },
                ...s.detections,
              ],
              250,
            );
            pushLog(
              s,
              "info",
              n.id,
              `${n.id} detected ${rng() < 0.6 ? "BLE" : "Wi-Fi"} signal · RSSI ${Math.round(rssi)} dBm`,
            );
          }
        } else {
          n.rssi = clamp(-95 + jitter(4), -104, -80);
          n.bleDetected = 0;
          n.wifiDetected = rng() < 0.3 ? 1 : 0;
          if (rng() < 0.18) pushLog(s, "info", n.id, `RSSI sample received (ambient floor)`);
        }

        if (n.vibration > 0.55 && rng() < 0.5)
          pushLog(s, "warn", n.id, `${n.id} vibration threshold exceeded (${n.vibration.toFixed(2)} g)`);
        if (n.battery < 20 && rng() < 0.1)
          pushAlert(s, {
            kind: "node",
            severity: "warning",
            title: "Low battery",
            reason: `Battery at ${n.battery.toFixed(0)}% — schedule cell swap`,
            target: n.id,
          });
      }

      if (rng() < 0.12) pushLog(s, "info", "MESH", "Mesh route updated · gateway path re-optimised");

      // Localization + fusion
      if (src && observations.length >= 3) {
        const fix = localize(observations, s.calibration);
        if (fix) {
          const persistence =
            src.kind === "survivor" ? clamp(0.65 + rng() * 0.3, 0, 1) : clamp(rng() * 0.4, 0, 1);
          const evidence = buildEvidence(
            s.nodes.filter((n) => n.status !== "offline"),
            persistence,
          );
          const score = scoreEvidence(evidence);
          const priority = priorityOf(score);
          const existing = s.zones[0];
          const zone: SearchZone = {
            id: existing && now - existing.ts < 90_000 ? existing.id : uid("zone"),
            ts: now,
            lat: fix.lat,
            lon: fix.lon,
            radius: Math.round(fix.radius),
            score,
            priority,
            evidence,
            contributingNodes: fix.nodes,
            note:
              src.kind === "survivor"
                ? "Correlated multi-sensor evidence — possible survivor"
                : "Inconsistent evidence — likely environmental noise",
          };
          s.zones = CAP(
            [zone, ...s.zones.filter((z) => z.id !== zone.id)],
            12,
          );
          if (priority === "HIGH" && !s.alerts.some((a) => a.target === zone.id)) {
            pushAlert(s, {
              kind: "zone",
              severity: "critical",
              title: "HIGH priority probable search zone",
              reason: `Search priority score ${score}/100 from ${fix.nodes.length} nodes · confidence radius ±${Math.round(fix.radius)} m`,
              target: zone.id,
            });
            pushLog(s, "critical", "FUSION", `Probable search zone raised · score ${score}/100`);
          }
        }
      }

      return s;
    });
  }, []);

  useEffect(() => {
    if (!state.running) return;
    const t = setInterval(runTick, 2500);
    return () => clearInterval(t);
  }, [state.running, runTick]);

  const api = useMemo<KavachApi>(
    () => ({
      ...state,
      start: () =>
        setState((p) => {
          const s = { ...p, running: true, bootstrapped: true, logs: [...p.logs] };
          pushLog(s, "info", "SYSTEM", "Simulation engine started · telemetry interval 2.5 s");
          return s;
        }),
      pause: () =>
        setState((p) => {
          const s = { ...p, running: false, logs: [...p.logs] };
          pushLog(s, "warn", "SYSTEM", "Simulation paused by operator");
          return s;
        }),
      reset: () => {
        source.current = null;
        setState((p) => ({
          running: false,
          mode: p.mode,
          bootstrapped: true,
          nodes: seedNodes(),
          detections: [],
          zones: [],
          alerts: [],
          logs: [
            {
              id: uid("log"),
              ts: Date.now(),
              level: "info",
              source: "SYSTEM",
              message: "Scenario reset · baseline telemetry restored",
            },
          ],
          calibration: p.calibration,
          tick: 0,
        }));
      },
      setMode: (mode) =>
        setState((p) => {
          const s = { ...p, mode, logs: [...p.logs] };
          pushLog(
            s,
            "info",
            "SYSTEM",
            mode === "live"
              ? "Switched to LIVE mode · awaiting LoRa gateway packets (no hardware attached)"
              : "Switched to SIMULATION mode",
          );
          return s;
        }),
      setCalibration: (calibration) => setState((p) => ({ ...p, calibration })),
      generateSurvivor: () => {
        const p = offsetMetres(SITE_ORIGIN, jitter(70), jitter(70));
        source.current = { ...p, kind: "survivor", until: Date.now() + 120_000 };
        setState((prev) => {
          const s = { ...prev, running: true, bootstrapped: true, logs: [...prev.logs] };
          pushLog(s, "critical", "SCENARIO", "Possible survivor signal injected · correlating nodes N01–N04");
          return s;
        });
        runTick();
      },
      generateFalsePositive: () => {
        const p = offsetMetres(SITE_ORIGIN, jitter(150), jitter(150));
        source.current = { ...p, kind: "noise", until: Date.now() + 60_000 };
        setState((prev) => {
          const s = { ...prev, running: true, bootstrapped: true, logs: [...prev.logs] };
          pushLog(s, "warn", "SCENARIO", "Noise / false-positive source injected · evidence will be inconsistent");
          return s;
        });
        runTick();
      },
      simulateNodeFailure: () =>
        setState((p) => {
          const s = { ...p, nodes: p.nodes.map((n) => ({ ...n })), logs: [...p.logs], alerts: [...p.alerts] };
          const victim = s.nodes.find((n) => n.status === "online" && n.id !== "N04");
          if (!victim) return p;
          victim.status = "offline";
          victim.sensorHealth = { ...victim.sensorHealth, lora: "fail" };
          s.nodes.forEach((n) => {
            if (n.status === "online" && n.id !== "N04") n.hops = 2;
          });
          pushAlert(s, {
            kind: "node",
            severity: "critical",
            title: "Node offline",
            reason: `${victim.id} stopped transmitting · mesh re-routing neighbours via N04 gateway`,
            target: victim.id,
          });
          pushLog(s, "critical", "MESH", `${victim.id} offline · mesh route updated (2-hop path via N04)`);
          return s;
        }),
      acknowledge: (id) =>
        setState((p) => ({
          ...p,
          alerts: p.alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)),
        })),
      ingestPacket: (packet) =>
        setState((p) => {
          const s = { ...p, nodes: p.nodes.map((n) => ({ ...n })), logs: [...p.logs] };
          const n = s.nodes.find((x) => x.id === packet.nodeId);
          if (!n) return p;
          Object.assign(n, {
            lat: packet.latitude,
            lon: packet.longitude,
            sound: packet.sound,
            vibration: packet.vibration,
            temperature: packet.temperature,
            bleDetected: packet.bleDetected,
            wifiDetected: packet.wifiDetected,
            rssi: packet.rssi,
            battery: packet.battery,
            lastPacket: packet.timestamp,
            loraRssi: packet.loraRssi,
            loraSnr: packet.loraSnr,
            status: "online" as const,
          });
          pushLog(s, "info", "API", `Telemetry packet ingested from ${packet.nodeId}`);
          return s;
        }),
    }),
    [state, runTick],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useKavach() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useKavach must be used inside <KavachProvider>");
  return ctx;
}
