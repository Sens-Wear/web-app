import {
  TouchGesture,
  type AccelerometerSample,
  type QuaternionSample,
  type GyroscopeSample,
  type PpgSample,
  type TemperatureMeasurement,
  type TouchState,
  type RawTouchSample,
  type TouchGestureSample,
  type BatteryLevelStatus,
} from 'senswear-web-bluetooth'
import { CsvLog } from './csv'

export type Page =
  | 'dashboard'
  | 'imu'
  | 'ppg'
  | 'temperature'
  | 'touch'
  | 'led'
  | 'haptic'
  | 'settings'
export type StreamPage = 'imu' | 'ppg' | 'temperature' | 'touch'
export type Graph =
  | 'acceleration'
  | 'quaternion'
  | 'gyroscope'
  | 'red'
  | 'ir'
  | 'green'
  | 'temperature'
  | 'touch'
export interface Point {
  time: number
  values: Array<number | null>
}
export interface Sandbox {
  level: number
  lit: boolean
  locked: boolean
  slot: number
}
export const defaultSandbox = (): Sandbox => ({ level: 50, lit: false, locked: false, slot: 2 })
export function applyGesture(state: Sandbox, gesture: number): Sandbox {
  switch (gesture) {
    case TouchGesture.SingleClick:
      return { ...state, lit: !state.lit }
    case TouchGesture.DoubleClick:
      return defaultSandbox()
    case TouchGesture.ClickAndHold:
      return { ...state, locked: !state.locked }
    case TouchGesture.LeftSwipe:
      return { ...state, slot: Math.max(0, state.slot - 1) }
    case TouchGesture.RightSwipe:
      return { ...state, slot: Math.min(4, state.slot + 1) }
    case TouchGesture.LeftSwipeAndHold:
      return { ...state, slot: Math.max(0, state.slot - 1), locked: true }
    case TouchGesture.RightSwipeAndHold:
      return { ...state, slot: Math.min(4, state.slot + 1), locked: true }
    default:
      return state
  }
}
const COMMON = 'received_at_utc'
export class Telemetry {
  readonly logs = {
    imu: new CsvLog([COMMON, 'device_timestamp_us', 'stream', 'x', 'y', 'z', 'w', 'unit']),
    ppg: new CsvLog([COMMON, 'device_timestamp_ms', 'channel', 'value_raw_adc']),
    temperature: new CsvLog([COMMON, 'device_timestamp_utc', 'temperature_c', 'type', 'flags']),
    touch: new CsvLog([
      COMMON,
      'device_timestamp_us',
      'event',
      'touched',
      'x',
      'y',
      'position_mm',
      'gesture',
      'gesture_state',
      'touch_state',
    ]),
    led: new CsvLog([COMMON, 'event', 'rgb_hex', 'result', 'error']),
    haptic: new CsvLog([
      COMMON,
      'pattern',
      'frame_index',
      'duration_ms',
      'intensity_0_255',
      'result',
      'error',
    ]),
    settings: new CsvLog([COMMON, 'event', 'battery_percent', 'battery_present', 'charge_state']),
  }
  readonly graphs: Record<Graph, Point[]> = {
    acceleration: [],
    quaternion: [],
    gyroscope: [],
    red: [],
    ir: [],
    green: [],
    temperature: [],
    touch: [],
  }
  battery: number | null = null
  power: BatteryLevelStatus | null = null
  temperature: number | null = null
  temperatureInterval: number | null = null
  touch: TouchState | RawTouchSample | null = null
  raw: RawTouchSample | null = null
  gestures: Array<{ name: string; sample: TouchGestureSample }> = []
  sandbox = defaultSandbox()
  hapticBusyUntil = 0
  hapticPending = false
  private readonly start = performance.now()
  version = 0
  push(graph: Graph, values: Array<number | null>) {
    this.graphs[graph].push({ time: (performance.now() - this.start) / 1000, values })
    if (this.graphs[graph].length > 500) this.graphs[graph].shift()
    this.version++
  }
  acceleration = (s: AccelerometerSample) => {
    this.push('acceleration', [s.xG, s.yG, s.zG])
    this.logs.imu.append({
      device_timestamp_us: s.timestampUs,
      stream: 'acceleration',
      x: s.xG,
      y: s.yG,
      z: s.zG,
      unit: 'g',
    })
  }
  quaternion = (s: QuaternionSample) => {
    this.push('quaternion', [s.x, s.y, s.z, s.w])
    this.logs.imu.append({
      device_timestamp_us: s.timestampUs,
      stream: 'quaternion',
      x: s.x,
      y: s.y,
      z: s.z,
      w: s.w,
      unit: 'unitless',
    })
  }
  gyroscope = (s: GyroscopeSample) => {
    this.push('gyroscope', [s.x, s.y, s.z])
    this.logs.imu.append({
      device_timestamp_us: s.timestampUs,
      stream: 'gyroscope',
      x: s.x,
      y: s.y,
      z: s.z,
      unit: 'raw',
    })
  }
  ppg = (channel: 'red' | 'ir' | 'green', s: PpgSample) => {
    this.push(channel, [s.value])
    this.logs.ppg.append({ device_timestamp_ms: s.timestampMs, channel, value_raw_adc: s.value })
  }
  thermal = (s: TemperatureMeasurement) => {
    this.temperature = s.temperatureC
    this.push('temperature', [s.temperatureC])
    this.logs.temperature.append({
      device_timestamp_utc: s.timestamp?.toISOString(),
      temperature_c: s.temperatureC,
      type: s.type,
      flags: s.flags,
    })
  }
  touchState = (s: TouchState | RawTouchSample, raw = false) => {
    this.touch = s
    if (raw && 'touchState' in s) this.raw = s
    if (s.positionNormalized !== null && !this.sandbox.locked)
      this.sandbox = { ...this.sandbox, level: Math.round(s.positionNormalized * 100) }
    if (!raw) this.push('touch', [s.positionMm])
    this.logs.touch.append({
      device_timestamp_us: s.timestampUs,
      event: raw ? 'raw' : 'state',
      touched: s.touched,
      x: s.x,
      y: s.y,
      position_mm: s.positionMm,
      touch_state: 'touchState' in s ? s.touchState : null,
    })
    this.version++
  }
  gesture = (s: TouchGestureSample) => {
    this.logs.touch.append({
      device_timestamp_us: s.timestampUs,
      event: 'gesture',
      gesture: s.gesture,
      gesture_state: s.gestureState,
    })
    if (!s.gesture) return
    this.gestures = [{ name: gestureName(s.gesture), sample: s }, ...this.gestures].slice(0, 8)
    this.sandbox = applyGesture(this.sandbox, s.gesture)
    this.version++
  }
  setBattery = (percent: number) => {
    this.battery = percent
    this.logs.settings.append({ event: 'battery', battery_percent: percent })
    this.version++
  }
  setPower = (s: BatteryLevelStatus) => {
    this.power = s
    this.logs.settings.append({
      event: 'power',
      battery_present: s.batteryPresent,
      charge_state: s.chargeState,
    })
    this.version++
  }
}
export function gestureName(value: number) {
  return (
    (
      {
        1: 'Single tap',
        2: 'Touch & hold',
        3: 'Double tap',
        6: 'Swipe right',
        7: 'Swipe right & hold',
        10: 'Swipe left',
        11: 'Swipe left & hold',
      } as Record<number, string>
    )[value] ?? `Gesture ${value}`
  )
}
