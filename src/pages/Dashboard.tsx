import { ArrowRight, Bluetooth, Cpu, Radio, ShieldCheck } from 'lucide-react'
import { ChargeState } from 'senswear-web-bluetooth'
import { useDataTick, useSession } from '../context'
import { asset, Badge, Button, ExternalLink, FEATURES, MODULES, Stat } from '../components/ui'

export function Dashboard() {
  const {
    phase,
    capabilities,
    firmware,
    name,
    supported,
    session,
    metadataError,
    metadataLoading,
  } = useSession()
  const data = useDataTick()
  const connected = phase === 'connected' || phase === 'demo'
  const ready = MODULES.filter((m) => capabilities?.hasFeature(FEATURES[m.id])).length
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow muted">SENSWEAR WORKSPACE</span>
          <h1>Your platform, connected.</h1>
          <p>A closer look at the signals that move you.</p>
        </div>
        <Badge tone={connected ? 'green' : ''}>
          <span className={`status-dot ${connected ? 'online' : ''}`} />
          {phase === 'demo'
            ? 'Demo workspace'
            : connected
              ? 'Device connected'
              : 'Ready when you are'}
        </Badge>
      </div>
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <span className="eyebrow">FROM HARDWARE TO POSSIBILITY</span>
          <h2>
            Small platform.
            <br />A world of signals.
          </h2>
          <p>
            Explore your sensors, experiment with feedback, and turn live data into your next idea.
          </p>
          <div className="inline-actions">
            {connected ? (
              <a className="button light" href="#imu">
                Explore motion <ArrowRight size={17} />
              </a>
            ) : (
              <Button
                className="light"
                disabled={!supported || phase === 'connecting'}
                onClick={() => void session.connect()}
              >
                <Bluetooth size={17} />
                {phase === 'connecting' ? 'Connecting…' : 'Connect a device'}
              </Button>
            )}
            {!connected && (
              <Button className="ghost-light" onClick={() => void session.startDemo()}>
                Explore demo <ArrowRight size={16} />
              </Button>
            )}
          </div>
          <span className="hero-footnote">
            <ShieldCheck size={14} />
            Direct device connection. Your data stays in your browser.
          </span>
        </div>
        <div className="hero-product">
          <img src={asset('platform.png')} alt="SensWear circular sensor platform" />
          <span>
            SensWear platform <i>Built for exploration</i>
          </span>
        </div>
      </section>
      <div className="stats-row">
        <Stat
          label="Connected platform"
          value={name ?? 'No device yet'}
          hint={
            connected
              ? phase === 'demo'
                ? 'Preview with simulated data'
                : 'Bluetooth connection active'
              : 'Choose your device to get started'
          }
        />
        <Stat
          label="Available modules"
          value={capabilities ? `${ready} / 6` : '— / 6'}
          hint="Based on running firmware capabilities"
        />
        <Stat
          label="Battery level"
          value={data.battery === null ? '—' : `${data.battery}%`}
          hint={
            data.power?.chargeState === ChargeState.Charging
              ? 'Charging'
              : data.battery === null
                ? 'Available after connecting'
                : 'Running on battery'
          }
        />
      </div>
      {metadataError && (
        <div className="feature-notice">
          <Cpu size={20} />
          <div>
            <strong>Firmware information unavailable</strong>
            <p>{metadataError}</p>
          </div>
          <Button onClick={() => void session.refreshMetadata()} disabled={metadataLoading}>
            Retry
          </Button>
        </div>
      )}
      <div className="section-heading">
        <div>
          <span className="eyebrow muted">SENSE · EXPLORE · CREATE</span>
          <h2>Your sensor toolkit</h2>
          <p>Six ways to connect with your platform.</p>
        </div>
        <span className="subtle">
          {firmware ? `Firmware ${firmware}` : 'Sensor & output modules'}
        </span>
      </div>
      <div className="module-grid">
        {MODULES.map((module) => {
          const available = capabilities?.hasFeature(FEATURES[module.id])
          return (
            <a href={`#${module.id}`} key={module.id} className="module-card">
              <div className="module-top">
                <div className="module-icon">
                  <img src={asset(`icons/${module.image}.png`)} alt="" />
                </div>
                <ArrowRight className="module-arrow" size={19} />
              </div>
              <h3>{module.name}</h3>
              <p>{module.description}</p>
              <div className="module-footer">
                <Badge>{module.board}</Badge>
                <span className={`module-status ${available ? 'ready' : ''}`}>
                  {available
                    ? 'Available'
                    : connected && capabilities
                      ? 'Not in firmware'
                      : 'Explore'}
                </span>
              </div>
            </a>
          )
        })}
      </div>
      <div className="workspace-note">
        <div className="note-icon">
          <Radio size={21} />
        </div>
        <div>
          <strong>Made for hands-on discovery.</strong>
          <p>
            Use your existing SensWear hardware. Connect, explore, and export readings from one
            workspace.
          </p>
        </div>
        <ExternalLink />
      </div>
    </>
  )
}
