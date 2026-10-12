# TRACE — Triangulated Rescue Aid via Crowd-Signal Estimation

Disaster-response research prototype for Sanjivani College of Engineering, Kopargaon. Built in place on the existing KAVACH React / TanStack Start / Tailwind application.

## Demo
Open Command Overview. The deterministic simulator starts with three sniffers, one gateway and one synthetic source. All telemetry is synthetic. In Simulation Lab, pause/step/reset, move markers, change source paths, adjust noise, toggle nodes and disconnect the gateway. Reports support CSV and Print / Save as PDF.

## Modes and safety
The top-bar selector switches between isolated simulation and hardware datasets. Hardware mode starts disconnected and empty. No signals is never inferred from a missing connection. Ground truth is shown only in Simulation Lab. Heuristic confidence is not a validated probability, and RSSI zones are not exact survivor positions.

## Hardware hooks
`src/lib/kavach/api.ts` provides a browser transport abstraction and proposed `/api/v1` contracts. Settings can check a deployed nodes API; reachability does not prove gateway or LoRa connectivity. No ingestion server, authentication, database or paid service is provisioned. State is intentionally session-local and clears on reload.

For production, deploy authenticated TLS ingestion, validate heartbeat timestamps and schemas, implement durable incident association and retention, rotate anonymous signal identifiers, enforce gateway permissions and configure CORS. Wire incoming validated telemetry into the provider's `ingestPacket` boundary. Firmware is flashed with Arduino IDE / PlatformIO, never from this website. LoRa relay routing depends on firmware; LoRaWAN is not native mesh.

## Estimation
RSSI log-distance model and weighted least-squares grid search use three distinct fresh sniffer observations. Radius and heuristic confidence consider geometry, RSSI variance and age. Transparent sensor fusion combines wireless persistence, RSSI, acoustic, vibration and thermal evidence. No accuracy claims are made.

## Development
Use `bun install` and `bun run dev`. The editor checks compilation automatically. No additional animation or mapping library was installed; tactical visuals are local SVG and motion is CSS with reduced-motion support.
