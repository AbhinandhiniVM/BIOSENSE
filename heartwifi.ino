/*
  WiFi module ESP32 - bio-signal monitor  (version WITH level converter)  + WiFi
  * DEMO VERSION: PPG values come from a built-in dummy dataset *
  * MAX30102 is wired through the level converter on I2C bus B, but its readings are
    NOT used yet - HR/HRV/SpO2 still come from the dummy dataset *

  Sensors
    PPG (SIMULATED) -> HR, HRV (RMSSD), SpO2      from dummy dataset (MAX30102 on bus B via level converter)
    MPU6050  (IMU)  -> X/Y/Z in g, motion noise   on I2C bus A (Wire)
    TMP117   (temp) -> deg C and deg F            on I2C bus A (Wire)
    EEG bio amp     -> Delta/Theta/Alpha/Beta/Gamma (analog output on GPIO34)

  Connections (all sensors powered from the ESP32 3.3V pin, common GND)
    Bus A : SDA = GPIO21, SCL = GPIO22   -> MPU6050 (AD0 to GND) + TMP117 (ADD0 to GND)
    Bus B : SDA = GPIO25, SCL = GPIO26   -> level converter LV side -> MAX30102 on the HV side
            (level converter: LV = ESP32 3.3V, HV = MAX30102 module supply, common GND)
    EEG   : amp OUT -> GPIO34 (ADC1, input only)

  WiFi (NEW)
    The ESP32 joins your WiFi / phone hotspot (2.4 GHz only).
    Live data as JSON :  http://<ESP32_IP>/data
    The IP address is printed in Serial Monitor at start-up.
    Serial Monitor output (every 1 s) is exactly the same as before.

  Board: ESP32 Dev Module   |   Serial Monitor: 115200 baud
*/

#include <Wire.h>
#include <WiFi.h>        // NEW
#include <WebServer.h>   // NEW

// Defined up top so Arduino's auto-generated prototypes can see it
struct Bands { float d, t, a, b, g; };

// ===================== WIFI SETTINGS (NEW) =====================
const char* WIFI_SSID = "moto g32_6277";      // <-- change this
const char* WIFI_PASS = "roma@2005";  // <-- change this
WebServer server(80);

// Latest values copied here by printReport() so the web page shows exactly what Serial shows (NEW)
float j_hr = 0, j_rmssd = -1, j_spo2 = 0, j_temp = 0;
bool  j_tempOK = false, j_eegOK = false, j_sat = false;
Bands j_b = {0, 0, 0, 0, 0};

// ===================== PINS =====================
#define BUS_A_SDA 21
#define BUS_A_SCL 22
#define BUS_B_SDA 25     // MAX30102 via level converter
#define BUS_B_SCL 26
#define EEG_PIN   34

#define MPU_ADDR  0x68
#define TMP_ADDR  0x48
#define PPG_ADDR  0x57   // MAX30102 I2C address

// ===================== SETTINGS =====================
// EEG
const int   EEG_FS   = 250;               // samples per second
const int   EEG_N    = 256;               // FFT size (power of 2)
const float MAINS_HZ = 50.0;              // 50 for India/Europe, 60 for USA
// IMU
const int   IMU_WIN        = 50;          // samples in the noise window (about 1 s at 50 Hz)
const float MOVE_THRESH_G  = 0.08;        // noise above this = "moving"

// ===================== GLOBALS =====================
bool ppgOK = false, imuOK = false, tmpOK = false;
bool max30102Found = false;   // only used to report wiring; PPG data is still simulated

// ---- PPG (simulated from dataset) ----
uint32_t lastIR = 0;
bool     fingerOn = false;
uint32_t lastBeatMs = 0;
const int IBI_MAX = 30;
float ibiBuf[IBI_MAX];
int   ibiCount = 0, rejectRun = 0;
float spo2Disp = 0;

// Dummy dataset 1: beat-to-beat intervals in ms (resting adult, avg ~71 bpm, RMSSD ~30-35 ms)
const uint16_t IBI_DATA[] = {
  830, 862, 815, 848, 880, 835, 799, 841, 872, 826,
  805, 851, 889, 843, 812, 836, 868, 821, 794, 838,
  866, 829, 808, 847, 875, 832, 811, 845, 884, 840,
  818, 853, 870, 824, 803, 839, 861, 834, 816, 850
};
const int IBI_DATA_N = sizeof(IBI_DATA) / sizeof(IBI_DATA[0]);

