import {
  IMU_ACCELEROMETER_UUID,
  IMU_QUATERNION_UUID,
  IMU_GYROSCOPE_UUID,
  AccelerometerSample,
  QuaternionSample,
  GyroscopeSample,
  PpgSample,
  TemperatureMeasurement,
  TouchState,
  RawTouchSample,
  TouchGestureSample,
  TouchGesture,
  BatteryLevelStatus,
  type SenswearClient,
} from 'senswear-web-bluetooth'
import type { StreamPage, Telemetry } from './telemetry'
import { message } from './session'

export type StreamStatus = {
  state: 'starting' | 'ready' | 'paused' | 'error'
  error: string | null
}
const barriers = new WeakMap<object, Promise<void>>()
type Cleanup = () => Promise<unknown>

/** Serialize setup/teardown per module, including rapid route changes and React StrictMode. */
export function openStream(
  client: SenswearClient,
  kind: StreamPage | 'power',
  data: Telemetry,
  status: (status: StreamStatus) => void,
  drainMs = 100,
  isCurrentConnection = () => true,
) {
  const key = kind === 'power' ? client.battery : client[kind]
  const prior = barriers.get(key) ?? Promise.resolve()
  let release!: () => void
  barriers.set(
    key,
    new Promise<void>((resolve) => {
      release = resolve
    }),
  )
  let active = true
  const cleanups: Cleanup[] = []
  const restorations: Cleanup[] = []
  let stopped: Promise<void> | null = null
  let cleanupWork: Promise<void> | null = null
  const accept =
    <T>(callback: (value: T) => void) =>
    (value: T) => {
      if (active && isCurrentConnection()) callback(value)
    }
  const step = async (work: () => Promise<unknown>, cleanup?: Cleanup) => {
    if (!active || !isCurrentConnection()) return
    if (cleanup) cleanups.push(cleanup)
    await work()
  }
  const cleanup = (): Promise<void> =>
    (cleanupWork ??= (async () => {
      const failures: string[] = []
      for (const work of [...cleanups.reverse(), ...restorations.reverse()]) {
        try {
          if (isCurrentConnection() && (await client.isConnected()) && isCurrentConnection())
            await work()
        } catch (error) {
          failures.push(message(error))
        }
      }
      if (failures.length) console.warn('SensWear stream cleanup:', failures.join('; '))
      release()
    })())
  status({ state: 'starting', error: null })
  const ready = prior
    .then(async () => {
      if (!active) return
      if (kind === 'imu') {
        const enabled = await client.imu.isEnabled()
        const drain = await client.imu.readDrainPeriodMs()
        if (!active) return
        restorations.push(
          () => client.imu.setEnabled(enabled),
          () => client.imu.setDrainPeriodMs(drain),
        )
        await step(() => client.imu.setEnabled(true))
        await step(() => client.imu.setDrainPeriodMs(drainMs))
        await step(
          () => client.imu.subscribeAccelerometer(accept(data.acceleration)),
          () => client.imu.unsubscribe(IMU_ACCELEROMETER_UUID),
        )
        await step(
          () => client.imu.subscribeQuaternion(accept(data.quaternion)),
          () => client.imu.unsubscribe(IMU_QUATERNION_UUID),
        )
        await step(
          () => client.imu.subscribeGyroscope(accept(data.gyroscope)),
          () => client.imu.unsubscribe(IMU_GYROSCOPE_UUID),
        )
      } else if (kind === 'ppg') {
        const enabled = await client.ppg.isSamplingEnabled()
        if (!active) return
        restorations.push(() => client.ppg.setSamplingEnabled(enabled))
        // Preserve IRQ configuration. Changing it requires disabling sampling first.
        await step(() => client.ppg.setSamplingEnabled(true))
        await step(
          () => client.ppg.subscribeRed(accept((s) => data.ppg('red', s))),
          () => client.ppg.unsubscribeRed(),
        )
        await step(
          () => client.ppg.subscribeIr(accept((s) => data.ppg('ir', s))),
          () => client.ppg.unsubscribeIr(),
        )
        await step(
          () => client.ppg.subscribeGreen(accept((s) => data.ppg('green', s))),
          () => client.ppg.unsubscribeGreen(),
        )
      } else if (kind === 'temperature') {
        await step(async () => {
          const value = await client.temperature.readMeasurementInterval()
          if (active) {
            data.temperatureInterval = value
            data.version++
          }
        })
        await step(
          () => client.temperature.subscribe(accept(data.thermal)),
          () => client.temperature.unsubscribe(),
        )
        await step(
          () =>
            client.temperature.subscribeMeasurementInterval(
              accept((value) => {
                data.temperatureInterval = value
                data.version++
              }),
            ),
          () => client.temperature.unsubscribeMeasurementInterval(),
        )
      } else if (kind === 'touch') {
        const enabled = await client.touch.isSamplingEnabled()
        if (!active) return
        restorations.push(() => client.touch.setSamplingEnabled(enabled))
        await step(
          () => client.touch.subscribeState(accept((s) => data.touchState(s))),
          () => client.touch.unsubscribeState(),
        )
        await step(
          () => client.touch.subscribeGesture(accept(data.gesture)),
          () => client.touch.unsubscribeGesture(),
        )
        await step(
          () => client.touch.subscribeRaw(accept((s) => data.touchState(s, true))),
          () => client.touch.unsubscribeRaw(),
        )
        await step(() => client.touch.setSamplingEnabled(true))
      } else {
        await step(async () => {
          const value = await client.battery.read()
          if (active) data.setBattery(value.percent)
        })
        await step(async () => {
          const value = await client.power.read()
          if (active) data.setPower(value)
        })
        await step(
          () => client.battery.subscribe(accept((s) => data.setBattery(s.percent))),
          () => client.battery.unsubscribe(),
        )
        await step(
          () => client.power.subscribe(accept(data.setPower)),
          () => client.power.unsubscribe(),
        )
      }
      if (active) status({ state: 'ready', error: null })
    })
    .catch(async (error) => {
      if (active) status({ state: 'error', error: message(error) })
      active = false
      await cleanup()
    })
  return {
    ready,
    stop: () => {
      if (!stopped) {
        active = false
        stopped = ready.then(cleanup)
      }
      return stopped
    },
  }
}

