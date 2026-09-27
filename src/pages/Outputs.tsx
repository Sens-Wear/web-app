import { useEffect, useMemo, useState } from 'react'
import { Check, Play, Plus, Power, Trash2 } from 'lucide-react'
import { HapticFrame, HapticPattern, LedColor } from 'senswear-web-bluetooth'
import { useDataTick, useSession } from '../context'
import {
  Badge,
  Button,
  ErrorNote,
  ExportButton,
  ExportNote,
  FeatureNotice,
  PageHero,
  Panel,
  Stat,
  useAvailable,
} from '../components/ui'
import { buildPattern, morseAmplitudes, PRESETS } from '../lib/haptics'
import { message } from '../lib/session'

export function Led() {
  const { client, phase } = useSession()
  const data = useDataTick()
  const available = useAvailable('led')
  const [color, setColor] = useState('#4fb992')
  const [applied, setApplied] = useState<string | null>(null)
  const [brightness, setBrightness] = useState(100)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    if (client && available)
      void client.led
        .read()
        .then((value) => {
          if (active) setApplied(value.toHex())
        })
        .catch((error) => {
          if (active) setError(message(error))
        })
    return () => {
      active = false
    }
  }, [client, available])
  const rgb = /^#[0-9a-f]{6}$/i.test(color) ? LedColor.fromHex(color) : null
  const scaled = rgb
    ? new LedColor(
        ...([rgb.red, rgb.green, rgb.blue].map((value) =>
          Math.round((value * brightness) / 100),
        ) as [number, number, number]),
      ).toHex()
    : null
  const send = async (off = false) => {
    if (!available || busy || !scaled) return
    const hex = off ? '#000000' : scaled
    setBusy(true)
    setError(null)
    try {
      if (phase !== 'demo') {
        if (!client) return
        await client.led.set(hex)
      }
      setApplied(hex)
      data.logs.led.append({
        event: off ? 'turn_off' : 'set_color',
        rgb_hex: hex,
        result: phase === 'demo' ? 'simulated' : 'write_succeeded',
      })
    } catch (error) {
      setError(message(error))
      data.logs.led.append({
        event: 'set_color',
        rgb_hex: hex,
        result: 'write_failed',
        error: message(error),
      })
    } finally {
      setBusy(false)
      data.version++
    }
  }
  return (
    <>
      <PageHero
        eyebrow="LED CONTROL"
        title="A little color. A clear signal."
        description="Find your color, adjust its brightness, and bring it to the onboard RGB LED."
        action={<ExportButton page="led" />}
      >
        <Badge>RGB output</Badge>
        <Badge>
          {applied === null ? 'State not yet read' : applied === '#000000' ? 'LED off' : 'LED on'}
        </Badge>
      </PageHero>
      <FeatureNotice page="led" />
      <div className="two-columns output-grid">
        <Panel className="led-preview-panel">
          <div
            className="led-orb"
            style={{ '--led-color': scaled ?? '#4fb992' } as React.CSSProperties}
          >
            <div />
          </div>
          <span className="eyebrow muted">COLOR PREVIEW</span>
          <h2 className="color-value">{(scaled ?? 'Invalid color').toUpperCase()}</h2>
          <p>Preview changes are applied when you select Set color.</p>
          <div className="applied-color">
            Last confirmed output <span style={{ background: applied ?? '#ddd' }} />
            {applied?.toUpperCase() ?? 'Unknown'}
          </div>
        </Panel>
        <Panel
          title="Make it your color"
          caption="Choose a preset or create something of your own."
        >
          <fieldset disabled={!available || busy}>
            <div className="swatches">
              {['#ef7462', '#edb657', '#75b08c', '#4fa8c4', '#8a7abb', '#ffffff'].map((hex) => (
                <button
                  key={hex}
                  className={color === hex ? 'chosen' : ''}
                  style={{ background: hex }}
                  aria-label={`Choose ${hex}`}
                  aria-pressed={color === hex}
                  onClick={() => setColor(hex)}
                >
                  {color === hex && <Check size={18} />}
                </button>
              ))}
            </div>
            <div className="color-fields">
              <label htmlFor="color-picker">
                Color picker
                <input
                  id="color-picker"
                  type="color"
                  value={rgb ? color : '#000000'}
                  onChange={(e) => setColor(e.target.value)}
                />
              </label>
              <label htmlFor="color-hex">
                HEX color
                <input
                  id="color-hex"
                  value={color}
                  maxLength={7}
                  onChange={(e) => setColor(e.target.value)}
                  spellCheck={false}
                />
              </label>
            </div>
            {!rgb && (
              <p className="error-note">Enter a six-digit HEX color, for example #4FB992.</p>
            )}
            <label htmlFor="brightness" className="range-label">
              Brightness <strong>{brightness}%</strong>
            </label>
            <input
              id="brightness"
              type="range"
              min="0"
              max="100"
              value={brightness}
              onChange={(e) => setBrightness(Number(e.target.value))}
            />
            <p className="subtle">Brightness scales the three RGB channels.</p>
            <div className="inline-actions">
              <Button disabled={!rgb} onClick={() => void send()}>
                {busy ? 'Sending…' : 'Set color'}
              </Button>
              <Button className="secondary" onClick={() => void send(true)}>
                <Power size={16} /> Turn off
              </Button>
            </div>
          </fieldset>
          <ErrorNote error={error} />
        </Panel>
      </div>
      <ExportNote page="led" />
    </>
  )
}

