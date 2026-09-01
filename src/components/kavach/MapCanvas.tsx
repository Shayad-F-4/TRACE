import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { M_PER_DEG_LAT, mPerDegLon, rssiToDistance } from "@/lib/kavach/engine";
import { SITE_ORIGIN } from "@/lib/kavach/store";
import type { CalibrationSettings, SearchZone, SensorNode } from "@/lib/kavach/types";

const HALF_SPAN = 260; // metres from site origin to map edge

interface Props {
  nodes: SensorNode[];
  zones: SearchZone[];
  calibration: CalibrationSettings;
  selectedNode?: string | null;
  onSelectNode?: (id: string) => void;
  className?: string;
}

export function MapCanvas({
  nodes,
  zones,
  calibration,
  selectedNode,
  onSelectNode,
  className,
}: Props) {
  const project = useMemo(() => {
    const mLon = mPerDegLon(SITE_ORIGIN.lat);
    return (lat: number, lon: number) => {
      const east = (lon - SITE_ORIGIN.lon) * mLon;
      const north = (lat - SITE_ORIGIN.lat) * M_PER_DEG_LAT;
      return {
        x: 500 + (east / HALF_SPAN) * 500,
        y: 500 - (north / HALF_SPAN) * 500,
      };
    };
  }, []);

  const toPx = (m: number) => (m / HALF_SPAN) * 500;

  return (
    <div className={cn("relative overflow-hidden rounded-md bg-map-surface", className)}>
      <svg viewBox="0 0 1000 1000" className="h-full w-full" role="img" aria-label="Search area map">
        <defs>
          <pattern id="kv-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M50 0H0V50" fill="none" stroke="var(--grid-line)" strokeWidth="1" />
          </pattern>
          <radialGradient id="kv-zone" cx="50%" cy="50%">
            <stop offset="0%" stopColor="var(--critical)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--critical)" stopOpacity="0.06" />
          </radialGradient>
          <radialGradient id="kv-zone-low" cx="50%" cy="50%">
            <stop offset="0%" stopColor="var(--warning)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--warning)" stopOpacity="0.05" />
          </radialGradient>
        </defs>

        <rect width="1000" height="1000" fill="url(#kv-grid)" />

        {/* rubble / structure footprints for context */}
        <g fill="var(--accent)" opacity="0.75" stroke="var(--border)">
          <polygon points="380,330 640,300 690,470 420,520" />
          <polygon points="250,600 470,580 500,720 280,760" />
          <polygon points="620,600 800,640 770,780 600,740" />
        </g>
        <g
          fontSize="16"
          fill="var(--muted-foreground)"
          fontFamily="ui-monospace, monospace"
        >
          <text x="400" y="420">COLLAPSED BLOCK A</text>
          <text x="270" y="670">DEBRIS FIELD B</text>
          <text x="630" y="700">SLAB C</text>
        </g>

        {/* coverage circles */}
        {nodes.map((n) => {
          const p = project(n.lat, n.lon);
          if (n.status === "offline") return null;
          return (
            <circle
              key={`cov-${n.id}`}
              cx={p.x}
              cy={p.y}
              r={toPx(120)}
              fill="var(--success)"
              fillOpacity="0.05"
              stroke="var(--success)"
              strokeOpacity="0.28"
              strokeDasharray="6 6"
            />
          );
        })}

        {/* estimated signal-distance circles from latest RSSI */}
        {nodes.map((n) => {
          if (n.status === "offline" || n.rssi < -99) return null;
          const p = project(n.lat, n.lon);
          return (
            <circle
              key={`rng-${n.id}`}
              cx={p.x}
              cy={p.y}
              r={toPx(rssiToDistance(n.rssi, calibration))}
              fill="none"
              stroke="var(--info)"
              strokeOpacity="0.6"
              strokeWidth="1.5"
              strokeDasharray="3 5"
            />
          );
        })}

        {/* mesh links */}
        {nodes
          .filter((n) => n.status !== "offline" && n.id !== "N04")
          .map((n) => {
            const gw = nodes.find((x) => x.id === "N04");
            if (!gw) return null;
            const a = project(n.lat, n.lon);
            const b = project(gw.lat, gw.lon);
            return (
              <line
                key={`link-${n.id}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="var(--primary)"
                strokeOpacity="0.3"
                strokeWidth="2"
                strokeDasharray="10 8"
              />
            );
          })}

        {/* probable search zones */}
        {zones.slice(0, 3).map((z, i) => {
          const p = project(z.lat, z.lon);
          const r = Math.max(18, toPx(z.radius));
          const high = z.priority === "HIGH";
          return (
            <g key={z.id} opacity={i === 0 ? 1 : 0.55}>
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                fill={high ? "url(#kv-zone)" : "url(#kv-zone-low)"}
                stroke={high ? "var(--critical)" : "var(--warning)"}
                strokeWidth="2.5"
                strokeDasharray="8 6"
              />
              <circle cx={p.x} cy={p.y} r="6" fill={high ? "var(--critical)" : "var(--warning)"} />
              <text
                x={p.x + r + 8}
                y={p.y - 4}
                fontSize="17"
                fontWeight="700"
                fill={high ? "var(--critical)" : "var(--warning)"}
              >
                {z.priority} · {z.score}/100
              </text>
              <text x={p.x + r + 8} y={p.y + 16} fontSize="15" fill="var(--muted-foreground)">
                probable zone ±{z.radius} m
              </text>
            </g>
          );
        })}

        {/* nodes */}
        {nodes.map((n) => {
          const p = project(n.lat, n.lon);
          const color =
            n.status === "offline"
              ? "var(--critical)"
              : n.status === "degraded"
                ? "var(--warning)"
                : "var(--primary)";
          const selected = selectedNode === n.id;
          return (
            <g
              key={n.id}
              onClick={() => onSelectNode?.(n.id)}
              className={onSelectNode ? "cursor-pointer" : undefined}
            >
              {selected && (
                <circle cx={p.x} cy={p.y} r="30" fill="none" stroke={color} strokeWidth="2" />
              )}
              <rect
                x={p.x - 17}
                y={p.y - 17}
                width="34"
                height="34"
                rx="8"
                fill={color}
                stroke="var(--card)"
                strokeWidth="3"
              />
              <text
                x={p.x}
                y={p.y + 6}
                fontSize="16"
                fontWeight="700"
                textAnchor="middle"
                fill="var(--primary-foreground)"
                fontFamily="ui-monospace, monospace"
              >
                {n.id.slice(1)}
              </text>
              <text
                x={p.x}
                y={p.y + 40}
                fontSize="16"
                textAnchor="middle"
                fill="var(--foreground)"
                fontFamily="ui-monospace, monospace"
              >
                {n.id} · {n.battery.toFixed(0)}%
              </text>
            </g>
          );
        })}

        {/* scale bar */}
        <g>
          <line x1="60" y1="940" x2={60 + toPx(100)} y2="940" stroke="var(--foreground)" strokeWidth="3" />
          <text x="60" y="928" fontSize="16" fill="var(--foreground)" fontFamily="ui-monospace, monospace">
            100 m
          </text>
        </g>
      </svg>

      <div className="pointer-events-none absolute left-3 top-3 rounded border border-border bg-card/90 px-2 py-1 text-[11px] mono-num text-muted-foreground">
        {SITE_ORIGIN.lat.toFixed(5)}°N, {SITE_ORIGIN.lon.toFixed(5)}°E · local grid projection
      </div>
      <div className="pointer-events-none absolute right-3 top-3 flex flex-col gap-1 rounded border border-border bg-card/90 px-2 py-1.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-primary" /> sensor node
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full border border-info" /> RSSI range estimate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-critical" /> probable search zone
        </span>
      </div>
    </div>
  );
}
