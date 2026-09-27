import { describe, expect, it, vi } from 'vitest'
import {
  AccelerometerSample,
  PpgSample,
  TemperatureMeasurement,
  TouchState,
  type SenswearClient,
} from 'senswear-web-bluetooth'
import { openStream } from '../src/lib/streams'
import { Telemetry } from '../src/lib/telemetry'

function fixture() {
  let acceleration: ((s: AccelerometerSample) => void) | undefined
  const imu = {
    isEnabled: vi.fn(async () => false),
    readDrainPeriodMs: vi.fn(async () => 250),
    setEnabled: vi.fn(async (_enabled: boolean) => {}),
    setDrainPeriodMs: vi.fn(async (_period: number) => {}),
    subscribeAccelerometer: vi.fn(async (callback: (s: AccelerometerSample) => void) => {
      acceleration = callback
    }),
    subscribeQuaternion: vi.fn(async () => {}),
    subscribeGyroscope: vi.fn(async () => {}),
    unsubscribe: vi.fn(async () => {}),
  }
  const client = { imu, isConnected: vi.fn(async () => true) } as unknown as SenswearClient
  return {
    client,
    imu,
    emit: () => acceleration?.(new AccelerometerSample(1234567890123456789n, 4096, 0, 0)),
  }
}
describe('stream lifecycle', () => {
  it('receives typed samples and restores prior configuration on cleanup', async () => {
    const f = fixture(),
      data = new Telemetry(),
      status = vi.fn()
    const stream = openStream(f.client, 'imu', data, status)
    await stream.ready
    f.emit()
    expect(data.logs.imu.size).toBe(1)
    await stream.stop()
    f.emit()
    expect(data.logs.imu.size).toBe(1)
    expect(f.imu.unsubscribe).toHaveBeenCalledTimes(3)
    expect(f.imu.setEnabled).toHaveBeenLastCalledWith(false)
    expect(f.imu.setDrainPeriodMs).toHaveBeenLastCalledWith(250)
    await stream.stop()
    expect(f.imu.unsubscribe).toHaveBeenCalledTimes(3)
  })
  it('cleans partially started streams once and reports errors', async () => {
    const f = fixture(),
      status = vi.fn()
    f.imu.subscribeQuaternion.mockRejectedValueOnce(new Error('Not available'))
    const stream = openStream(f.client, 'imu', new Telemetry(), status)
    await stream.ready
    await stream.stop()
    expect(status).toHaveBeenLastCalledWith({ state: 'error', error: 'Not available' })
    expect(f.imu.unsubscribe).toHaveBeenCalledTimes(2)
    expect(f.imu.setEnabled).toHaveBeenLastCalledWith(false)
  })
  it('does not let old cleanup mutate a different connection', async () => {
    const f = fixture()
    let current = true
    const stream = openStream(f.client, 'imu', new Telemetry(), vi.fn(), 100, () => current)
    await stream.ready
    current = false
    await stream.stop()
    expect(f.imu.unsubscribe).not.toHaveBeenCalled()
    expect(f.imu.setEnabled).toHaveBeenCalledTimes(1)
  })
  it('serializes a new subscription behind the preceding teardown', async () => {
    const f = fixture()
    const first = openStream(f.client, 'imu', new Telemetry(), vi.fn())
    await first.ready
    const second = openStream(f.client, 'imu', new Telemetry(), vi.fn())
    await Promise.resolve()
    expect(f.imu.isEnabled).toHaveBeenCalledTimes(1)
    await first.stop()
    await second.ready
    expect(f.imu.isEnabled).toHaveBeenCalledTimes(2)
    await second.stop()
  })

  it('records all optical channels and preserves the original sampling/IRQ configuration', async () => {
    const data = new Telemetry()
    const ppg = {
      isSamplingEnabled: vi.fn(async () => false),
      setSamplingEnabled: vi.fn(async (_value: boolean) => {}),
      setPerSampleIrqEnabled: vi.fn(),
      subscribeRed: vi.fn(async (callback: (s: PpgSample) => void) =>
        callback(new PpgSample(9223372036854775807n, 101)),
      ),
      subscribeIr: vi.fn(async (callback: (s: PpgSample) => void) =>
        callback(new PpgSample(2n, 202)),
      ),
      subscribeGreen: vi.fn(async (callback: (s: PpgSample) => void) =>
        callback(new PpgSample(3n, 303)),
      ),
      unsubscribeRed: vi.fn(async () => {}),
      unsubscribeIr: vi.fn(async () => {}),
      unsubscribeGreen: vi.fn(async () => {}),
    }
    const client = { ppg, isConnected: async () => true } as unknown as SenswearClient
    const stream = openStream(client, 'ppg', data, vi.fn())
    await stream.ready
    expect(data.logs.ppg.toCsv()).toContain('9223372036854775807,red,101')
    expect(data.graphs.ir[0].values).toEqual([202])
    expect(data.graphs.green[0].values).toEqual([303])
    await stream.stop()
    expect(ppg.setPerSampleIrqEnabled).not.toHaveBeenCalled()
    expect(ppg.setSamplingEnabled.mock.calls).toEqual([[true], [false]])
    expect(ppg.unsubscribeRed).toHaveBeenCalledOnce()
    expect(ppg.unsubscribeIr).toHaveBeenCalledOnce()
    expect(ppg.unsubscribeGreen).toHaveBeenCalledOnce()
  })

  it('uses temperature indications and keeps device scheduling unchanged', async () => {
    const data = new Telemetry()
    const temperature = {
      readMeasurementInterval: vi.fn(async () => 0),
      setMeasurementInterval: vi.fn(),
      subscribe: vi.fn(async (callback: (s: TemperatureMeasurement) => void) =>
        callback(new TemperatureMeasurement(31.5, null, null, 0)),
      ),
      subscribeMeasurementInterval: vi.fn(async (callback: (value: number) => void) =>
        callback(120),
      ),
      unsubscribe: vi.fn(async () => {}),
      unsubscribeMeasurementInterval: vi.fn(async () => {}),
    }
    const client = { temperature, isConnected: async () => true } as unknown as SenswearClient
    const stream = openStream(client, 'temperature', data, vi.fn())
    await stream.ready
    expect(data.temperature).toBe(31.5)
    expect(data.temperatureInterval).toBe(120)
    await stream.stop()
    expect(temperature.setMeasurementInterval).not.toHaveBeenCalled()
    expect(temperature.unsubscribeMeasurementInterval).toHaveBeenCalledOnce()
  })

  it('keeps release as a gap in the touch chart and restores sampling', async () => {
    const data = new Telemetry()
    const touch = {
      isSamplingEnabled: vi.fn(async () => false),
      setSamplingEnabled: vi.fn(async (_value: boolean) => {}),
      subscribeState: vi.fn(async (callback: (s: TouchState) => void) => {
        callback(new TouchState(1n, true, 448, 0))
        callback(new TouchState(2n, false, 0, 0))
      }),
      subscribeGesture: vi.fn(async () => {}),
      subscribeRaw: vi.fn(async () => {}),
      unsubscribeState: vi.fn(async () => {}),
      unsubscribeGesture: vi.fn(async () => {}),
      unsubscribeRaw: vi.fn(async () => {}),
    }
    const client = { touch, isConnected: async () => true } as unknown as SenswearClient
    const stream = openStream(client, 'touch', data, vi.fn())
    await stream.ready
    expect(data.graphs.touch.map((p) => p.values[0])).toEqual([21, null])
    await stream.stop()
    expect(touch.setSamplingEnabled.mock.calls).toEqual([[true], [false]])
    expect(touch.unsubscribeState).toHaveBeenCalledOnce()
    expect(touch.unsubscribeGesture).toHaveBeenCalledOnce()
    expect(touch.unsubscribeRaw).toHaveBeenCalledOnce()
  })
})
