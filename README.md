# SensWear Web App

A responsive web companion to the SensWear mobile application, with its green and cream
visual identity, six sensor/output modules, firmware-aware availability, and CSV export.
It uses **`senswear-web-bluetooth@0.4.0` from the public npm registry**. No React Native
bindings, vendored SDK archive, backend, account, or API key is required.

## Run locally

Use Node.js 22.12+ (Node 24 is recommended):

```powershell
npm ci
npm run dev
```

Open the localhost URL printed by Vite, normally **http://127.0.0.1:5173**. Click **Connect
device** and choose your advertising SensWear platform in the browser chooser.

Use **Explore demo** to review every screen without hardware. The persistent banner and
`demo-` CSV filename prefix identify simulated data; demo mode does not send device writes.

## Browser requirements

Web Bluetooth requires a secure context: HTTPS in production or localhost during development.
Chrome or Edge on a supported desktop platform, or Chrome on Android, are typical targets.
Support varies by browser and operating system; the app checks `navigator.bluetooth` and
shows a compatibility message when unavailable. Safari and Firefox currently do not provide
the needed API. An ordinary non-localhost HTTP address is not suitable for connecting.

The browser must open the device chooser from a user click. Unlike the native app, a website
cannot silently scan all nearby devices or access their Bluetooth MAC addresses. The app
stores an origin-scoped browser device ID only if **Remember this device** is enabled.
It then tries to reconnect to previously granted devices after reload (where `getDevices`
is supported), and retries unexpected disconnects up to three times at two-second intervals.
Disconnect stops those retries. Forget removes the local preference; browser permission can
be revoked separately in the browser's site settings.

See [Web Bluetooth in Chrome](https://developer.chrome.com/docs/capabilities/bluetooth)
and [browser compatibility](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API#browser_compatibility).

## Features

| View        | Behavior                                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| Overview    | Device state, battery, firmware capability gating, and six module shortcuts                                     |
| IMU         | Acceleration in g, unitless quaternion, raw gyroscope, selectable FIFO delivery cadence                         |
| PPG         | Red, infrared, and green raw ADC charts; sampling enabled while the view runs                                   |
| Temperature | Indicated readings, °C/°F display, whole-minute measurement intervals (0 disables scheduling)                   |
| Touch       | 15-electrode strip, position in nominal mm, contact/raw diagnostics, gesture history, and interactive sandbox   |
| LED         | RGB swatches, picker, HEX input, brightness scaling, explicit apply/off and confirmed write state               |
| Vibration   | Original pulse/ramp/heartbeat/buzz presets, 1–3 character Morse, custom sequences, intensity and timing preview |
| Settings    | Battery/charging state, firmware/shields, remember/forget, UTC clock synchronization                            |

The app reads the real firmware version and feature flags. It never guesses daughter-board
support from advertised services. On older firmware without metadata, retry or update the
firmware; affected controls stay disabled. Capability flags describe the firmware build,
not physical attachment or sensor health.

Charts show up to 500 samples and update at most five times per second. All accepted samples
are recorded independently of chart rendering, with up to 50,000 CSV rows per module/session.
The UI reports when that limit is reached; export and clear to continue recording. Device
64-bit timestamps remain exact `bigint` values through CSV conversion. Chart horizontal axes
use host elapsed time, not converted device timestamps. No sample data leaves the browser
unless the user downloads a CSV. Text cells are escaped and protected against spreadsheet
formula evaluation.

Recordings survive switching views and disconnecting during the same session. A new connection,
entering demo, reloading, or closing the page starts a new in-memory session; export first.
No sensor recordings are written to localStorage. Pausing/unmounting unsubscribes a stream;
IMU, PPG, and touch restore their previous sampling/configuration state when the same
connection is still active. Temperature schedule changes remain on the device until changed
again. A paused temperature view does not disable device scheduling. Haptic controls prevent
overlapping writes; firmware has no stop-pattern command. Demo timing is accelerated for
preview and does not represent a real device's sampling cadence.

PPG is raw optical data, not heart rate or SpO2. Gyroscope values retain the firmware's raw
units. Sensor displays do not provide medical interpretations.

## Build and deploy

```powershell
npm run build
npm run preview
```

Upload the contents of `dist/` to an HTTPS static host. The app uses hash navigation, so no
server-side route fallback is necessary; `base: './'` supports hosting under a subdirectory.
For embedding, the parent must permit Bluetooth through its Permissions Policy and iframe
`allow="bluetooth"` attribute. The app uses no CDN fonts, remote images, or runtime analytics.

GitHub Actions deploys updates to `main` to **https://app.sens-wear.com** on AWS Lightsail
after type checking, unit/receiver tests, and browser tests against the production build.
Pull requests run verification without deployment credentials. See
[DEPLOYMENT.md](DEPLOYMENT.md) for the one-time Nginx, restricted SSH account, HTTPS and
GitHub environment setup. The deployment is adapted from SensWear QuickStart with a
separate account, key and app directory. The application remains `private: true` to prevent
accidental npm publication.

## Validation

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:deployment
```

Browser tests use locally installed Microsoft Edge in headless mode and exercise desktop
and mobile viewports. With `CI=true`, they use Playwright Chromium and the built `dist/`
site through Vite preview; run `npx playwright install chromium` and `npm run build` first.
Deployment receiver integration tests require Linux and are run by GitHub Actions.
Browser checks cover all
views, demo controls, CSV download, unsupported browsers, chooser cancellation, runtime
errors, and horizontal overflow. Unit tests cover session ownership, restoration,
disconnects, stream cleanup, data precision, gesture mapping, and haptic limits.

**Physical Bluetooth operation remains unverified.** Follow [HARDWARE_VALIDATION.md](HARDWARE_VALIDATION.md)
with the relevant boards before relying on hardware behavior.

## Source map

- `src/lib/session.ts`: one SDK client, chooser, metadata, persistence, reconnects.
- `src/lib/streams.ts`: per-module subscription lifecycles and explicit demo generators.
- `src/lib/telemetry.ts`: bounded chart buffers, typed samples, touch sandbox and session logs.
- `src/lib/csv.ts`: lossless CSV conversion, bounds, and local download.
- `src/lib/haptics.ts`: compact patterns and Morse conversion.
- `src/pages/`: overview, streaming views, outputs, and settings.
- `src/components/`: shared visual components and SVG charts.
- `src/styles.css`: responsive mobile-app-inspired design.

Brand, hardware, and module images are reused from the supplied SensWear mobile application.
The SDK dependency and lockfile resolve from `https://registry.npmjs.org/`.
