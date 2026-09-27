import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpRight,
  Bluetooth,
  CircleHelp,
  Pause,
  Play,
  RefreshCw,
} from 'lucide-react'
import { DeviceFeature } from 'senswear-web-bluetooth'
import { useData, useSession } from '../context'
import type { Page, Graph, Point } from '../lib/telemetry'
import type { StreamStatus } from '../lib/streams'
import type { ReactNode } from 'react'

export const FEATURES: Record<string, DeviceFeature> = {
  imu: DeviceFeature.Imu,
  ppg: DeviceFeature.Ppg,
  temperature: DeviceFeature.Temperature,
  touch: DeviceFeature.Touch,
  led: DeviceFeature.Led,
  haptic: DeviceFeature.Haptic,
}
export const MODULES = [
  {
    id: 'led',
    name: 'LED',
    title: 'A little color. A clear signal.',
    description: 'Color, light, and visual feedback.',
    image: 'led',
    board: 'Main board',
  },
  {
    id: 'imu',
    name: 'IMU',
    title: 'Every movement, in view.',
    description: 'Motion, posture, and orientation.',
    image: 'imu',
    board: 'Main board',
  },
  {
    id: 'ppg',
    name: 'PPG',
    title: 'See the shape of your signal.',
    description: 'Three channels of optical data.',
    image: 'heart_rate',
    board: 'PPG shield',
  },
  {
    id: 'temperature',
    name: 'Temperature',
    title: 'Stay in touch with temperature.',
    description: 'Live thermal readings and trends.',
    image: 'temperature',
    board: 'Temperature shield',
  },
  {
    id: 'touch',
    name: 'Touch',
    title: 'A touch of possibility.',
    description: 'Position, gestures, and interaction.',
    image: 'touch',
    board: 'Touch shield',
  },
  {
    id: 'haptic',
    name: 'Vibration',
    title: 'Feedback you can feel.',
    description: 'Build a rhythm. Send a signal.',
    image: 'vibration',
    board: 'Haptic shield',
  },
] as const
export const asset = (name: string) => `${import.meta.env.BASE_URL}assets/${name}`
export function useAvailable(page: Page) {
  const { phase, capabilities } = useSession()
  return (
    (phase === 'connected' || phase === 'demo') && Boolean(capabilities?.hasFeature(FEATURES[page]))
  )
}
export function Button({
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`button ${className}`} {...props}>
      {children}
    </button>
  )
}
export function Panel({
  title,
  caption,
  children,
  action,
  className = '',
}: {
  title?: string
  caption?: string
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-heading">
          <div>
            <h2>{title}</h2>
            {caption && <p>{caption}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
export function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>
}
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  )
}
export function PageHero({
  eyebrow,
  title,
  description,
  children,
  action,
}: {
  eyebrow: string
  title: string
  description: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="page-hero">
      <div className="hero-top">
        <a href="#dashboard" className="back-link">
          <ArrowLeft size={15} /> All sensors
        </a>
        {action}
      </div>
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
      {children && <div className="hero-tags">{children}</div>}
    </section>
  )
}
export function ExportButton({ page }: { page: Exclude<Page, 'dashboard'> }) {
  const data = useData()
  const { phase } = useSession()
  const log = data.logs[page]
  return (
    <Button
      className="export-button"
      disabled={!log.size}
      onClick={() => log.download(page, phase === 'demo')}
      title={
        log.size
          ? `Download ${log.size.toLocaleString()} records`
          : 'Collect samples or use a control first'
      }
    >
      <ArrowDownToLine size={16} /> Export CSV
    </Button>
  )
}
export function ExportNote({ page }: { page: Exclude<Page, 'dashboard'> }) {
  const data = useData()
  const log = data.logs[page]
  return (
    <p className={`export-note ${log.dropped ? 'warning-text' : ''}`}>
      {log.size.toLocaleString()} records in this session · Exact device timestamps retained
      {log.dropped > 0 &&
        ` · Recording limit reached (${log.dropped.toLocaleString()} additional records omitted). Export and clear to continue.`}
      {log.size > 0 && (
        <button
          className="text-button"
          onClick={() => {
            log.clear()
            data.version++
          }}
        >
          Clear recording
        </button>
      )}
    </p>
  )
}
export function FeatureNotice({ page }: { page: Page }) {
  const { phase, capabilities, metadataLoading, metadataError, supported, session } = useSession()
  if (useAvailable(page)) return null
  const connected = phase === 'connected'
  return (
    <div className="feature-notice" role="status">
      <CircleHelp size={20} />
      <div>
        <strong>
          {!connected
            ? 'Connect your platform to use this module'
            : metadataLoading
              ? 'Checking firmware support…'
              : !capabilities
                ? 'Firmware information unavailable'
                : 'This module is not enabled in your firmware'}
        </strong>
        <p>
          {!connected
            ? 'Live readings and controls will become available after connecting.'
            : (metadataError ??
              'Connect a device with the matching shield and firmware configuration.')}
        </p>
      </div>
      {!connected ? (
        <Button
          disabled={!supported || phase === 'connecting'}
          onClick={() => void session.connect()}
        >
          <Bluetooth size={15} /> Connect
        </Button>
      ) : (
        !capabilities && (
          <Button disabled={metadataLoading} onClick={() => void session.refreshMetadata()}>
            Retry
          </Button>
        )
      )}
    </div>
  )
}
export function StreamControls({
  running,
  setRunning,
  available,
  status,
  retry,
}: {
  running: boolean
  setRunning: (value: boolean) => void
  available: boolean
  status: StreamStatus
  retry: () => void
}) {
  const { phase } = useSession()
  return (
    <div className="stream-toolbar">
      <div>
        <span className={`status-dot ${running && status.state === 'ready' ? 'online' : ''}`} />
        {!available
          ? 'No stream connected'
          : !running
            ? 'Stream paused'
            : status.state === 'error'
              ? 'Stream could not start'
              : status.state === 'starting'
                ? 'Starting stream…'
                : phase === 'demo'
                  ? 'Simulated stream'
                  : 'Listening for samples'}
      </div>
      <div className="inline-actions">
        {status.state === 'error' && (
          <Button className="secondary" onClick={retry}>
            <RefreshCw size={15} /> Retry
          </Button>
        )}
        <Button className="secondary" disabled={!available} onClick={() => setRunning(!running)}>
          {running ? <Pause size={15} /> : <Play size={15} />}
          {running ? 'Pause' : 'Resume'}
        </Button>
      </div>
    </div>
  )
}
export function ErrorNote({ error }: { error: string | null }) {
  return error ? (
    <p className="error-note" role="alert">
      {error}
    </p>
  ) : null
}
export function ExternalLink() {
  return (
    <a className="external-link" href="https://sens-wear.com" target="_blank" rel="noreferrer">
      Explore the SensWear platform <ArrowUpRight size={16} />
    </a>
  )
}

