// Sequential single-hue ramp for a dark surface: low values recede toward the panel, high values are light.
// Shared by the scenario matrix (F10) and the illumination map (F15) so one magnitude reads the same everywhere.
export const RAMP = ['#0d366b', '#104281', '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef', '#9ec5f4', '#b7d3f6', '#cde2fb']
export const colour = (v: number, max: number) => RAMP[Math.min(RAMP.length - 1, Math.max(0, Math.round((v / max) * (RAMP.length - 1))))]