// Dummy dataset 2: SpO2 in % (healthy, 96-99), one value per second
const uint8_t SPO2_DATA[] = {
  98, 97, 98, 98, 99, 98, 97, 98, 98, 97,
  98, 99, 98, 98, 97, 97, 98, 98, 99, 98
};
const int SPO2_DATA_N = sizeof(SPO2_DATA) / sizeof(SPO2_DATA[0]);

int      ibiIdx = 0, spo2Idx = 0;
uint32_t nextBeatMs = 0, lastSpo2Ms = 0, ppgStartMs = 0;

// ---- IMU ----
float ax = 0, ay = 0, az = 0;
float magBuf[IMU_WIN];
int   magIdx = 0, magCount = 0;
float motionNoise = 0;
bool  isMoving = false;
uint32_t lastImuMs = 0;

// ---- EEG ----
volatile float    eegBuf[EEG_N];
volatile uint16_t eegRawBuf[EEG_N];
volatile int      eegHead = 0;
volatile uint32_t eegCount = 0;
portMUX_TYPE eegMux = portMUX_INITIALIZER_UNLOCKED;

uint32_t lastPrintMs = 0;

// ===================== SMALL HELPERS =====================
int imin(int a, int b) { return a < b ? a : b; }

bool writeReg(uint8_t addr, uint8_t reg, uint8_t val) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  Wire.write(val);
  return Wire.endTransmission() == 0;
}

int16_t read16(uint8_t hi, uint8_t lo) { return (int16_t)((hi << 8) | lo); }

void scanBus(TwoWire &w, const char *name) {
  Serial.printf("Scan %s:", name);
  int n = 0;
  for (uint8_t a = 1; a < 127; a++) {
    w.beginTransmission(a);
    if (w.endTransmission() == 0) { Serial.printf(" 0x%02X", a); n++; }
  }
  if (!n) Serial.print(" nothing found");
  Serial.println();
}

// ===================== FFT (radix-2, in place) =====================
void fft(float *re, float *im, int n) {
  for (int i = 1, j = 0; i < n; i++) {
    int bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      float t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (int len = 2; len <= n; len <<= 1) {
    float ang = -2.0f * PI / len;
    float wlr = cosf(ang), wli = sinf(ang);
    int half = len >> 1;
    for (int i = 0; i < n; i += len) {
      float wr = 1.0f, wi = 0.0f;
      for (int k = 0; k < half; k++) {
        float ur = re[i + k], ui = im[i + k];
        float vr = re[i + k + half] * wr - im[i + k + half] * wi;
        float vi = re[i + k + half] * wi + im[i + k + half] * wr;
        re[i + k] = ur + vr;            im[i + k] = ui + vi;
        re[i + k + half] = ur - vr;     im[i + k + half] = ui - vi;
        float t = wr * wlr - wi * wli;
        wi = wr * wli + wi * wlr;
        wr = t;
      }
    }
  }
}

// ===================== EEG SAMPLING TASK (core 0) =====================
void eegTask(void *param) {
  // 50/60 Hz notch filter (biquad)
  const float w0 = 2.0f * PI * MAINS_HZ / EEG_FS;
  const float q = 30.0f;
  const float alpha = sinf(w0) / (2.0f * q);
  const float a0 = 1.0f + alpha;
  const float b0 = 1.0f / a0, b1 = -2.0f * cosf(w0) / a0, b2 = 1.0f / a0;
  const float a1 = -2.0f * cosf(w0) / a0, a2 = (1.0f - alpha) / a0;

  float first = analogRead(EEG_PIN);
  float x1 = first, x2 = first, y1 = first, y2 = first;

  TickType_t last = xTaskGetTickCount();
  for (;;) {
    uint16_t raw = analogRead(EEG_PIN);
    float x = raw;
    float y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;

    portENTER_CRITICAL(&eegMux);
    eegBuf[eegHead] = y;
    eegRawBuf[eegHead] = raw;
    eegHead = (eegHead + 1) % EEG_N;
    eegCount++;
    portEXIT_CRITICAL(&eegMux);

    vTaskDelayUntil(&last, pdMS_TO_TICKS(1000 / EEG_FS));
  }
}


bool computeEEG(Bands &out, bool &saturated) {
  static float re[EEG_N], im[EEG_N];
  uint16_t rmin = 4095, rmax = 0;

  portENTER_CRITICAL(&eegMux);
  int head = eegHead;
  for (int i = 0; i < EEG_N; i++) {
    int idx = (head + i) % EEG_N;
    re[i] = eegBuf[idx];
    uint16_t r = eegRawBuf[idx];
    if (r < rmin) rmin = r;
    if (r > rmax) rmax = r;
  }
  portEXIT_CRITICAL(&eegMux);

  float mean = 0;
  for (int i = 0; i < EEG_N; i++) mean += re[i];
  mean /= EEG_N;
  for (int i = 0; i < EEG_N; i++) {
    float w = 0.5f * (1.0f - cosf(2.0f * PI * i / (EEG_N - 1)));   // Hann window
    re[i] = (re[i] - mean) * w;
    im[i] = 0;
  }
  fft(re, im, EEG_N);

  float df = (float)EEG_FS / EEG_N;
  float pd = 0, pt = 0, pa = 0, pb = 0, pg = 0;
  for (int k = 1; k < EEG_N / 2; k++) {
    float f = k * df;
    float p = re[k] * re[k] + im[k] * im[k];
    if (f < 0.5f) continue;
    else if (f < 4.0f)  pd += p;   // Delta 0.5-4 Hz
    else if (f < 8.0f)  pt += p;   // Theta 4-8 Hz
    else if (f < 13.0f) pa += p;   // Alpha 8-13 Hz
    else if (f < 30.0f) pb += p;   // Beta 13-30 Hz
    else if (f < 45.0f) pg += p;   // Gamma 30-45 Hz
    else break;
  }
  float total = pd + pt + pa + pb + pg;
  if (total <= 0) return false;
  out.d = 100.0f * pd / total;
  out.t = 100.0f * pt / total;
  out.a = 100.0f * pa / total;
  out.b = 100.0f * pb / total;
  out.g = 100.0f * pg / total;
  saturated = (rmin < 20 || rmax > 4075);
  return true;
}

// ===================== IMU (MPU6050) =====================
bool initMPU() {
  if (!writeReg(MPU_ADDR, 0x6B, 0x00)) return false;   // wake up
  delay(50);
  writeReg(MPU_ADDR, 0x1A, 0x03);                      // low-pass filter ~44 Hz
  writeReg(MPU_ADDR, 0x1C, 0x00);                      // +-2 g range (16384 LSB/g)
  return true;
}

bool readMPU() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((uint8_t)MPU_ADDR, (uint8_t)6) != 6) return false;
  uint8_t b[6];
  for (int i = 0; i < 6; i++) b[i] = Wire.read();
  ax = read16(b[0], b[1]) / 16384.0f;
  ay = read16(b[2], b[3]) / 16384.0f;
  az = read16(b[4], b[5]) / 16384.0f;
  return true;
}

