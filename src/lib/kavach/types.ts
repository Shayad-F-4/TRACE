export type NodeId = "N01" | "N02" | "N03" | "N04";

export type NodeStatus = "online" | "degraded" | "offline";

export interface SensorNode {
  id: NodeId;
  label: string;
  lat: number;
  lon: number;
  status: NodeStatus;
  battery: number; // %
  sound: number; // dB SPL (approx)
  vibration: number; // g (approx)
  temperature: number; // deg C thermal max pixel
  bleDetected: number; // count of temporary device ids
  wifiDetected: number;
  rssi: number; // strongest observed device RSSI (dBm)
  loraRssi: number; // dBm
  loraSnr: number; // dB
  lastPacket: number; // epoch ms
  sensorHealth: Record<string, "ok" | "warn" | "fail">;
  hops: number; // mesh hops to gateway
}

export type SignalType = "BLE" | "Wi-Fi";

export interface Detection {
  id: string;
  ts: number;
  nodeId: NodeId;
  signalType: SignalType;
  tempId: string; // anonymized identifier
  rssi: number;
  distance: number; // metres, estimated
  persistence: number; // 0..1 (how consistently seen)
  status: "tracking" | "intermittent" | "lost";
}

export interface EvidenceBreakdown {
  wirelessPersistence: number;
  rssiStrength: number;
  sound: number;
  vibration: number;
  thermal: number;
}

export type Priority = "HIGH" | "MEDIUM" | "LOW";

export interface SearchZone {
  id: string;
  ts: number;
  lat: number;
  lon: number;
  radius: number; // confidence radius, metres
  score: number; // 0..100 search priority
  priority: Priority;
  evidence: EvidenceBreakdown;
  contributingNodes: NodeId[];
  note: string;
}

export type AlertKind = "zone" | "anomaly" | "node";
export type Severity = "critical" | "warning" | "info";

export interface AlertItem {
  id: string;
  ts: number;
  kind: AlertKind;
  severity: Severity;
  title: string;
  reason: string;
  target: string;
  acknowledged: boolean;
}

export type LogLevel = "info" | "warn" | "critical";

export interface LogEvent {
  id: string;
  ts: number;
  level: LogLevel;
  source: string;
  message: string;
}

export interface CalibrationSettings {
  refRssi: number; // RSSI at 1 m (dBm)
  pathLossExponent: number;
  minRadius: number;
  maxRadius: number;
}

/** Telemetry packet shape expected from ESP32 + LoRa gateway (live mode). */
export interface TelemetryPacket {
  nodeId: NodeId;
  latitude: number;
  longitude: number;
  sound: number;
  vibration: number;
  temperature: number;
  bleDetected: number;
  wifiDetected: number;
  rssi: number;
  battery: number;
  timestamp: number;
  loraRssi: number;
  loraSnr: number;
}
