/*
 * TRACE — Triangulated Rescue Aid via Crowd-Signal Estimation
 * Firmware: ESP32 Field Sniffer Anchor Station
 *
 * Microcontroller: ESP32-WROOM-32D / ESP32-S3
 * Radio: Semtech SX1262 / SX1276 (RadioLib)
 * Scanner: Promiscuous 2.4 GHz BLE (NimBLE-Arduino)
 * Sensors: Acoustic sound level (ADC GPIO 34), Battery monitor (ADC GPIO 35)
 * Uplink: LoRa broadcast to gateway concentrator
 */

#include <NimBLEDevice.h>
#include <RadioLib.h>
#include <ArduinoJson.h>

// ==========================================
// NODE IDENTITY & CONFIGURATION
// Change NODE_ID and static survey GPS for each physical anchor:
// ==========================================
#define NODE_ID        "NODE-N01"
#define NODE_LAT       19.876380   // Surveyed WGS84 Latitude
#define NODE_LON       74.478680   // Surveyed WGS84 Longitude

// LoRa Pin Configuration (SX1262 SPI)
#define LORA_CS        5
#define LORA_DIO1      14
#define LORA_RST       26
#define LORA_BUSY      27

#define PIN_SOUND_ADC  34   // Analog microphone / acoustic sensor
#define PIN_BATT_ADC   35   // Battery voltage divider (e.g. 100k / 100k)
#define STATUS_LED     2

#define LORA_FREQ_MHZ  868.1
#define LORA_BW_KHZ    125.0
#define LORA_SF        7
#define LORA_CR        7
#define LORA_SYNCWORD  0x12
#define LORA_POWER_DBM 14

SX1262 radio = new Module(LORA_CS, LORA_DIO1, LORA_RST, LORA_BUSY);

NimBLEScan* pBLEScan = nullptr;
uint32_t packetSeq = 1000;
int16_t strongestRssi = -120;
uint16_t bleDevicesSeen = 0;

class AdvertisedDeviceCallbacks : public NimBLEAdvertisedDeviceCallbacks {
  void onResult(NimBLEAdvertisedDevice* advertisedDevice) {
    int rssi = advertisedDevice->getRSSI();
    bleDevicesSeen++;
    if (rssi > strongestRssi) {
      strongestRssi = rssi;
    }
  }
};

float readBatteryPercent() {
  // 12-bit ADC (0..4095) with 2:1 resistor divider -> 3.3V full-scale = 6.6V max
  int raw = analogRead(PIN_BATT_ADC);
  float voltage = (raw / 4095.0) * 3.3 * 2.0;
  // 1S Li-ion battery: 4.2V = 100%, 3.2V = 0%
  float pct = ((voltage - 3.2) / (4.2 - 3.2)) * 100.0;
  return constrain(pct, 0.0, 100.0);
}

float readAcousticLevel() {
  int raw = analogRead(PIN_SOUND_ADC);
  // Approximate SPL calibration (35 dB baseline to 95 dB peak)
  float db = 35.0 + (raw / 4095.0) * 60.0;
  return constrain(db, 30.0, 110.0);
}

void setup() {
  pinMode(STATUS_LED, OUTPUT);
  Serial.begin(115200);

  Serial.println(F("TRACE Sniffer Station Starting: " NODE_ID));

  // 1. Initialize RadioLib LoRa
  int state = radio.begin(LORA_FREQ_MHZ, LORA_BW_KHZ, LORA_SF, LORA_CR, LORA_SYNCWORD, LORA_POWER_DBM);
  if (state != RADIOLIB_ERR_NONE) {
    Serial.print(F("Radio init failed: "));
    Serial.println(state);
  }

  // 2. Initialize NimBLE Promiscuous Scanner
  NimBLEDevice::init(NODE_ID);
  pBLEScan = NimBLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new AdvertisedDeviceCallbacks());
  pBLEScan->setActiveScan(false); // Passive promiscuous sniffing (stealth/low-power)
  pBLEScan->setInterval(97);
  pBLEScan->setWindow(67);
  pBLEScan->setMaxResults(0); // Do not store in RAM
}

void loop() {
  // 1. Scan for BLE crowd signals for 2.5 seconds
  strongestRssi = -120;
  bleDevicesSeen = 0;
  pBLEScan->start(2, false);
  pBLEScan->clearResults();

  // 2. Read physical sensors
  float battery = readBatteryPercent();
  float soundSpl = readAcousticLevel();
  packetSeq++;

  // Default fallback RSSI if no active device seen in scan window
  float reportedRssi = (bleDevicesSeen > 0) ? strongestRssi : -85.0;

  // 3. Format telemetry JSON payload
  StaticJsonDocument<384> doc;
  doc["deviceId"] = NODE_ID;
  doc["seq"] = packetSeq;
  doc["latitude"] = NODE_LAT;
  doc["longitude"] = NODE_LON;
  doc["rssi"] = reportedRssi;
  doc["sound"] = round(soundSpl * 10.0) / 10.0;
  doc["battery"] = round(battery * 10.0) / 10.0;
  doc["bleDetected"] = bleDevicesSeen;
  doc["timestamp"] = millis();

  String payload;
  serializeJson(doc, payload);

  // 4. Transmit over LoRa
  digitalWrite(STATUS_LED, HIGH);
  int txState = radio.transmit(payload);
  digitalWrite(STATUS_LED, LOW);

  if (txState == RADIOLIB_ERR_NONE) {
    Serial.print(F("[TX OK] -> "));
    Serial.println(payload);
  } else {
    Serial.print(F("[TX ERR] Code: "));
    Serial.println(txState);
  }

  // Standby interval before next scan cycle
  delay(1500);
}