void serviceIMU() {
  if (!imuOK) return;
  uint32_t now = millis();
  if (now - lastImuMs < 20) return;                    // 50 Hz
  lastImuMs = now;
  if (!readMPU()) return;

  magBuf[magIdx] = sqrtf(ax * ax + ay * ay + az * az);
  magIdx = (magIdx + 1) % IMU_WIN;
  if (magCount < IMU_WIN) magCount++;

  if (magCount >= 10) {
    float m = 0;
    for (int i = 0; i < magCount; i++) m += magBuf[i];
    m /= magCount;
    float v = 0;
    for (int i = 0; i < magCount; i++) v += (magBuf[i] - m) * (magBuf[i] - m);
    motionNoise = sqrtf(v / magCount);                 // std deviation of |acceleration| in g
    isMoving = motionNoise > MOVE_THRESH_G;
  }
}

// ===================== TEMP (TMP117) =====================
bool readTemp(float &c) {
  Wire.beginTransmission(TMP_ADDR);
  Wire.write(0x00);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((uint8_t)TMP_ADDR, (uint8_t)2) != 2) return false;
  uint8_t hi = Wire.read();
  uint8_t lo = Wire.read();
  c = read16(hi, lo) * 0.0078125f;
  return true;
}

// ===================== PPG (SIMULATED FROM DATASET) =====================
void addIBI(float ibi) {
  if (ibiCount >= 3) {
    int n = imin(ibiCount, 5);
    float m = 0;
    for (int i = ibiCount - n; i < ibiCount; i++) m += ibiBuf[i];
    m /= n;
    if (fabsf(ibi - m) > 0.30f * m) {                  // artifact / missed beat
      if (++rejectRun < 3) return;
      ibiCount = 0;                                    // rate really changed, restart
    }
    rejectRun = 0;
  }
  if (ibiCount == IBI_MAX) {
    memmove(ibiBuf, ibiBuf + 1, (IBI_MAX - 1) * sizeof(float));
    ibiCount--;
  }
  ibiBuf[ibiCount++] = ibi;
}

