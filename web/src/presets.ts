import type { ConstraintDef } from './data'
import type { Constraints } from './engine/engine'

export const defaults = (defs: ConstraintDef[]): Constraints => Object.fromEntries(defs.map((d) => [d.id, d.default]))

// Editable placeholders, not NASA requirements. "Static lander" is the spec's default set.
export const PRESETS: Record<string, Record<string, number | boolean>> = {
  'Static lander': {},
  Rover: { mission_duration_days: 14, min_continuous_sun_days: 10, max_continuous_dark_hours: 48, min_earth_visible_pct: 50, max_slope_deg: 15 },
  'Short CLPS': { mission_duration_days: 4, min_continuous_sun_days: 3, max_continuous_dark_hours: 24, min_earth_visible_pct: 30 },
}

export const LABELS: Record<string, { name: string; chip: string }> = {
  mission_duration_days: { name: 'Mission duration', chip: '' },
  min_continuous_sun_days: { name: 'Min continuous sunlight', chip: 'Sun' },
  max_continuous_dark_hours: { name: 'Max continuous darkness', chip: 'Dark' },
  min_earth_visible_pct: { name: 'Min Earth visibility', chip: 'Earth' },
  min_earth_elevation_deg: { name: 'Min Earth elevation above terrain', chip: '' },
  landing_sun_and_earth_visible: { name: 'Sun and Earth visible at touchdown', chip: 'Landing' },
  max_slope_deg: { name: 'Max terrain slope', chip: 'Slope' },
  slip_range_days: { name: 'Slip range (later by up to)', chip: '' },
  search_radius_km: { name: 'Search radius', chip: '' },
}
