# TRACE — Triangulated Rescue Aid via Crowd-Signal Estimation

TRACE is a disaster-response research and tactical operations platform designed for rapid localization of trapped survivors in collapsed structures using crowd-signal RF sniffer triangulation, multi-station log-distance path-loss calibration, and real-time operational situational awareness.

---

## 1. System Navigation: 4 Essential Tactical Sections

TRACE has been consolidated into four clean, functional workspaces:

1. **COMMAND CENTER (`/`)**: Tactical HUD showing active incident status, disaster area, live/simulation data modes, last received telemetry, gateway and sniffer counts, heuristic search zone estimates, and dynamic **Recommended Next Action** guidance.
2. **LIVE MAP (`/map`)**: Full-screen 2D tactical disaster map with uniform 1:1 metric projection, true geometric circular uncertainty regions, interactive coordinate inspector with exact GPS decimal degrees and distance/bearing from Command Center, antenna coverage circles, and spatial layer toggles.
3. **DEVICES & CALIBRATION (`/devices`)**: Unified workspace combining hardware gateway concentrator diagnostics, companion serial daemon quickstart, sniffer station inventory, and an interactive 4-step **RF Path-Loss Calibration Wizard** with closed-form OLS regression and versioned profile persistence.
4. **INCIDENT HISTORY (`/history`)**: Operational audit trail, chronological incident timelines, historical multilateration runs with GDOP and residual errors, searchable system audit logs, and sanitized RFC-4180 CSV export.

---

## 2. Technical Documentation Index

Detailed engineering documentation is maintained in the `docs/` directory:

- [**Telemetry Protocol Specification (`docs/TELEMETRY_PROTOCOL.md`)**](docs/TELEMETRY_PROTOCOL.md): Versioned JSON packet envelope (v2.4), field boundaries, validation rules, and duplicate detection.
- [**RF Path-Loss Calibration Guide (`docs/RF_CALIBRATION.md`)**](docs/RF_CALIBRATION.md): Log-distance path-loss mathematical model, OLS closed-form solver, goodness-of-fit diagnostics ($A_0, n, \text{RMSE}, R^2$), and field procedures.
- [**Hardware Integration Guide (`docs/HARDWARE_INTEGRATION.md`)**](docs/HARDWARE_INTEGRATION.md): Physical ESP32 + SX1262 LoRa concentrator architecture, companion daemon setup, and pinout wiring reference.
- [**Arduino & ESP32 Firmware Setup (`docs/ARDUINO_SETUP.md`)**](docs/ARDUINO_SETUP.md): Arduino IDE & PlatformIO configuration, library dependencies (`RadioLib`, `ArduinoJson`, `NimBLE`), and firmware sketches for gateway and sniffer nodes.
- [**Localization Model Specification (`docs/LOCALIZATION_MODEL.md`)**](docs/LOCALIZATION_MODEL.md): Weighted least-squares multilateration algorithm, GDOP formulation, collinearity rejection, and search-priority zone derivation.
- [**Troubleshooting & Diagnostics (`docs/TROUBLESHOOTING.md`)**](docs/TROUBLESHOOTING.md): Remediation steps for map coordinates, COM port locks, baud mismatches, and calibration errors.
- [**Live Demonstration Checklist (`docs/LIVE_DEMO_CHECKLIST.md`)**](docs/LIVE_DEMO_CHECKLIST.md): Step-by-step 5-step operational demonstration guide for field teams and evaluators.

---

## 3. Architecture & Data Flow

```text
PHYSICAL TRANSMITTER (Mobile BLE / Wi-Fi Device)
                    │
                    ▼  2.4 GHz RF (BLE Advertising / Wi-Fi Probe Requests)
   [ESP32 SNIFFER NODES: NODE_01, NODE_02, NODE_03]
                    │
                    ▼  LoRa 868.1 MHz Uplink (SX1262 / SX1276 Module)
        [ESP32 GATEWAY CONCENTRATOR (GW01)]
                    │
                    ▼  USB UART Serial Bridge (115200 baud)
  [HOST MACHINE: scripts/trace_gateway_daemon.py]
                    │
                    ▼  HTTP POST (JSON Telemetry Protocol v2.4)
     [TRACE BACKEND: /api/telemetry/ingest]
                    │
                    ▼  SQLite Database (`data/trace.db`) & Multilateration Engine
    [TRACE WEB CONSOLE & TACTICAL MAP DISPLAY]
```

---

## 4. Quickstart: Running TRACE Locally

### Prerequisites

- **Node.js**: v22+ or v24+ (`node:sqlite` zero-dependency SQLite engine built-in)
- **Python**: 3.9+ (optional, for running the physical gateway companion daemon)

### 1. Environment Setup

Copy the environment template:

```bash
cp .env.example .env
```

Default parameters in `.env`:

```ini
PORT=8080
NODE_ENV=development
DATABASE_PATH=data/trace.db
SESSION_SECRET=trace_dev_secret_key_change_in_production_min_32_chars
GATEWAY_SECRET=trace_dev_gateway_secret_2026
CORS_ORIGIN=*
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Development Server

```bash
npm run dev
```

Open `http://localhost:8080` (or `http://localhost:3000`) in your browser.

### 4. Build & Preview Production Bundle

```bash
npm run build
npm run preview
```

---

## 5. Connecting Physical Hardware vs Simulation Mode

### A. Strict Data Mode Separation

TRACE provides strict physical isolation between data sources:

- **`LIVE HARDWARE` Mode**: Telemetry is ONLY accepted from verified hardware uplinks. If the gateway or sniffer is disconnected, the UI explicitly reports `DISCONNECTED / AWAITING TELEMETRY`. It **never** fabricates fake telemetry to appear functional.
- **`SIMULATION` Mode**: Generates synthetic multi-station RF scenarios for operator training with deterministic PRNG seeds, obstacle attenuation, and noise models. All synthetic records are explicitly tagged `[SIMULATION DATA]`.

### B. Connecting the Physical ESP32 Gateway

1. Flash your ESP32 gateway with the sketch in `docs/ARDUINO_SETUP.md`.
2. Connect the gateway to your host PC via USB.
3. Start the companion daemon:
   ```bash
   # Windows (check Device Manager for COM port)
   python scripts/trace_gateway_daemon.py --port COM3 --baud 115200 --api-key trace_dev_gateway_secret_2026

   # Linux / macOS
   python scripts/trace_gateway_daemon.py --port /dev/ttyUSB0 --baud 115200 --api-key trace_dev_gateway_secret_2026
   ```
4. Verify on **Devices & Calibration** (`/devices`) that the gateway indicator switches to `ONLINE`.

---

## 6. Verification & Automated Tests

All tests, type checks, and linters pass with zero errors:

```bash
# 1. Run automated unit & integration test suites (82/82 passing):
npm test

# 2. Run TypeScript strict type verification (0 errors):
npx tsc --noEmit

# 3. Run ESLint code quality & security checks (0 errors):
npm run lint

# 4. Verify production bundle build:
npm run build
```

---

## 7. Safety & Operational Mandates

- **Probabilistic Search Areas**: Estimated search zones are statistical priority areas derived from RF propagation models, never confirmed survivor locations.
- **No False Assurances**: Absence of telemetry is never interpreted as proof of survivor absence.
- **Anonymized MAC Hashes**: Probe requests and BLE advertisements are cryptographically hashed; no civilian personal identity is stored or inferred.
