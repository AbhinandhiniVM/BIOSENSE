# BioSense Monitor — website

Live website for the ESP32 bio-signal monitor (`heartwifi.ino`).
Flow: **Landing → Access code → Start connecting → 20-second sensor check → Results** (Overview, Brain, Heart, Body, Learn).

All formulas from *Biosignal Metrics Guide* run inside `js/metrics.js`. The pages only show the finished results in plain language.

## How to run

1. Upload `heartwifi.ino` to the ESP32 and open Serial Monitor (115200). Note the line
   `WiFi connected. Open in browser: http://192.168.x.x/data`.
2. Connect this laptop or phone to the **same Wi-Fi / hotspot** as the ESP32.
3. Double-click **`index.html`** to open it in Chrome or Edge.
   Do **not** host it on an `https://` site: browsers block https pages from talking to the `http://` ESP32.
4. Click *Get started*, type the access code, enter the IP address, and press *Connect*.
   No device? Press **Try demo mode**.

Default access code: **`biosense2027`**. To change it, or the poll rate, edit `js/config.js`.
(The code is a simple gate for a local page, not real security.)

## What is calculated (hidden from the user)

| Shown as | Built from (PDF section) |
|---|---|
| Alertness 0–100 + sensor-check gate | Slow/fast band ratio + spectral centroid, gated by alpha suppression (Output 1) |
| Focus + trend | Theta/beta ratio, 10-minute trend (Output 2) |
| Body mode (rest ↔ stress) | HRV LF/HF via Welch PSD, cross-checked with skin-temp rate of change (Output 4) |
| Stress level 0–100 | Composite Stress Index: TBR, LF/HF, sway power and HF (section 11) |
| Steadiness | Postural sway power 0.1–1 Hz on the horizontal axes (section 9) |
| Skin temperature trend | dT/dt over the last 2 minutes (section 10) |
| Mood lean | Not available: needs two frontal electrodes (F3/F4); the device has one EEG channel |

## Optional: better heart-rhythm accuracy

The current firmware only sends heart rate, so the website estimates the LF/HF balance from it.
For exact beat-to-beat analysis, add the raw intervals to the JSON in `handleData()`
(and increase `char buf[640]` to `char buf[1024]`):

```cpp
// build "ibi_ms":[...] from ibiBuf
char ibiS[300]; int p = snprintf(ibiS, sizeof(ibiS), "[");
for (int i = 0; i < ibiCount; i++) p += snprintf(ibiS + p, sizeof(ibiS) - p, i ? ",%.0f" : "%.0f", ibiBuf[i]);
snprintf(ibiS + p, sizeof(ibiS) - p, "]");
```

Then add `,\"ibi_ms\":%s,\"beats\":%lu` inside the `"ppg":{...}` object, passing `ibiS` and a running count of accepted beats
(e.g. a `uint32_t totalBeats` incremented in `addIBI`). The website detects these fields automatically.
