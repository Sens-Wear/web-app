import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { DeviceFeature } from 'senswear-web-bluetooth'
import { Session } from './lib/session'
import { Telemetry, type StreamPage } from './lib/telemetry'
import { demoStream, openStream, type StreamStatus } from './lib/streams'

const SessionContext = createContext<Session | null>(null)
const DataContext = createContext<Telemetry | null>(null)
export function useSession() {
  const session = useContext(SessionContext)
  if (!session) throw new Error('SessionProvider missing')
  return { ...useSyncExternalStore(session.subscribe, session.getSnapshot), session }
}
export function useData() {
  const data = useContext(DataContext)
  if (!data) throw new Error('DataProvider missing')
  return data
}
export function Providers({ session, children }: { session: Session; children: ReactNode }) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const data = useMemo(() => new Telemetry(), [snapshot.sessionId])
  useEffect(() => {
    const timer = setTimeout(() => {
      void session.restore()
    }, 0)
    const leave = () => {
      void session.disconnect()
    }
    window.addEventListener('pagehide', leave)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pagehide', leave)
    }
  }, [session])
  return (
    <SessionContext.Provider value={session}>
      <DataContext.Provider value={data}>
        <PowerFeed />
        {children}
      </DataContext.Provider>
    </SessionContext.Provider>
  )
}
function PowerFeed() {
  const { phase, client, capabilities, session, sessionId } = useSession()
  const data = useData()
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (phase === 'demo') return demoStream('power', data)
    if (!client || !capabilities?.hasFeature(DeviceFeature.Battery)) return
    let active = true
    const stream = openStream(
      client,
      'power',
      data,
      (status) => {
        if (active) setError(status.error)
      },
      100,
      () =>
        session.getSnapshot().phase === 'connected' &&
        session.getSnapshot().sessionId === sessionId,
    )
    return () => {
      active = false
      void stream.stop()
    }
  }, [phase, client, capabilities, data, session, sessionId])
  return error && phase === 'connected' ? (
    <div className="power-error" role="status">
      Power telemetry unavailable: {error}
    </div>
  ) : null
}
export function useDataTick() {
  const data = useData()
  const [, update] = useState(0)
  useEffect(() => {
    let version = -1
    const timer = setInterval(() => {
      if (data.version !== version) {
        version = data.version
        update((v) => v + 1)
      }
    }, 200)
    return () => clearInterval(timer)
  }, [data])
  return data
}
export function useStream(kind: StreamPage, enabled: boolean, drainMs = 100) {
  const { phase, client, session, sessionId } = useSession()
  const data = useData()
  const [status, setStatus] = useState<StreamStatus>({ state: 'paused', error: null })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!enabled) {
      setStatus({ state: 'paused', error: null })
      return
    }
    if (phase === 'demo') {
      setStatus({ state: 'ready', error: null })
      return demoStream(kind, data)
    }
    if (!client) {
      setStatus({ state: 'paused', error: null })
      return
    }
    let mounted = true
    const stream = openStream(
      client,
      kind,
      data,
      (value) => {
        if (mounted) setStatus(value)
      },
      drainMs,
      () =>
        session.getSnapshot().phase === 'connected' &&
        session.getSnapshot().sessionId === sessionId,
    )
    return () => {
      mounted = false
      void stream.stop()
    }
  }, [phase, client, data, kind, enabled, drainMs, retry, session, sessionId])
  return { ...status, retry: () => setRetry((value) => value + 1) }
}
