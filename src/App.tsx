import { useEffect, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  Bluetooth,
  CircleHelp,
  FlaskConical,
  Hand,
  HeartPulse,
  LayoutDashboard,
  Lightbulb,
  Settings2,
  Thermometer,
  Vibrate,
  X,
} from 'lucide-react'
import { useDataTick, useSession } from './context'
import { asset, Button, MODULES } from './components/ui'
import type { Page } from './lib/telemetry'
import { Dashboard } from './pages/Dashboard'
import { Sensors } from './pages/Sensors'
import { Haptics, Led } from './pages/Outputs'
import { Settings } from './pages/Settings'

const NAV = [
  { id: 'dashboard', name: 'Overview', icon: LayoutDashboard },
  { id: 'imu', name: 'Motion / IMU', icon: Activity },
  { id: 'ppg', name: 'Optical / PPG', icon: HeartPulse },
  { id: 'temperature', name: 'Temperature', icon: Thermometer },
  { id: 'touch', name: 'Touch', icon: Hand },
  { id: 'led', name: 'LED', icon: Lightbulb },
  { id: 'haptic', name: 'Vibration', icon: Vibrate },
  { id: 'settings', name: 'Settings', icon: Settings2 },
] as const
function currentPage(): Page {
  const hash = location.hash.replace('#', '')
  return NAV.some((item) => item.id === hash) ? (hash as Page) : 'dashboard'
}
export default function App() {
  const [page, setPage] = useState<Page>(currentPage)
  const { phase, name, supported, error, session, sessionId } = useSession()
  const data = useDataTick()
  useEffect(() => {
    const changed = () => {
      setPage(currentPage())
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
    window.addEventListener('hashchange', changed)
    return () => window.removeEventListener('hashchange', changed)
  }, [])
  useEffect(() => {
    document.title = `${NAV.find((item) => item.id === page)?.name ?? 'Overview'} · SensWear`
  }, [page])
  const connected = phase === 'connected'
  return (
    <div className="app-shell">
      <a
        href="#main-content"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('main-content')?.focus()
        }}
      >
        Skip to content
      </a>
      <aside className="sidebar">
        <a href="#dashboard" className="brand" aria-label="SensWear overview">
          <img src={asset('logo.png')} alt="" />
          <span>
            SensWear<small>PLATFORM EXPLORER</small>
          </span>
        </a>
        <div className="nav-eyebrow">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {NAV.map((item, i) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`${page === item.id ? 'active' : ''} ${i === 7 ? 'settings-nav' : ''}`}
              aria-current={page === item.id ? 'page' : undefined}
            >
              <item.icon size={19} strokeWidth={1.7} />
              <span>{item.name}</span>
              {page === item.id && <i />}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="device-mini">
            <div className="device-mini-icon">
              <Bluetooth size={21} />
            </div>
            <div>
              <strong>{phase === 'demo' ? 'Demo workspace' : (name ?? 'Your SensWear')}</strong>
              <span>
                <i className={`status-dot ${connected || phase === 'demo' ? 'online' : ''}`} />
                {phase === 'demo'
                  ? 'Simulated data'
                  : connected
                    ? 'Connected'
                    : phase === 'connecting'
                      ? 'Connecting…'
                      : 'Not connected'}
              </span>
            </div>
          </div>
          <a className="sidebar-help" href="https://sens-wear.com" target="_blank" rel="noreferrer">
            <CircleHelp size={16} /> About SensWear <ArrowUpRight size={14} />
          </a>
          <small>Small platform. Big possibilities.</small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace <span>/</span>
            <strong>
              {page === 'dashboard'
                ? 'Overview'
                : page === 'settings'
                  ? 'Settings'
                  : MODULES.find((m) => m.id === page)?.name}
            </strong>
          </div>
          <div className="topbar-actions">
            {data.battery !== null && (
              <span className="battery-indicator">
                <i style={{ '--level': `${data.battery}%` } as React.CSSProperties} />
                {data.battery}%
              </span>
            )}
            {connected || phase === 'demo' || phase === 'connecting' ? (
              <Button className="secondary small" onClick={() => void session.disconnect()}>
                {phase === 'demo' ? 'Exit demo' : phase === 'connecting' ? 'Cancel' : 'Disconnect'}
              </Button>
            ) : (
              <Button
                className="small"
                disabled={!supported}
                onClick={() => void session.connect()}
              >
                <Bluetooth size={15} />
                {phase === 'disconnected' ? 'Reconnect' : 'Connect device'}
              </Button>
            )}
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          <div className="content-wrap">
            {!supported && phase !== 'demo' && (
              <div className="browser-notice" role="status">
                <CircleHelp size={19} />
                <p>
                  <strong>Web Bluetooth isn't available in this browser.</strong> Open this app in a
                  supported browser, such as Chrome or Edge on desktop, over HTTPS or localhost. You
                  can explore the interface in demo mode.
                </p>
                <Button className="secondary" onClick={() => void session.startDemo()}>
                  Explore demo
                </Button>
              </div>
            )}
            {phase === 'demo' && (
              <div className="demo-banner">
                <FlaskConical size={17} />
                <span>
                  <strong>Demo mode</strong> — all readings and output actions are simulated. No
                  device is connected.
                </span>
                <button className="text-button" onClick={() => void session.disconnect()}>
                  Exit demo
                </button>
              </div>
            )}
            {error && (
              <div className="connection-error" role="alert">
                <span>{error}</span>
                <button
                  className="icon-button"
                  onClick={session.clearError}
                  aria-label="Dismiss connection message"
                >
                  <X size={17} />
                </button>
              </div>
            )}
            <div key={`${page}-${sessionId}`} className="page-content">
              {page === 'dashboard' ? (
                <Dashboard />
              ) : page === 'led' ? (
                <Led />
              ) : page === 'haptic' ? (
                <Haptics />
              ) : page === 'settings' ? (
                <Settings />
              ) : (
                <Sensors page={page} />
              )}
            </div>
            <footer>
              <span>Designed to sense. Built to explore.</span>
              <span>SensWear Web · 1.0.0</span>
            </footer>
          </div>
        </main>
      </div>
    </div>
  )
}
