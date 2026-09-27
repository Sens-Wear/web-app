import { useState } from 'react'
import { Clock3, ExternalLink as ExternalIcon, RefreshCw, Unplug } from 'lucide-react'
import { ChargeState, DaughterBoard, DeviceFeature, PowerSourceState } from 'senswear-web-bluetooth'
import { useDataTick, useSession } from '../context'
import {
  Badge,
  Button,
  ErrorNote,
  ExportButton,
  ExportNote,
  PageHero,
  Panel,
  Stat,
} from '../components/ui'
import { message } from '../lib/session'

export function Settings() {
  const {
    phase,
    name,
    client,
    firmware,
    capabilities,
    metadataError,
    metadataLoading,
    remember,
    session,
  } = useSession()
  const data = useDataTick()
  const [busy, setBusy] = useState(false)
  const [timeMessage, setTimeMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const shields =
    capabilities?.shields.map((value) => DaughterBoard[value]).join(', ') ||
    (capabilities ? 'None · base firmware' : 'Unavailable')
  const charge =
    data.power === null
      ? 'Unknown'
      : data.power.chargeState === ChargeState.Charging
        ? 'Charging'
        : data.power.batteryPresent
          ? 'On battery'
          : 'Battery absent'
  const synchronize = async () => {
    setBusy(true)
    setError(null)
    try {
      if (phase !== 'demo') {
        if (!client) return
        await client.time.set(new Date())
      }
      setTimeMessage(
        phase === 'demo'
          ? 'Clock sync simulated.'
          : `Clock synchronized at ${new Date().toLocaleTimeString()}.`,
      )
    } catch (error) {
      setError(message(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <PageHero
        eyebrow="DEVICE SETTINGS"
        title="A little closer to your platform."
        description="Power, firmware, connection preferences, and the details that keep your workspace running."
        action={<ExportButton page="settings" />}
      >
        <Badge>{phase === 'demo' ? 'Demo device' : (name ?? 'No connected device')}</Badge>
      </PageHero>
      <div className="stats-row">
        <Stat
          label="Battery"
          value={data.battery === null ? '—' : `${data.battery}%`}
          hint={charge}
        />
        <Stat
          label="External power"
          value={data.power ? PowerSourceState[data.power.wiredPower] : '—'}
          hint="Wired power source"
        />
        <Stat label="Firmware" value={firmware ?? '—'} hint="Read from the connected device" />
      </div>
      <div className="two-columns">
        <Panel
          title="Platform details"
          caption="Capabilities describe the running firmware build."
          action={
            <button
              className="icon-button"
              aria-label="Refresh firmware information"
              disabled={!client || metadataLoading}
              onClick={() => void session.refreshMetadata()}
            >
              <RefreshCw size={17} />
            </button>
          }
        >
          <dl className="details">
            <div>
              <dt>Device</dt>
              <dd>{name ?? 'Not connected'}</dd>
            </div>
            <div>
              <dt>Firmware version</dt>
              <dd>{metadataLoading ? 'Reading…' : (firmware ?? 'Unavailable')}</dd>
            </div>
            <div>
              <dt>Firmware shields</dt>
              <dd>{shields}</dd>
            </div>
            <div>
              <dt>Feature mask</dt>
              <dd>
                {capabilities ? `0x${capabilities.featureMask.toString(16).padStart(8, '0')}` : '—'}
              </dd>
            </div>
            <div>
              <dt>Web app version</dt>
              <dd>1.0.0</dd>
            </div>
            <div>
              <dt>Web Bluetooth SDK</dt>
              <dd>0.4.0</dd>
            </div>
          </dl>
          <ErrorNote error={metadataError} />
          {Boolean(capabilities?.unknownFeatureMask || capabilities?.unknownShieldMask) && (
            <p className="warning-text">
              This firmware reports additional capabilities that need a newer app.
            </p>
          )}
        </Panel>
        <Panel title="Connection preferences" caption="Make the next connection a little simpler.">
          <label className="toggle-row">
            <span>
              <strong>Remember this device</strong>
              <small>
                Save its browser ID locally. Reconnect after a reload where supported, and retry a
                lost connection up to three times.
              </small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={remember}
              onChange={(e) => session.setRemember(e.target.checked)}
            />
          </label>
          <p className="subtle">
            Browser permissions stay under your control. You can revoke Bluetooth access in your
            browser's site settings.
          </p>
          <div className="divider" />
          <h3>Device clock</h3>
          <p>Synchronize the platform's UTC clock with this computer.</p>
          <Button
            className="secondary"
            disabled={
              busy ||
              !(phase === 'connected' || phase === 'demo') ||
              !capabilities?.hasFeature(DeviceFeature.Time)
            }
            onClick={() => void synchronize()}
          >
            <Clock3 size={16} />
            {busy ? 'Synchronizing…' : 'Sync clock'}
          </Button>
          {timeMessage && (
            <p className="success-note" role="status">
              {timeMessage}
            </p>
          )}
          <ErrorNote error={error} />
        </Panel>
      </div>
      <Panel title="Power telemetry" caption="Live device status, available for CSV export.">
        <dl className="details horizontal">
          <div>
            <dt>Battery present</dt>
            <dd>{data.power ? (data.power.batteryPresent ? 'Yes' : 'No') : '—'}</dd>
          </div>
          <div>
            <dt>Charge state</dt>
            <dd>{charge}</dd>
          </div>
          <div>
            <dt>Charge fault code</dt>
            <dd>{data.power?.chargingFault ?? '—'}</dd>
          </div>
        </dl>
      </Panel>
      <ExportNote page="settings" />
      <div className="two-columns">
        <Panel title="Keep exploring" caption="Hardware, accessories, and more from SensWear.">
          <a
            className="button secondary"
            href="https://sens-wear.com"
            target="_blank"
            rel="noreferrer"
          >
            Visit sens-wear.com <ExternalIcon size={15} />
          </a>
        </Panel>
        <Panel
          title="Device management"
          caption="Disconnect and remove this device from the app's saved preferences."
        >
          <Button
            className="danger"
            onClick={() => {
              if (
                window.confirm(
                  'Forget this device and disconnect? Browser Bluetooth permission can be removed separately in site settings.',
                )
              )
                void session.disconnect(true)
            }}
          >
            <Unplug size={16} /> Forget device
          </Button>
        </Panel>
      </div>
    </>
  )
}
