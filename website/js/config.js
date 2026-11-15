/*
  BioSense — site settings
  Change these values to suit your setup.
*/
window.BIOSENSE_CONFIG = {
  // Access code asked for on the "Enter access code" screen.
  // NOTE: this is a simple front-door gate for a local website, not real security.
  password: "biosense2027",

  // Pre-fill the device address box (the IP printed in the ESP32 Serial Monitor), e.g. "192.168.43.120"
  defaultDeviceIP: "",

  // How often to ask the ESP32 for new data (milliseconds).
  // 250 ms = 4 times a second, needed for the balance (sway) measurement.
  pollMs: 250,

  // Give up on a single request after this long (milliseconds)
  requestTimeoutMs: 2500,
};
