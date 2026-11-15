// Sequential single-hue ramps for a dark surface, one per subject, so a colour always means the same thing:
// gold = sunlight, blue = Earth, regolith grey = everything else. Low values recede toward the ground, high are light.
// Used by the scenario matrix (F10) and the illumination map (F15).

const mix = (a: string, b: string, steps: number): string[] => {
  const [p, q] = [a, b].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)))
  return Array.from({ length: steps }, (_, k) => {
    const t = k / (steps - 1)
    return `#${p.map((v, i) => Math.round(v + (q[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
  })
}

export const SUN_RAMP = mix('#2a1f0c', '#f8dc9c', 13)
export const EARTH_RAMP = ['#0d366b', '#104281', '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef', '#9ec5f4', '#b7d3f6', '#cde2fb']
export const REGOLITH_RAMP = mix('#1c1b1a', '#e3ded5', 13)

export const colour = (v: number, max: number, ramp: string[] = SUN_RAMP) =>
  ramp[Math.min(ramp.length - 1, Math.max(0, Math.round((v / max) * (ramp.length - 1))))]
