import { useEffect, useState } from 'react'
import { LockKeyhole, RotateCcw, UnlockKeyhole } from 'lucide-react'
import {
  useAvailable,
  Badge,
  Button,
  Chart,
  ErrorNote,
  ExportButton,
  ExportNote,
  FeatureNotice,
  PageHero,
  Panel,
  Stat,
  StreamControls,
} from '../components/ui'
import { useDataTick, useSession, useStream } from '../context'
import { defaultSandbox, type StreamPage } from '../lib/telemetry'
import { message } from '../lib/session'

const COPY = {
  imu: [
    'IMU LIVE VIEW',
    'Every movement, in view.',
    'Explore acceleration, orientation, and raw gyroscope signals as your platform moves.',
  ],
  ppg: [
    'OPTICAL SIGNALS',
    'See the shape of your signal.',
    'Three optical channels. One clear view of your raw red, infrared, and green readings.',
  ],
  temperature: [
    'TEMPERATURE LIVE VIEW',
    'Stay in touch with temperature.',
    'Follow the latest thermal reading and its history, one indicated measurement at a time.',
  ],
  touch: [
    'TOUCH EXPLORER',
    'A touch of possibility.',
    'Slide, tap, and swipe across the 15-electrode strip. Watch your interactions come to life.',
  ],
} as const
export function Sensors({ page }: { page: StreamPage }) {
  const data = useDataTick()
  const { phase, client } = useSession()
  const available = useAvailable(page)
  const [running, setRunning] = useState(true)
  const [drain, setDrain] = useState(100)
  const status = useStream(page, running && available, drain)
  const copy = COPY[page]
  return (
    <>
      <PageHero
        eyebrow={copy[0]}
        title={copy[1]}
        description={copy[2]}
        action={<ExportButton page={page} />}
      >
        <Badge>{phase === 'demo' ? 'Simulated readings' : 'Live sensor view'}</Badge>
        <Badge>
          {page === 'imu'
            ? '3 motion streams'
            : page === 'ppg'
              ? '3 optical channels'
              : page === 'touch'
                ? '15 electrodes · 42 mm'
                : 'Indicated measurements'}
        </Badge>
      </PageHero>
      <FeatureNotice page={page} />
      <StreamControls
        available={available}
        running={running}
        setRunning={setRunning}
        status={status}
        retry={status.retry}
      />
      <ErrorNote error={status.error} />
      {page === 'imu' && (
        <>
          <div className="stats-row">
            <Stat
              label="Acceleration"
              value="X / Y / Z"
              hint="Gravity-including acceleration in g"
            />
            <Stat label="Orientation" value="Quaternion" hint="X, Y, Z, W · unitless components" />
            <div className="stat">
              <label htmlFor="drain">Delivery cadence</label>
              <select
                id="drain"
                value={drain}
                disabled={!available}
                onChange={(e) => setDrain(Number(e.target.value))}
              >
                <option value={50}>50 ms</option>
                <option value={100}>100 ms</option>
                <option value={250}>250 ms</option>
                <option value={500}>500 ms</option>
              </select>
              <small>FIFO drain period, not sampling frequency</small>
            </div>
          </div>
          <Chart
            title="Acceleration"
            graph="acceleration"
            data={data.graphs.acceleration}
            series={['X', 'Y', 'Z']}
            unit="Acceleration · g"
          />
          <Chart
            title="Orientation"
            graph="quaternion"
            data={data.graphs.quaternion}
            series={['X', 'Y', 'Z', 'W']}
            unit="Quaternion · unitless"
          />
          <Chart
            title="Gyroscope"
            graph="gyroscope"
            data={data.graphs.gyroscope}
            series={['X', 'Y', 'Z']}
            unit="Raw firmware sample units"
          />
        </>
      )}
      {page === 'ppg' && (
        <>
          <div className="stats-row">
            <Stat
              label="Optical channels"
              value="Red / IR / Green"
              hint="Unprocessed optical ADC counts"
            />
            <Stat
              label="Recording"
              value={data.logs.ppg.size.toLocaleString()}
              hint="Samples kept for CSV export"
            />
            <Stat label="Data type" value="Raw PPG" hint="Not heart rate or SpO₂" />
          </div>
          <Chart
            title="Red channel"
            graph="red"
            data={data.graphs.red}
            series={['Red']}
            unit="Raw ADC count"
            colors={['#c65b50']}
          />
          <Chart
            title="Infrared channel"
            graph="ir"
            data={data.graphs.ir}
            series={['Infrared']}
            unit="Raw ADC count"
            colors={['#8b74a9']}
          />
          <Chart
            title="Green channel"
            graph="green"
            data={data.graphs.green}
            series={['Green']}
            unit="Raw ADC count"
            colors={['#398363']}
          />
        </>
      )}
      {page === 'temperature' && <TemperatureControls available={available} />}
      {page === 'touch' && <TouchView />}
      <ExportNote page={page} />
      {page === 'temperature' && client && !running && (
        <p className="subtle">
          Pausing this view stops listening. Use the measurement interval to change device
          scheduling.
        </p>
      )}
    </>
  )
}

