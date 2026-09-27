import { HapticFrame, HapticPattern, HAPTIC_MAX_FRAMES } from 'senswear-web-bluetooth'

export const PRESETS = [
  { name: 'Strong pulse', description: 'A clear, single tap', amplitudes: [1, 1] },
  { name: 'Soft pulse', description: 'A gentle nudge', amplitudes: [0.55, 0.55, 0.55] },
  {
    name: 'Ramp up',
    description: 'Gradually build intensity',
    amplitudes: [0.12, 0.2, 0.32, 0.46, 0.58, 0.72, 0.86, 1],
  },
  {
    name: 'Heartbeat',
    description: 'A familiar two-beat rhythm',
    amplitudes: [0.68, 0.68, 0, 0, 0.92, 0.92, 0.42, 0],
  },
  {
    name: 'Buzz alert',
    description: 'Three attention-getting pulses',
    amplitudes: [0.56, 0.56, 0, 0.56, 0.56, 0, 0.56, 0.56],
  },
] as const

export function buildPattern(amplitudes: readonly number[], intensity: number): HapticPattern {
  if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1)
    throw new RangeError('Intensity must be between 0 and 1.')
  const frames: HapticFrame[] = []
  for (const amplitude of amplitudes) {
    const value = Math.round(Math.max(0, Math.min(1, amplitude)) * intensity * 255)
    const last = frames.at(-1)
    if (last?.intensity === value && last.durationMs <= 65535 - 80)
      frames[frames.length - 1] = new HapticFrame(last.durationMs + 80, value)
    else frames.push(new HapticFrame(80, value))
  }
  if (frames.length > HAPTIC_MAX_FRAMES)
    throw new RangeError(`Patterns support up to ${HAPTIC_MAX_FRAMES} frames.`)
  return new HapticPattern(frames)
}

const MORSE: Record<string, string> = {
  A: '.-',
  B: '-...',
  C: '-.-.',
  D: '-..',
  E: '.',
  F: '..-.',
  G: '--.',
  H: '....',
  I: '..',
  J: '.---',
  K: '-.-',
  L: '.-..',
  M: '--',
  N: '-.',
  O: '---',
  P: '.--.',
  Q: '--.-',
  R: '.-.',
  S: '...',
  T: '-',
  U: '..-',
  V: '...-',
  W: '.--',
  X: '-..-',
  Y: '-.--',
  Z: '--..',
  '0': '-----',
  '1': '.----',
  '2': '..---',
  '3': '...--',
  '4': '....-',
  '5': '.....',
  '6': '-....',
  '7': '--...',
  '8': '---..',
  '9': '----.',
}
export function morseAmplitudes(word: string): number[] {
  if (!/^[A-Za-z0-9]{1,3}$/.test(word)) throw new RangeError('Enter 1–3 letters or digits.')
  return [...word.toUpperCase()].flatMap((letter, i) => [
    ...(i ? [0, 0, 0] : []),
    ...[...MORSE[letter]].flatMap((symbol, j) => [
      ...(j ? [0] : []),
      ...Array<number>(symbol === '.' ? 1 : 3).fill(1),
    ]),
  ])
}