void servicePPG() {
  uint32_t now = millis();
  fingerOn = true;

  // a "beat" occurs every IBI from the dataset
  if (nextBeatMs == 0) { nextBeatMs = now + IBI_DATA[0]; lastBeatMs = now; ppgStartMs = now; }
  if (now >= nextBeatMs) {
    float ibi = IBI_DATA[ibiIdx];
    ibiIdx = (ibiIdx + 1) % IBI_DATA_N;
    addIBI(ibi);
    lastBeatMs = now;
    nextBeatMs = now + IBI_DATA[ibiIdx];
  }

  // SpO2: new dataset value every 1 s, smoothed like the original code
  // (first value appears after 4 s, same as the real 4 s window)
  if (now - ppgStartMs >= 4000 && now - lastSpo2Ms >= 1000) {
    lastSpo2Ms = now;
    int v = SPO2_DATA[spo2Idx];
    spo2Idx = (spo2Idx + 1) % SPO2_DATA_N;
    spo2Disp = (spo2Disp == 0) ? v : 0.7f * spo2Disp + 0.3f * v;
  }

  // dummy IR value that pulses with each beat (for the "IR=" field)
  float phase = (float)(now - lastBeatMs) / 800.0f;
  lastIR = 120000 + (uint32_t)(3000.0f * expf(-6.0f * phase));
}

// ===================== REPORT =====================
void printReport() {
  Serial.println(F("--------------------------------------------------"));

  // ---- PPG ----
  if (!ppgOK) {
    Serial.println(F("PPG  : not available"));
  } else if (!fingerOn) {
    Serial.printf("PPG  : place finger on sensor (IR=%lu)\n", (unsigned long)lastIR);
  } else {
    float hr = 0;
    if (ibiCount >= 3) {
      int n = imin(ibiCount, 5);
      float m = 0;
      for (int i = ibiCount - n; i < ibiCount; i++) m += ibiBuf[i];
      hr = 60000.0f / (m / n);
    }
    float rmssd = -1;
    if (ibiCount >= 8) {
      float s = 0;
      for (int i = 1; i < ibiCount; i++) { float d = ibiBuf[i] - ibiBuf[i - 1]; s += d * d; }
      rmssd = sqrtf(s / (ibiCount - 1));
    }
    j_hr = hr; j_rmssd = rmssd; j_spo2 = spo2Disp;      // NEW: copy for WiFi
    Serial.print(F("PPG  : HR "));
    if (hr > 0) Serial.printf("%.0f bpm", hr); else Serial.print(F("-- "));
    Serial.print(F(" | HRV(RMSSD) "));
    if (rmssd >= 0) Serial.printf("%.0f ms", rmssd); else Serial.print(F("collecting.."));
    Serial.print(F(" | SpO2 "));
    if (spo2Disp > 0) Serial.printf("%.0f %%", spo2Disp); else Serial.print(F("--"));
    Serial.printf(" | IR=%lu\n", (unsigned long)lastIR);
  }

  // ---- EEG ----
  if (eegCount < (uint32_t)(EEG_N + EEG_FS)) {
    j_eegOK = false;                                    // NEW
    Serial.println(F("EEG  : warming up..."));
  } else {
    Bands b; bool sat = false;
    if (computeEEG(b, sat)) {
      j_b = b; j_sat = sat; j_eegOK = true;             // NEW: copy for WiFi
      Serial.printf("EEG  : Delta %.1f%% | Theta %.1f%% | Alpha %.1f%% | Beta %.1f%% | Gamma %.1f%%%s\n",
                    b.d, b.t, b.a, b.b, b.g, sat ? "  [SIGNAL SATURATED - check electrodes/wiring]" : "");
    } else {
      j_eegOK = false;                                  // NEW
      Serial.println(F("EEG  : no signal"));
    }
  }

  // ---- IMU ----
  if (!imuOK) {
    Serial.println(F("IMU  : MPU6050 not found"));
  } else {
    Serial.printf("IMU  : X %.3f g | Y %.3f g | Z %.3f g | noise(SD) %.4f g [%s]\n",
                  ax, ay, az, motionNoise, isMoving ? "moving" : "still");
  }

  // ---- TEMP ----
  float c;
  if (tmpOK && readTemp(c)) {
    j_temp = c; j_tempOK = true;                        // NEW: copy for WiFi
    Serial.printf("TEMP : %.2f C | %.2f F\n", c, c * 9.0f / 5.0f + 32.0f);
  } else {
    j_tempOK = false;                                   // NEW
    Serial.println(F("TEMP : TMP117 not found"));
  }
}