function TemperatureControls({ available }: { available: boolean }) {
  const data = useDataTick()
  const { client, phase } = useSession()
  const [interval, setIntervalValue] = useState(60)
  const [unit, setUnit] = useState<'C' | 'F'>('C')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (data.temperatureInterval !== null) setIntervalValue(data.temperatureInterval)
  }, [data.temperatureInterval])
  const temperature =
    data.temperature === null
      ? null
      : unit === 'C'
        ? data.temperature
        : (data.temperature * 9) / 5 + 32
  const apply = async () => {
    setBusy(true)
    setError(null)
    try {
      if (phase !== 'demo') {
        if (!client) return
        await client.temperature.setMeasurementInterval(interval)
      }
      data.temperatureInterval = interval
      data.version++
    } catch (error) {
      setError(message(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div className="stats-row">
        <Stat
          label="Latest reading"
          value={temperature === null ? '—' : `${temperature.toFixed(2)} °${unit}`}
          hint="Sensor measurement"
        />
        <Stat
          label="Measurement interval"
          value={
            data.temperatureInterval === null
              ? '—'
              : data.temperatureInterval === 0
                ? 'Disabled'
                : `${data.temperatureInterval} s`
          }
          hint="Device scheduling · 0 disables measurements"
        />
        <div className="stat">
          <label htmlFor="temperature-unit">Display unit</label>
          <select
            id="temperature-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value as 'C' | 'F')}
          >
            <option value="C">Celsius (°C)</option>
            <option value="F">Fahrenheit (°F)</option>
          </select>
          <small>CSV always retains Celsius</small>
        </div>
      </div>
      <Panel
        title="Measurement scheduling"
        caption="Use whole-minute intervals. The device sends indications when a measurement is ready."
      >
        <div className="form-row">
          <label htmlFor="measurement-interval">
            Interval in seconds
            <input
              id="measurement-interval"
              type="number"
              min="0"
              max="65520"
              step="60"
              value={interval}
              onChange={(e) => setIntervalValue(Number(e.target.value))}
              disabled={!available || busy}
            />
          </label>
          <Button
            disabled={
              !available ||
              busy ||
              !Number.isInteger(interval) ||
              interval < 0 ||
              interval > 65520 ||
              interval % 60 !== 0
            }
            onClick={() => void apply()}
          >
            {busy ? 'Applying…' : 'Apply interval'}
          </Button>
        </div>
        <ErrorNote error={error} />
        {data.temperatureInterval === 0 && (
          <p className="warning-text">
            Measurements are disabled. Set an interval of 60 seconds or more to receive readings.
          </p>
        )}
      </Panel>
      <Chart
        title="Temperature history"
        graph="temperature"
        data={
          unit === 'C'
            ? data.graphs.temperature
            : data.graphs.temperature.map((p) => ({
                ...p,
                values: p.values.map((v) => (v === null ? null : (v * 9) / 5 + 32)),
              }))
        }
        series={['Temperature']}
        unit={`Temperature · °${unit}`}
        colors={['#c98248']}
      />
    </>
  )
}
function TouchView() {
  const data = useDataTick()
  const normalized = data.touch?.positionNormalized ?? null
  return (
    <>
      <div className="stats-row">
        <Stat
          label="Contact"
          value={data.touch === null ? '—' : data.touch.touched ? 'Touch detected' : 'Released'}
          hint="Live state from the touch strip"
        />
        <Stat
          label="Position"
          value={data.touch?.positionMm == null ? '—' : `${data.touch.positionMm.toFixed(1)} mm`}
          hint="Nominal distance from first electrode"
        />
        <Stat
          label="Controller coordinates"
          value={data.touch ? `${data.touch.x} / ${data.touch.y}` : '— / —'}
          hint="X / Y · controller units"
        />
      </div>
      <Panel
        title="Follow your touch"
        caption="Slide from the connector to the tip of the linear strip."
      >
        <div className="touch-strip">
          {Array.from({ length: 15 }, (_, i) => (
            <span
              key={i}
              className={normalized !== null && Math.abs(i - normalized * 14) < 1 ? 'lit' : ''}
            >
              <i />
              {i + 1}
            </span>
          ))}
        </div>
        <div className="strip-labels">
          <span>Connector · 0 mm</span>
          <span>Tip · 42 mm</span>
        </div>
      </Panel>
      <div className="two-columns">
        <Panel
          title="Interaction sandbox"
          caption="Tap to toggle. Hold to lock. Double-tap to reset."
          action={
            <button
              className="icon-button"
              aria-label="Reset interaction sandbox"
              onClick={() => {
                data.sandbox = defaultSandbox()
                data.version++
              }}
            >
              <RotateCcw size={17} />
            </button>
          }
        >
          <div className={`sandbox-light ${data.sandbox.lit ? 'on' : ''}`}>
            <span>{data.sandbox.lit ? 'ON' : 'OFF'}</span>
            {data.sandbox.locked ? <LockKeyhole /> : <UnlockKeyhole />}
          </div>
          <div className="sandbox-level">
            <div style={{ width: `${data.sandbox.level}%` }} />
          </div>
          <p className="sandbox-caption">
            Level {data.sandbox.level}% · {data.sandbox.locked ? 'Locked' : 'Following your finger'}
          </p>
          <div className="slots">
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className={i === data.sandbox.slot ? 'selected' : ''}>
                {i + 1}
              </span>
            ))}
          </div>
          <p className="subtle">Swipe left or right to change the selected slot.</p>
        </Panel>
        <Panel title="Gesture activity" caption="Your latest eight gestures.">
          <div className="gesture-list">
            {data.gestures.length ? (
              data.gestures.map((gesture, i) => (
                <div key={`${gesture.sample.timestampUs}-${i}`}>
                  <span>{gesture.name}</span>
                  <small>
                    {new Date(Number(gesture.sample.timestampUs / 1000n)).toLocaleTimeString()}
                  </small>
                </div>
              ))
            ) : (
              <p className="empty-copy">Your gestures will appear here.</p>
            )}
          </div>
          {data.raw && (
            <p className="subtle">
              Raw touch state: {data.raw.touchState} · Timestamp: {data.raw.timestampUs.toString()}{' '}
              µs
            </p>
          )}
        </Panel>
      </div>
      <Chart
        title="Touch position"
        graph="touch"
        data={data.graphs.touch}
        series={['Position']}
        unit="Nominal position · mm"
        colors={['#398363']}
      />
    </>
  )
}
