# Physical hardware validation

Automated tests use simulated data and mocked SDK modules. They do not establish that the
computer's Bluetooth adapter, the browser, and a physical SensWear board work together.
Use a supported browser on localhost, then repeat the important checks on the deployed
HTTPS origin because Bluetooth permissions are origin-scoped.

1. Select Connect device and cancel the chooser. Confirm that another click can retry.
   Select the expected SensWear device and confirm real firmware/shield flags and battery.
2. Connect base firmware. Only firmware-enabled modules should be available. Connect each
   relevant shield build and confirm the corresponding module becomes available.
3. Open IMU, move the device, check acceleration (g), unitless quaternion, and raw gyro.
   Change drain cadence, pause/resume, switch views rapidly, and confirm no duplicated
   subscriptions. Export CSV and check an exact 64-bit timestamp against the SDK sample.
4. Open PPG and verify red/IR/green raw ADC streams. The app must preserve the original IRQ
   setting. Leave/re-enter, then pause, and check sampling restoration.
5. Open Temperature, choose a 60-second interval, and wait for indications. Verify °C/°F
   conversion, interval indications, and that 0 disables scheduling. Intermediate invalid
   intervals must not be written.
6. Touch the strip, slide both ways, tap, hold, and double-tap. Check contact/release,
   position, raw diagnostics, and sandbox behavior. A release should produce a gap in the
   position chart rather than a fabricated zero. Pause and leave the view; confirm sampling
   returns to its original state.
7. On LED, select a color without applying it (output should not change), apply, adjust
   brightness, and turn off. Check physical RGB output and confirmed-write status.
8. Play haptic presets, a short Morse message, and a valid custom sequence. Verify the
   duration/intensity preview matches the output, the 32-frame bound, and no overlapping
   writes while busy. Export actuator logs and inspect the recorded results.
9. In Settings, inspect charging/fault flags, refresh firmware details, and sync UTC time.
   Check the device clock. Do not mistake firmware capabilities for sensor health.
10. Enable Remember this device and reload. Where permitted-device discovery is supported,
    reconnect should avoid a chooser. Test an offline device and permission revocation.
    Turn the board off during streaming; check the disconnected UI and bounded retries.
    Explicit Disconnect must stop retries. Forget must clear the local saved preference.
11. Confirm no inactive screen callbacks update the current view, no stale configuration
    writes reach a new connection, and CSV downloads remain available after disconnect.
    Reloading/new connections intentionally start fresh recording sessions.