// ===================== WIFI / WEB (NEW) =====================
void handleData() {
  char buf[640];
  char hrS[16], hrvS[16], spo2S[16], tS[16];

  if (j_hr > 0)      snprintf(hrS, sizeof(hrS), "%.0f", j_hr);       else strcpy(hrS, "null");
  if (j_rmssd >= 0)  snprintf(hrvS, sizeof(hrvS), "%.0f", j_rmssd);  else strcpy(hrvS, "null");
  if (j_spo2 > 0)    snprintf(spo2S, sizeof(spo2S), "%.0f", j_spo2); else strcpy(spo2S, "null");
  if (j_tempOK)      snprintf(tS, sizeof(tS), "%.2f", j_temp);       else strcpy(tS, "null");

  snprintf(buf, sizeof(buf),
    "{\"uptime_ms\":%lu,"
    "\"ppg\":{\"simulated\":true,\"hr_bpm\":%s,\"hrv_rmssd_ms\":%s,\"spo2_pct\":%s,\"ir\":%lu},"
    "\"eeg\":{\"ok\":%s,\"delta\":%.1f,\"theta\":%.1f,\"alpha\":%.1f,\"beta\":%.1f,\"gamma\":%.1f,\"saturated\":%s},"
    "\"imu\":{\"ok\":%s,\"x_g\":%.3f,\"y_g\":%.3f,\"z_g\":%.3f,\"noise_sd_g\":%.4f,\"moving\":%s},"
    "\"temp\":{\"ok\":%s,\"c\":%s,\"f\":%.2f}}",
    (unsigned long)millis(),
    hrS, hrvS, spo2S, (unsigned long)lastIR,
    j_eegOK ? "true" : "false", j_b.d, j_b.t, j_b.a, j_b.b, j_b.g, j_sat ? "true" : "false",
    imuOK ? "true" : "false", ax, ay, az, motionNoise, isMoving ? "true" : "false",
    j_tempOK ? "true" : "false", tS, j_temp * 9.0f / 5.0f + 32.0f);

  server.sendHeader("Access-Control-Allow-Origin", "*");   // lets a web page read this data
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", buf);
}

void handleRoot() {
  server.send(200, "text/plain", "WiFi module ESP32 bio-signal monitor is running. Open /data for live JSON.");
}

void startWiFi() {
  Serial.printf("Connecting to WiFi \"%s\" ", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) {   // wait max 20 s
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print(F("WiFi connected. Open in browser:  http://"));
    Serial.print(WiFi.localIP());
    Serial.println(F("/data"));
  } else {
    Serial.println(F("WiFi NOT connected (check name/password, 2.4 GHz). Sensors still work over Serial."));
  }

  server.on("/", handleRoot);
  server.on("/data", handleData);
  server.begin();
}

// ===================== SETUP / LOOP =====================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println(F("\nWiFi module ESP32 bio-signal monitor starting..."));

  Wire.begin(BUS_A_SDA, BUS_A_SCL);
  Wire.setClock(100000);

  Wire1.begin(BUS_B_SDA, BUS_B_SCL);                   // bus B (through level converter)
  Wire1.setClock(100000);

  scanBus(Wire,  "bus A (expect 0x48 TMP117, 0x68 MPU6050)");
  scanBus(Wire1, "bus B (expect 0x57 MAX30102 via level converter)");

  Wire1.beginTransmission(PPG_ADDR);
  max30102Found = (Wire1.endTransmission() == 0);

  imuOK = initMPU();
  Wire.beginTransmission(TMP_ADDR);
  tmpOK = (Wire.endTransmission() == 0);

  ppgOK = true;   // PPG is simulated from the dataset (MAX30102 readings not used)

  Serial.printf("Status -> PPG:%s  IMU:%s  TEMP:%s\n",
                ppgOK ? "SIMULATED" : "FAIL", imuOK ? "OK" : "FAIL", tmpOK ? "OK" : "FAIL");

  Serial.printf("MAX30102 on bus B: %s (PPG values are still dummy)\n",
                max30102Found ? "detected" : "not detected");

  analogReadResolution(12);
  analogSetPinAttenuation(EEG_PIN, ADC_11db);
  xTaskCreatePinnedToCore(eegTask, "eeg", 4096, NULL, 2, NULL, 0);

  startWiFi();    // NEW
}

void loop() {
  if (ppgOK) servicePPG();
  serviceIMU();
  server.handleClient();   // NEW: answers browser requests

  uint32_t now = millis();
  if (now - lastPrintMs >= 1000) {
    lastPrintMs = now;
    printReport();
  }
}
