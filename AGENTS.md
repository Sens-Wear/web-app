# SensWear Web App

React/TypeScript/Vite application using `senswear-web-bluetooth` from npm, pinned exactly.
The brand is SensWear. Preserve this spelling in all new UI and documentation.

- Keep one SDK lifecycle owner in `src/lib/session.ts`; do not connect or parse GATT bytes
  directly from a screen. All protocol types, enums and UUIDs come from the published SDK.
- `src/lib/streams.ts` serializes setup/cleanup per module. Preserve the cleanup barrier,
  active guards and connection identity checks when changing streaming behavior.
- Respect user activation: requestDevice must happen synchronously from a click before
  unrelated asynchronous work. Do not silently open browser choosers on page load.
- Gate hardware operations using firmware capabilities, with honest unknown/error states.
- Demo mode must stay explicit. Never show synthetic data as live hardware telemetry.
- Keep device timestamps as bigint, bound buffers/CSV logs, and throttle rendering.
- Use strict TypeScript. Run `npm run format` for readable source when editing.
- Preserve units: acceleration in g, raw gyroscope, raw PPG ADC, temperature indications,
  and nominal touch mm. Do not add medical interpretations.
- Run typecheck, unit tests, production build, and affected browser workflows.
- Never claim physical testing from mocked or headless checks. See HARDWARE_VALIDATION.md.
- Do not publish, deploy, flash firmware, or connect to hardware unless requested.
- Do not edit the mobile app or SDK repositories unless they are explicitly in scope. 
