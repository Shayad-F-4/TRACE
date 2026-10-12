import type {
  CalibrationSettings,
  EvidenceBreakdown,
  NodeId,
  Priority,
  SensorNode,
} from "./types";

/* ------------------------------------------------------------------ */
/* Deterministic pseudo random (seeded) so demos are reproducible      */
/* ------------------------------------------------------------------ */
export function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/* ------------------------------------------------------------------ */
/* Geo helpers (local flat-earth approximation, fine at this scale)    */
/* ------------------------------------------------------------------ */
export const M_PER_DEG_LAT = 111_320;
export const mPerDegLon = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

export function metresBetween(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
) {
  const dy = (a.lat - b.lat) * M_PER_DEG_LAT;
  const dx = (a.lon - b.lon) * mPerDegLon(a.lat);
  return Math.hypot(dx, dy);
}

export function offsetMetres(
  origin: { lat: number; lon: number },
  east: number,
  north: number,
) {
  return {
    lat: origin.lat + north / M_PER_DEG_LAT,
    lon: origin.lon + east / mPerDegLon(origin.lat),
  };
}

/* ------------------------------------------------------------------ */
/* Log-distance path-loss model: d = 10 ^ ((RSSI_ref - RSSI) / (10n))   */
/* ------------------------------------------------------------------ */
export function rssiToDistance(rssi: number, cal: CalibrationSettings) {
  const d = Math.pow(10, (cal.refRssi - rssi) / (10 * cal.pathLossExponent));
  return clamp(d, 0.5, 500);
}

export function distanceToRssi(distance: number, cal: CalibrationSettings) {
  return cal.refRssi - 10 * cal.pathLossExponent * Math.log10(Math.max(0.5, distance));
}

export interface LocalizationInput {
  nodeId: NodeId;
  lat: number;
  lon: number;
  rssi: number;
  age?: number;
  variance?: number;
}

export interface LocalizationResult {
  lat: number;
  lon: number;
  radius: number;
  residual: number;
  nodes: NodeId[];
  confidence: number;
}

/**
 * Weighted multilateration by coarse-to-fine grid search on the
 * least-squares residual of (measured range - geometric range).
 * Stronger RSSI observations get more weight. Returns a probable
 * search ZONE (centre + confidence radius), never an exact fix.
 */
export function localize(
  observations: LocalizationInput[],
  cal: CalibrationSettings,
): LocalizationResult | null {
  observations = observations.filter((o) => Number.isFinite(o.rssi) && (o.age ?? 0) < 60);
  if (new Set(observations.map((o) => o.nodeId)).size < 3) return null;

  const ranges = observations.map((o) => ({
    ...o,
    d: rssiToDistance(o.rssi, cal),
    w: clamp((o.rssi + 120) / 80, 0.15, 1) / (1 + (o.variance ?? 0) / 9 + (o.age ?? 0) / 15),
  }));

  const lat0 = ranges.reduce((s, r) => s + r.lat, 0) / ranges.length;
  const lon0 = ranges.reduce((s, r) => s + r.lon, 0) / ranges.length;

  const cost = (lat: number, lon: number) => {
    let sum = 0;
    let wsum = 0;
    for (const r of ranges) {
      const g = metresBetween({ lat, lon }, { lat: r.lat, lon: r.lon });
      sum += r.w * (g - r.d) ** 2;
      wsum += r.w;
    }
    return Math.sqrt(sum / wsum);
  };

  let best = { lat: lat0, lon: lon0, cost: cost(lat0, lon0) };
  let span = 260; // metres
  for (let pass = 0; pass < 5; pass++) {
    const step = span / 8;
    const centre = { ...best };
    for (let iy = -8; iy <= 8; iy++) {
      for (let ix = -8; ix <= 8; ix++) {
        const p = offsetMetres(centre, ix * step, iy * step);
        const c = cost(p.lat, p.lon);
        if (c < best.cost) best = { lat: p.lat, lon: p.lon, cost: c };
      }
    }
    span = span / 3;
  }

  const xs = observations.map((o) => (o.lon - lon0) * mPerDegLon(lat0));
  const ys = observations.map((o) => (o.lat - lat0) * M_PER_DEG_LAT);
  const xx = xs.reduce((s, x) => s + x*x, 0);
  const yy = ys.reduce((s, y) => s + y*y, 0);
  const xy = xs.reduce((s, x, i) => s + x * (ys[i] ?? 0), 0);
  const geometry = clamp(4 * (xx*yy - xy*xy) / Math.max(1, (xx + yy)**2), 0, 1);
  const uncertainty = observations.reduce((s, o) => s + Math.sqrt(o.variance ?? 0) * 2 + (o.age ?? 0), 0) / observations.length;
  const geometryPenalty = 1 + (1 - geometry) * 2 + Math.max(0, 4 - observations.length) * 0.15;
  const radius = clamp(
    (8 + best.cost * 1.4 + uncertainty) * geometryPenalty,
    cal.minRadius,
    cal.maxRadius,
  );

  return {
    lat: best.lat,
    lon: best.lon,
    radius,
    residual: best.cost,
    nodes: observations.map((o) => o.nodeId),
    confidence: Math.round(clamp(90 - best.cost * 0.7 - uncertainty - (1 - geometry) * 35, 5, 90)),
  };
}

/* ------------------------------------------------------------------ */
/* Prototype rule-based sensor fusion                                  */
/* Structured so an ML model / API can replace scoreEvidence() later.  */
/* ------------------------------------------------------------------ */
export const FUSION_WEIGHTS: Record<keyof EvidenceBreakdown, number> = {
  wirelessPersistence: 0.3,
  rssiStrength: 0.25,
  sound: 0.18,
  vibration: 0.15,
  thermal: 0.12,
};

const norm = (v: number, lo: number, hi: number) => clamp((v - lo) / (hi - lo), 0, 1);

export function buildEvidence(
  nodes: SensorNode[],
  persistence: number,
): EvidenceBreakdown {
  const active = nodes.filter((n) => n.status !== "offline");
  if (active.length === 0) {
    return {
      wirelessPersistence: 0,
      rssiStrength: 0,
      sound: 0,
      vibration: 0,
      thermal: 0,
    };
  }
  const avg = (f: (n: SensorNode) => number) =>
    active.reduce((s, n) => s + f(n), 0) / active.length;

  return {
    wirelessPersistence: clamp(persistence, 0, 1),
    rssiStrength: norm(Math.max(...active.map((n) => n.rssi)), -100, -45),
    sound: norm(avg((n) => n.sound), 30, 80),
    vibration: norm(avg((n) => n.vibration), 0.02, 0.6),
    thermal: norm(avg((n) => n.temperature), 26, 35),
  };
}

export function scoreEvidence(e: EvidenceBreakdown) {
  const raw = (Object.keys(FUSION_WEIGHTS) as (keyof EvidenceBreakdown)[]).reduce(
    (s, k) => s + FUSION_WEIGHTS[k] * e[k],
    0,
  );
  // Consistency factor: scattered evidence is penalised (false-positive guard).
  const vals = Object.values(e);
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
  const consistency = clamp(1 - sd * 0.7, 0.55, 1);
  return Math.round(clamp(raw * consistency * 100, 0, 99));
}

export function priorityOf(score: number): Priority {
  if (score >= 68) return "HIGH";
  if (score >= 42) return "MEDIUM";
  return "LOW";
}
