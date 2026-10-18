/*
 * TRACE — Triangulated Rescue Aid via Crowd-Signal Estimation
 * Firmware: ESP32 LoRa Gateway Concentrator Bridge
 *
 * Microcontroller: ESP32-WROOM-32D / ESP32-S3
 * Radio: Semtech SX1262 / SX1276 (RadioLib 6.6.0+)
 * Uplink: USB Serial (115200 baud) streaming JSON lines to companion daemon
 * Optional: Onboard status LED on GPIO 2
 */

#include <RadioLib.h>
#include <ArduinoJson.h>

// ==========================================
// PIN DEFINITIONS (SX1262 SPI Interface)
// Change according to your module breakout:
// Standard ESP32 DevKit to SX1262 Wiring:
// ==========================================
#define LORA_CS    5    // NSS / Chip Select
#define LORA_DIO1  14   // DIO1 / IRQ
#define LORA_RST   26   // NRESET
#define LORA_BUSY  27   // BUSY (For SX1262; if using SX1276 set to -1)
#define STATUS_LED 2    // Onboard Blue/Green LED

// Radio Frequency Settings
#define LORA_FREQ_MHZ  868.1   // 868.1 MHz for IN/EU, 915.0 MHz for US
#define LORA_BW_KHZ    125.0   // Bandwidth: 125 kHz
#define LORA_SF        7       // Spreading Factor: SF7 (balanced range/airtime)
#define LORA_CR        7       // Coding Rate: 4/7
#define LORA_SYNCWORD  0x12    // Private sync word for TRACE network
#define LORA_POWER_DBM 14      // 14 dBm Tx power

#define GATEWAY_ID     "GW-PRIMARY-ALPHA"

// Instantiate RadioLib module (SX1262 default; swap for SX1276 if using RFM95)
SX1262 radio = new Module(LORA_CS, LORA_DIO1, LORA_RST, LORA_BUSY);

uint32_t lastHeartbeat = 0;
const uint32_t HEARTBEAT_INTERVAL_MS = 15000;
uint32_t packetCount = 0;

void blinkLed(uint8_t count = 1, uint16_t durationMs = 50) {
  for (uint8_t i = 0; i < count; i++) {
    digitalWrite(STATUS_LED, HIGH);
    delay(durationMs);
    digitalWrite(STATUS_LED, LOW);
    if (i < count - 1) delay(50);
  }
}

void setup() {
  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(STATUS_LED, LOW);

  Serial.begin(115200);
  while (!Serial && millis() < 3000);

  Serial.println(F("{\"type\":\"gateway_boot\",\"gatewayId\":\"" GATEWAY_ID "\",\"status\":\"initializing\"}"));

  // Initialize RadioLib LoRa transceiver
  int state = radio.begin(
    LORA_FREQ_MHZ,
    LORA_BW_KHZ,
    LORA_SF,
    LORA_CR,
    LORA_SYNCWORD,
    LORA_POWER_DBM,
    8 // Preamble length
  );

  if (state == RADIOLIB_ERR_NONE) {
    Serial.println(F("{\"type\":\"gateway_boot\",\"gatewayId\":\"" GATEWAY_ID "\",\"status\":\"online\",\"freq\":868.1,\"sf\":7,\"bw\":125}"));
    blinkLed(3, 100);
  } else {
    Serial.print(F("{\"type\":\"gateway_error\",\"gatewayId\":\"" GATEWAY_ID "\",\"error\":\"init_failed\",\"code\":"));
    Serial.print(state);
    Serial.println(F("}"));
    // Halt with blinking error indication
    while (true) {
      blinkLed(1, 500);
      delay(500);
    }
  }
}

void loop() {
  // Listen for incoming packets over LoRa
  String strData;
  int state = radio.receive(strData);

  if (state == RADIOLIB_ERR_NONE) {
    packetCount++;
    digitalWrite(STATUS_LED, HIGH);

    float snr = radio.getSNR();
    float loraRssi = radio.getRSSI();

    // Check if payload is already JSON
    strData.trim();
    if (strData.startsWith("{") && strData.endsWith("}")) {
      StaticJsonDocument<512> doc;
      DeserializationError err = deserializeJson(doc, strData);
      if (!err) {
        doc["gatewayId"] = GATEWAY_ID;
        doc["loraRssi"] = loraRssi;
        doc["loraSnr"] = snr;
        serializeJson(doc, Serial);
        Serial.println();
      } else {
        // Forward raw line if JSON parsing failed
        Serial.println(strData);
      }
    } else {
      // Forward raw string
      Serial.println(strData);
    }

    digitalWrite(STATUS_LED, LOW);
  }

  // Periodic Gateway Heartbeat over Serial
  if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeat = millis();
    Serial.print(F("{\"type\":\"gateway_heartbeat\",\"gatewayId\":\"" GATEWAY_ID "\",\"uptime\":"));
    Serial.print(millis() / 1000);
    Serial.print(F(",\"packetsReceived\":"));
    Serial.print(packetCount);
    Serial.println(F("}"));
  }
}