export function Haptics() {
  const { client, phase } = useSession()
  const data = useDataTick()
  const available = useAvailable('haptic')
  const [source, setSource] = useState<'presets' | 'morse' | 'custom'>('presets')
  const [preset, setPreset] = useState(0)
  const [intensity, setIntensity] = useState(75)
  const [word, setWord] = useState('SOS')
  const [frames, setFrames] = useState([
    { durationMs: 160, intensity: 190 },
    { durationMs: 160, intensity: 0 },
    { durationMs: 160, intensity: 190 },
  ])
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(timer)
  }, [])
  const prepared = useMemo(() => {
    try {
      const pattern =
        source === 'custom'
          ? new HapticPattern(
              frames.map((frame) => new HapticFrame(frame.durationMs, frame.intensity)),
            )
          : buildPattern(
              source === 'presets' ? PRESETS[preset].amplitudes : morseAmplitudes(word),
              intensity / 100,
            )
      return { pattern, error: null }
    } catch (error) {
      return { pattern: null, error: message(error) }
    }
  }, [source, frames, preset, word, intensity])
  const duration = prepared.pattern?.frames.reduce((sum, frame) => sum + frame.durationMs, 0) ?? 0
  const busy = data.hapticPending || data.hapticBusyUntil > now
  const play = async () => {
    const pattern = prepared.pattern
    if (!pattern || !available || data.hapticPending || data.hapticBusyUntil > Date.now()) return
    data.hapticPending = true
    data.version++
    setError(null)
    const name =
      source === 'presets'
        ? PRESETS[preset].name
        : source === 'morse'
          ? `Morse ${word.toUpperCase()}`
          : 'Custom sequence'
    try {
      if (phase !== 'demo') {
        if (!client) return
        if (pattern.frames.length === 1)
          await client.haptic.vibrate(pattern.frames[0].durationMs, pattern.frames[0].intensity)
        else await client.haptic.play(pattern)
      }
      data.hapticBusyUntil = Date.now() + duration
      pattern.frames.forEach((frame, index) =>
        data.logs.haptic.append({
          pattern: name,
          frame_index: index,
          duration_ms: frame.durationMs,
          intensity_0_255: frame.intensity,
          result: phase === 'demo' ? 'simulated' : 'write_succeeded',
        }),
      )
    } catch (error) {
      setError(message(error))
      data.logs.haptic.append({ pattern: name, result: 'write_failed', error: message(error) })
    } finally {
      data.hapticPending = false
      data.version++
    }
  }
  return (
    <>
      <PageHero
        eyebrow="HAPTIC STUDIO"
        title="Feedback you can feel."
        description="Start with a pulse, shape a sequence, or turn a short message into a tactile rhythm."
        action={<ExportButton page="haptic" />}
      >
        <Badge>Up to 32 frames</Badge>
        <Badge>{busy ? 'Pattern playing' : 'Ready to compose'}</Badge>
      </PageHero>
      <FeatureNotice page="haptic" />
      <div className="two-columns">
        <Panel title="Choose your rhythm" caption="Build a pattern that feels right.">
          <div className="segmented" role="group" aria-label="Pattern source">
            {(['presets', 'morse', 'custom'] as const).map((value) => (
              <button
                key={value}
                aria-pressed={source === value}
                className={source === value ? 'active' : ''}
                onClick={() => setSource(value)}
              >
                {value === 'presets' ? 'Presets' : value === 'morse' ? 'Morse' : 'Sequence'}
              </button>
            ))}
          </div>
          {source === 'presets' && (
            <div className="preset-list">
              {PRESETS.map((item, i) => (
                <button
                  key={item.name}
                  aria-pressed={preset === i}
                  className={preset === i ? 'active' : ''}
                  onClick={() => setPreset(i)}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.description}</small>
                  </span>
                  <div className="mini-bars">
                    {item.amplitudes.map((value, j) => (
                      <i key={j} style={{ height: `${5 + value * 20}px` }} />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
          {source === 'morse' && (
            <div className="morse-input">
              <label htmlFor="morse-word">
                Your message
                <input
                  id="morse-word"
                  value={word}
                  maxLength={3}
                  onChange={(e) => setWord(e.target.value.toUpperCase())}
                  placeholder="SOS"
                />
              </label>
              <p>Use 1–3 letters or digits. Pauses are included in the preview.</p>
            </div>
          )}
          {source === 'custom' && (
            <>
              <div className="frame-heading">
                <span>Duration (ms)</span>
                <span>Intensity (0–255)</span>
              </div>
              <div className="frame-list">
                {frames.map((frame, i) => (
                  <div className="frame-row" key={i}>
                    <input
                      aria-label={`Frame ${i + 1} duration`}
                      type="number"
                      min="1"
                      max="65535"
                      value={frame.durationMs}
                      onChange={(e) =>
                        setFrames(
                          frames.map((f, j) =>
                            i === j ? { ...f, durationMs: Number(e.target.value) } : f,
                          ),
                        )
                      }
                    />
                    <input
                      aria-label={`Frame ${i + 1} intensity`}
                      type="number"
                      min="0"
                      max="255"
                      value={frame.intensity}
                      onChange={(e) =>
                        setFrames(
                          frames.map((f, j) =>
                            i === j ? { ...f, intensity: Number(e.target.value) } : f,
                          ),
                        )
                      }
                    />
                    <button
                      className="icon-button"
                      aria-label={`Remove frame ${i + 1}`}
                      disabled={frames.length === 1}
                      onClick={() => setFrames(frames.filter((_, j) => j !== i))}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <Button
                className="secondary"
                disabled={frames.length >= 32}
                onClick={() => setFrames([...frames, { durationMs: 80, intensity: 190 }])}
              >
                <Plus size={16} /> Add frame
              </Button>
            </>
          )}
          {source !== 'custom' && (
            <>
              <label htmlFor="haptic-intensity" className="range-label">
                Intensity <strong>{intensity}%</strong>
              </label>
              <input
                id="haptic-intensity"
                type="range"
                min="0"
                max="100"
                value={intensity}
                onChange={(e) => setIntensity(Number(e.target.value))}
              />
            </>
          )}
        </Panel>
        <Panel title="Pattern preview" caption="Frame widths reflect their duration.">
          <div className={`pattern-preview ${busy ? 'playing' : ''}`}>
            {prepared.pattern?.frames.map((frame, i) => (
              <div
                key={i}
                style={{
                  flexGrow: frame.durationMs,
                  height: `${Math.max(3, (frame.intensity / 255) * 100)}%`,
                }}
                title={`${frame.durationMs} ms at ${frame.intensity}/255`}
              />
            ))}
          </div>
          <div className="preview-axis">
            <span>0 ms</span>
            <span>{duration.toLocaleString()} ms</span>
          </div>
          <div className="stats-row compact">
            <Stat label="Duration" value={`${(duration / 1000).toFixed(2)} s`} />
            <Stat label="Frames" value={`${prepared.pattern?.frames.length ?? 0} / 32`} />
          </div>
          <Button
            className="full-width"
            disabled={!available || busy || !prepared.pattern}
            onClick={() => void play()}
          >
            <Play size={17} />
            {busy
              ? `Playing${data.hapticPending ? '…' : ` · ${Math.max(0, (data.hapticBusyUntil - now) / 1000).toFixed(1)} s`}`
              : phase === 'demo'
                ? 'Preview pattern'
                : 'Play on device'}
          </Button>
          <p className="subtle">
            A new pattern can be sent after the current one finishes. Firmware does not provide a
            stop command.
          </p>
          <ErrorNote error={prepared.error ?? error} />
        </Panel>
      </div>
      <ExportNote page="haptic" />
    </>
  )
}
