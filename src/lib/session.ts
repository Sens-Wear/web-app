import {
  DeviceCapabilities,
  SenswearClient,
  type SenswearClientOptions,
  type WebBluetoothDevice,
} from 'senswear-web-bluetooth'

export type Phase = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'demo'
export interface SessionState {
  phase: Phase
  client: SenswearClient | null
  name: string | null
  firmware: string | null
  capabilities: DeviceCapabilities | null
  metadataLoading: boolean
  metadataError: string | null
  error: string | null
  supported: boolean
  remember: boolean
  sessionId: number
}
interface Dependencies {
  requestDevice: () => Promise<WebBluetoothDevice>
  getDevices: () => Promise<WebBluetoothDevice[]>
  createClient: (device: WebBluetoothDevice, options: SenswearClientOptions) => SenswearClient
  supported: () => boolean
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
}
const STORAGE_KEY = 'senswear.web.device'
export const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
function defaultStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export class Session {
  private dependencies: Dependencies
  private listeners = new Set<() => void>()
  private state: SessionState
  private ownedClient: SenswearClient | null = null
  private generation = 0
  private restored = false
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private retries = 0
  constructor(dependencies: Partial<Dependencies> = {}) {
    this.dependencies = {
      requestDevice: () => SenswearClient.requestDevice(),
      getDevices: async () => (await SenswearClient.getGrantedDevices()).map((item) => item.device),
      createClient: (device, options) => new SenswearClient(device, options),
      supported: () => SenswearClient.isSupported(),
      storage: defaultStorage(),
      ...dependencies,
    }
    this.state = {
      phase: 'idle',
      client: null,
      name: null,
      firmware: null,
      capabilities: null,
      error: null,
      metadataError: null,
      metadataLoading: false,
      supported: this.dependencies.supported(),
      remember: this.saved() !== null,
      sessionId: 0,
    }
  }
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private update(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((listener) => listener())
  }
  private saved(): { id: string } | null {
    try {
      const value: unknown = JSON.parse(this.dependencies.storage?.getItem(STORAGE_KEY) ?? 'null')
      return value !== null &&
        typeof value === 'object' &&
        'id' in value &&
        typeof value.id === 'string'
        ? { id: value.id }
        : null
    } catch {
      return null
    }
  }
  private persist() {
    try {
      if (this.state.remember && this.ownedClient?.device)
        this.dependencies.storage?.setItem(
          STORAGE_KEY,
          JSON.stringify({ id: this.ownedClient.device.id }),
        )
      else this.dependencies.storage?.removeItem(STORAGE_KEY)
    } catch {
      this.update({ error: 'Browser storage is unavailable. Your device will not be remembered.' })
    }
  }
  setRemember = (remember: boolean) => {
    this.update({ remember })
    this.persist()
  }
  clearError = () => this.update({ error: null })

  /** The chooser is called before the first await, preserving browser user activation. */
  connect = async (chooseNew = false, granted?: WebBluetoothDevice): Promise<void> => {
    if (this.state.phase === 'connecting') return
    clearTimeout(this.reconnectTimer)
    const generation = ++this.generation
    this.update({
      phase: 'connecting',
      error: null,
      client: null,
      capabilities: null,
      firmware: null,
      metadataError: null,
    })
    let selected: WebBluetoothDevice
    try {
      selected =
        granted ??
        (!chooseNew ? this.ownedClient?.device : null) ??
        (await this.dependencies.requestDevice())
      if (generation !== this.generation) return
      if (this.ownedClient?.device?.id !== selected.id) {
        await this.ownedClient?.destroy()
        if (generation !== this.generation) return
        const next = this.dependencies.createClient(selected, {
          timeoutMs: 12_000,
          onNotificationError: (error) => {
            if (this.ownedClient === next)
              this.update({ error: `Sensor update failed: ${message(error)}` })
          },
          onDisconnected: () => {
            if (this.ownedClient !== next) return
            this.generation++
            this.update({
              phase: 'disconnected',
              client: null,
              capabilities: null,
              firmware: null,
              metadataLoading: false,
              error: 'Connection lost. Keep your device nearby and powered on.',
            })
            this.scheduleReconnect()
          },
        })
        this.ownedClient = next
      }
      const client = this.ownedClient!
      await client.connect()
      if (generation !== this.generation) return
      this.retries = 0
      this.update({
        phase: 'connected',
        client,
        name: selected.name ?? 'SensWear device',
        sessionId: this.state.sessionId + 1,
      })
      this.persist()
      await this.refreshMetadata()
    } catch (error) {
      if (generation !== this.generation) return
      const cancelled = error instanceof DOMException && error.name === 'NotFoundError'
      this.update({
        phase: this.ownedClient ? 'disconnected' : 'idle',
        error: cancelled
          ? 'No device selected. Choose Connect when you are ready.'
          : message(error),
        metadataLoading: false,
      })
    }
  }

  private scheduleReconnect() {
    if (!this.state.remember || this.retries >= 3) return
    this.reconnectTimer = setTimeout(() => {
      this.retries++
      void this.connect().then(() => {
        if (this.state.phase === 'disconnected') this.scheduleReconnect()
      })
    }, 2000)
  }

  refreshMetadata = async () => {
    const client = this.state.client
    if (!client) return
    const generation = this.generation
    this.update({ metadataLoading: true, metadataError: null })
    try {
      const info = await client.deviceInfo.read()
      if (generation === this.generation)
        this.update({ firmware: info.firmwareVersion, capabilities: info.capabilities })
    } catch (error) {
      if (generation === this.generation)
        this.update({
          metadataError: `Could not read firmware capabilities: ${message(error)}. Retry or update the device firmware.`,
        })
    } finally {
      if (generation === this.generation) this.update({ metadataLoading: false })
    }
  }

  restore = async () => {
    if (this.restored) return
    this.restored = true
    const saved = this.saved()
    if (!saved || !this.state.supported) return
    const generation = this.generation
    try {
      const device = (await this.dependencies.getDevices()).find((item) => item.id === saved.id)
      if (device && generation === this.generation) await this.connect(false, device)
    } catch {
      /* getDevices is optional; leave the explicit Connect button available. */
    }
  }

  disconnect = async (forget = false) => {
    this.generation++
    clearTimeout(this.reconnectTimer)
    this.retries = 0
    this.update({
      phase: 'idle',
      client: null,
      firmware: null,
      capabilities: null,
      metadataLoading: false,
      metadataError: null,
      error: null,
    })
    try {
      await this.ownedClient?.disconnect()
    } catch (error) {
      this.update({ error: message(error) })
    }
    if (forget) {
      const client = this.ownedClient
      this.ownedClient = null
      await client?.destroy()
      this.update({ name: null, remember: false })
      this.persist()
    }
  }
  startDemo = async () => {
    await this.disconnect()
    this.update({
      phase: 'demo',
      name: 'SensWear preview',
      firmware: 'Demo firmware',
      capabilities: new DeviceCapabilities(1, 15, 255),
      sessionId: this.state.sessionId + 1,
    })
  }
  dispose = () => {
    void this.disconnect()
    this.listeners.clear()
  }
}
