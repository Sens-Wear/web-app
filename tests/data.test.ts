import { describe, expect, it } from 'vitest'
import { TouchGesture, AccelerometerSample } from 'senswear-web-bluetooth'
import { CsvLog } from '../src/lib/csv'
import { buildPattern, morseAmplitudes } from '../src/lib/haptics'
import { applyGesture, defaultSandbox, Telemetry } from '../src/lib/telemetry'

describe('CSV recordings', () => {
  it('retains full bigint timestamps and escapes text safely', () => {
    const log = new CsvLog(['t', 'value', 'text'])
    log.append({ t: 9223372036854775807n, value: -1.5, text: 'a,"b"\nc' })
    log.append({ t: 1n, value: 0, text: '=1+1' })
    expect(log.toCsv()).toBe(
      't,value,text\r\n9223372036854775807,-1.5,"a,""b""\nc"\r\n1,0,\'=1+1\r\n',
    )
  })
  it('bounds records, reports overflow, and clears explicitly', () => {
    const log = new CsvLog(['x'], 2)
    for (let x = 0; x < 5; x++) log.append({ x })
    expect(log.size).toBe(2)
    expect(log.dropped).toBe(3)
    log.clear()
    expect(log.size).toBe(0)
    expect(log.dropped).toBe(0)
  })
})
describe('haptic composition', () => {
  it('compacts equal consecutive frames without changing the pulse', () => {
    const result = buildPattern([1, 1, 0, 0.5], 1)
    expect(result.frames.map((f) => [f.durationMs, f.intensity])).toEqual([
      [160, 255],
      [80, 0],
      [80, 128],
    ])
  })
  it('supports Morse and enforces input/frame limits', () => {
    expect(buildPattern(morseAmplitudes('SOS'), 0.75).frames.length).toBeLessThanOrEqual(32)
    expect(() => morseAmplitudes('TOOLONG')).toThrow()
    expect(() => morseAmplitudes('$')).toThrow()
    expect(() =>
      buildPattern(
        Array.from({ length: 33 }, (_, i) => i % 2),
        1,
      ),
    ).toThrow('32')
    expect(() => buildPattern([1], NaN)).toThrow()
  })
})
describe('telemetry and gestures', () => {
  it('caps charts without losing records and preserves SDK units', () => {
    const data = new Telemetry()
    for (let i = 0; i < 520; i++)
      data.acceleration(new AccelerometerSample(BigInt(i), 4096, -4096, 2048))
    expect(data.graphs.acceleration).toHaveLength(500)
    expect(data.graphs.acceleration[0].values).toEqual([1, -1, 0.5])
    expect(data.logs.imu.size).toBe(520)
  })
  it('uses normalized gestures for the interactive touch sandbox', () => {
    let state = applyGesture(defaultSandbox(), TouchGesture.SingleClick)
    expect(state.lit).toBe(true)
    state = applyGesture(state, TouchGesture.LeftSwipeAndHold)
    expect(state.slot).toBe(1)
    expect(state.locked).toBe(true)
    expect(applyGesture(state, TouchGesture.DoubleClick)).toEqual(defaultSandbox())
  })
})
