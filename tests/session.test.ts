import { describe, expect, it, vi } from 'vitest'
import {
  DeviceCapabilities,
  type SenswearClient,
  type SenswearClientOptions,
  type WebBluetoothDevice,
} from 'senswear-web-bluetooth'
import { Session } from '../src/lib/session'

function fixture() {
  const device = Object.assign(new EventTarget(), {
    id: 'test-device',
    name: 'SensWear test',
  }) satisfies WebBluetoothDevice
  let options: SenswearClientOptions = {}
  const fake = {
    device,
    connect: vi.fn(async () => fake),
    disconnect: vi.fn(async () => {}),
    destroy: vi.fn(async () => {}),
    deviceInfo: {
      read: vi.fn(async () => ({
        firmwareVersion: '1.2.3',
        capabilities: new DeviceCapabilities(1, 0, 195),
      })),
    },
  }
  const requestDevice = vi.fn(async (): Promise<WebBluetoothDevice> => device)
  const getDevices = vi.fn(async () => [device])
  const createClient = vi.fn((_device: WebBluetoothDevice, next: SenswearClientOptions) => {
    options = next
    return fake as unknown as SenswearClient
  })
  const session = new Session({
    supported: () => true,
    requestDevice,
    getDevices,
    createClient,
    storage: localStorage,
  })
  return {
    session,
    fake,
    requestDevice,
    getDevices,
    createClient,
    drop: () => options.onDisconnected?.(device),
  }
}
describe('browser session', () => {
  it('opens the chooser synchronously, then loads real metadata', async () => {
    const f = fixture()
    const work = f.session.connect()
    expect(f.requestDevice).toHaveBeenCalledTimes(1)
    await work
    expect(f.session.getSnapshot()).toMatchObject({
      phase: 'connected',
      firmware: '1.2.3',
      name: 'SensWear test',
    })
    await f.session.disconnect()
  })
  it('handles cancellation and connect failure without a stuck busy state', async () => {
    const f = fixture()
    f.requestDevice.mockRejectedValueOnce(new DOMException('Cancelled', 'NotFoundError'))
    await f.session.connect()
    expect(f.session.getSnapshot().phase).toBe('idle')
    expect(f.session.getSnapshot().error).toContain('No device selected')
    f.fake.connect.mockRejectedValueOnce(new Error('Out of range'))
    await f.session.connect()
    expect(f.session.getSnapshot()).toMatchObject({ phase: 'disconnected', error: 'Out of range' })
    await f.session.disconnect()
  })
  it('leaves unavailable metadata explicit without inventing feature flags', async () => {
    const f = fixture()
    f.fake.deviceInfo.read.mockRejectedValueOnce(new Error('Service absent'))
    await f.session.connect()
    expect(f.session.getSnapshot().phase).toBe('connected')
    expect(f.session.getSnapshot().capabilities).toBeNull()
    expect(f.session.getSnapshot().metadataError).toContain('Service absent')
    await f.session.disconnect()
  })
  it('ignores a late chooser selection after cancellation', async () => {
    const f = fixture()
    let resolve!: (value: WebBluetoothDevice) => void
    f.requestDevice.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const work = f.session.connect()
    await f.session.disconnect()
    resolve(f.fake.device)
    await work
    expect(f.createClient).not.toHaveBeenCalled()
    expect(f.session.getSnapshot().phase).toBe('idle')
  })
  it('restores a remembered granted device without opening the chooser', async () => {
    localStorage.setItem('senswear.web.device', JSON.stringify({ id: 'test-device' }))
    const f = fixture()
    await f.session.restore()
    expect(f.getDevices).toHaveBeenCalledOnce()
    expect(f.requestDevice).not.toHaveBeenCalled()
    expect(f.session.getSnapshot().phase).toBe('connected')
    await f.session.disconnect(true)
    expect(localStorage.getItem('senswear.web.device')).toBeNull()
  })
  it('retries an unexpected disconnect when remembering, but stops on explicit disconnect', async () => {
    vi.useFakeTimers()
    const f = fixture()
    f.session.setRemember(true)
    await f.session.connect()
    f.drop()
    expect(f.session.getSnapshot().phase).toBe('disconnected')
    await vi.advanceTimersByTimeAsync(2000)
    expect(f.fake.connect).toHaveBeenCalledTimes(2)
    f.drop()
    await f.session.disconnect()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(f.fake.connect).toHaveBeenCalledTimes(2)
  })
  it('labels the demo and never creates a hardware client for it', async () => {
    const f = fixture()
    await f.session.startDemo()
    expect(f.session.getSnapshot()).toMatchObject({
      phase: 'demo',
      client: null,
      firmware: 'Demo firmware',
    })
    expect(f.createClient).not.toHaveBeenCalled()
  })
})