export const SERIES_COLORS = ['#c96546', '#398363', '#497ea0', '#a586b7']
export function Chart({
  title,
  graph,
  series,
  unit,
  data,
  colors = SERIES_COLORS,
}: {
  title: string
  graph: Graph
  series: string[]
  unit: string
  data: Point[]
  colors?: string[]
}) {
  const finite = data
    .flatMap((p) => p.values)
    .filter((v): v is number => v !== null && Number.isFinite(v))
  const min = finite.length ? Math.min(...finite) : 0
  const max = finite.length ? Math.max(...finite) : 1
  const padding = (max - min) * 0.14 || Math.max(Math.abs(max) * 0.05, 0.1)
  const lo = min - padding,
    hi = max + padding
  const width = 800,
    left = 66,
    right = 780,
    top = 20,
    bottom = 196
  const start = data[0]?.time ?? 0,
    end = data.at(-1)?.time ?? 1
  const x = (time: number) => left + ((time - start) / (end - start || 1)) * (right - left)
  const y = (value: number) => bottom - ((value - lo) / (hi - lo)) * (bottom - top)
  const format = (value: number) => (Math.abs(value) >= 1000 ? value.toFixed(0) : value.toFixed(2))
  return (
    <Panel
      title={title}
      caption={unit}
      action={<Badge>{data.length} / 500 samples</Badge>}
      className="chart-card"
    >
      <div className="chart-legend">
        {series.map((label, i) => (
          <span key={label}>
            <i style={{ background: colors[i] }} />
            {label}
            <b>{data.at(-1)?.values[i] == null ? '—' : format(data.at(-1)!.values[i]!)}</b>
          </span>
        ))}
      </div>
      <div className="chart-wrap">
        <svg
          viewBox={`0 0 ${width} 232`}
          role="img"
          aria-label={`${title}, ${unit}, ${data.length} samples`}
        >
          {Array.from({ length: 5 }, (_, i) => {
            const yy = top + (i * (bottom - top)) / 4
            return (
              <g key={i}>
                <line x1={left} x2={right} y1={yy} y2={yy} stroke="#e5e6df" strokeDasharray="3 5" />
                <text x={left - 12} y={yy + 4} textAnchor="end">
                  {format(hi - (i * (hi - lo)) / 4)}
                </text>
              </g>
            )
          })}
          {series.map((label, i) => {
            let started = false
            const path = data
              .map((point) => {
                const value = point.values[i]
                if (value === null || !Number.isFinite(value)) {
                  started = false
                  return ''
                }
                const move = started ? 'L' : 'M'
                started = true
                return `${move}${x(point.time).toFixed(2)},${y(value).toFixed(2)}`
              })
              .join(' ')
            return (
              <path
                key={label}
                d={path}
                stroke={colors[i]}
                fill="none"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            )
          })}
          <text x={left} y={225}>
            {start.toFixed(1)} s
          </text>
          <text x={right} y={225} textAnchor="end">
            {end.toFixed(1)} s
          </text>
        </svg>
        {!data.length && (
          <div className="chart-empty">
            <span className="empty-wave">∿</span>
            <strong>
              Waiting for {graph === 'temperature' ? 'a temperature reading' : 'samples'}
            </strong>
            <span>The chart fills when this stream receives data.</span>
          </div>
        )}
      </div>
      <div className="chart-foot">Elapsed session time · Latest 500 samples</div>
    </Panel>
  )
}