/** Deliberate preview data only: never used by a real Bluetooth connection. */
export function demoStream(kind: StreamPage | 'power', data: Telemetry) {
  let tick = 0
  const pump = () => {
    tick++
    const time = Date.now()
    const us = BigInt(time) * 1000n
    const wave = Math.sin(tick * 0.15)
    if (kind === 'imu') {
      data.acceleration(
        new AccelerometerSample(
          us,
          Math.round(wave * 1600),
          Math.round(Math.cos(tick * 0.1) * 1100),
          Math.round(4096 + wave * 600),
        ),
      )
      data.quaternion(
        new QuaternionSample(
          us,
          0,
          Math.round(Math.sin(tick * 0.018) * 16384),
          0,
          Math.round(Math.cos(tick * 0.018) * 16384),
          32,
        ),
      )
      data.gyroscope(
        new GyroscopeSample(
          us,
          Math.round(wave * 80),
          Math.round(Math.cos(tick * 0.12) * 45),
          Math.round(wave * 20),
        ),
      )
    } else if (kind === 'ppg') {
      const pulse =
        Math.exp(-Math.pow(((tick % 12) - 3) / 1.1, 2)) * 850 + Math.sin(tick * 0.05) * 80
      data.ppg('red', new PpgSample(BigInt(time), Math.round(28000 + pulse)))
      data.ppg('ir', new PpgSample(BigInt(time), Math.round(42000 + pulse * 1.4)))
      data.ppg('green', new PpgSample(BigInt(time), Math.round(16500 + pulse * 0.7)))
    } else if (kind === 'temperature') {
      if (data.temperatureInterval === null) data.temperatureInterval = 60
      if (data.temperatureInterval > 0 && tick % 10 === 1)
        data.thermal(
          new TemperatureMeasurement(32.4 + Math.sin(tick * 0.02) * 0.3, new Date(time), 2, 6),
        )
    } else if (kind === 'touch') {
      const x = Math.round((wave + 1) * 448)
      data.touchState(new TouchState(us, true, x, 0))
      data.touchState(new RawTouchSample(us, true, x, 0, 1), true)
      if (tick % 35 === 0)
        data.gesture(
          new TouchGestureSample(
            us,
            tick % 70 ? TouchGesture.RightSwipe : TouchGesture.SingleClick,
            1,
          ),
        )
    } else if (tick === 1) {
      data.setBattery(84)
      data.setPower(new BatteryLevelStatus(2, 65, 84))
    }
  }
  pump()
  const timer = setInterval(pump, 100)
  return () => clearInterval(timer)
}
