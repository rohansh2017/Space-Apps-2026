// Contract readers for web/public/data (see the root CLAUDE.md, "Data contracts").

export interface Site {
  id: string
  name: string
  lat: number
  lon: number
  coord_source: string
  approximate: boolean
  terrain: boolean
  mission: string
  agency: string
  blurb: string
  links: string[]
  heightmap: { file: string; offset_m: number; scale_m: number; size_px: number; span_m: number; res_m: number; source: string } | null
}

export interface Point {
  id: string
  region: string
  parent_site: string
  index: number
  lat: number
  lon: number
  x: number
  y: number
  elev_m: number
}

export interface ConstraintDef {
  id: string
  type: 'number' | 'boolean'
  unit: string | null
  min: number | null
  max: number | null
  default: number | boolean
}

export interface Tour {
  steps: { id: string; title: string; body: string }[]
  glossary: { term: string; definition: string }[]
}

/** 8-bit hillshade images in stereographic x/y axes (row 0 = +y, col 0 = -x), centred on the pole or a region centre. */
export interface Basemap {
  pole: { file: string; half_width_m: number }
  globe?: { file: string; projection: 'equirectangular'; lon0_deg: number; row0: 'north'; source: string } // whole Moon (D60)
  context?: { half_width_m: number; res_m: number; format: 'jpeg'; source: string; files: Record<string, string> } // +-32 km around each site (D62)
  regions: { half_width_m: number; files: Record<string, string> }
  relief?: Relief // the Moon view's elevation (D67)
}

/** A 16-bit elevation grid: metres above R = 1,737,400 m = offset_m + value x scale_m; its heights span offset_m to max_m. */
export interface ReliefFile {
  file: string
  offset_m: number
  scale_m: number
  max_m: number
}

/** Elevation for the Moon view's 3D relief, real-Sun shading and Topo layer (D67), in the same axes as the hillshades. */
export interface Relief {
  globe: ReliefFile & { width_px: number; source: string } // equirectangular, 2:1
  pole: ReliefFile & { half_width_m: number; size_px: number; source: string }
  cap?: ReliefFile & { half_width_m: number; size_px: number; source: string } // LOLA 75S polar DEM, wider than the pole grid (D71)
  context: { half_width_m: number; size_px: number; source: string; files: Record<string, ReliefFile> }
}

export const dataUrl = (file: string) => BASE + file

export interface Dataset {
  synthetic: boolean
  tour: Tour
  basemap: Basemap
  constraintDefs: ConstraintDef[]
  sites: Site[]
  points: Point[]
  centreIndex: number
  startMs: number // UTC time of ephemeris row 0
  hours: number
  ephemeris: Float32Array // hours x 7
  starSource: string
  /**
   * The star field's inputs for the hour given: the catalogue (once) and that hour's year of the orientation table
   * (about 140 KB a year, D61), fetched after the first frame. Each call resolves to a fresh `Sky` over the same table.
   */
  loadSky: (hour: number) => Promise<Sky>
}

export interface Sky {
  orientation: Float32Array // hours x 4: ICRF -> MOON_ME quaternion (w, x, y, z); only the loaded years are filled
  stars: Float32Array // count x 5: ICRF unit vector, V magnitude, B-V (NaN when unknown)
  covers: (hour: number) => boolean // that hour's year of the orientation table is loaded
}

const BASE = `${import.meta.env.BASE_URL}data/`

async function get(path: string): Promise<Response> {
  const r = await fetch(BASE + path)
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
  return r
}

export async function loadDataset(): Promise<Dataset> {
  const [sites, points, eph, schema, tour, basemap, starMeta] = await Promise.all(
    ['sites.json', 'points.json', 'ephemeris.json', 'constraints.schema.json', 'tour.json', 'basemap.json', 'stars.json'].map(async (f) => (await get(f)).json()),
  )
  if (eph.step_seconds !== 3600 || eph.fields.length !== 7) throw new Error('unexpected ephemeris layout')
  // Years are contiguous from start_utc, so the yearly files concatenate into one hourly table.
  const years = Object.keys(eph.years).sort()
  const hours = years.reduce((n, y) => n + eph.years[y].hours, 0)
  const concat = async (files: string[], stride: number) => {
    const parts = await Promise.all(files.map(async (f) => new Float32Array(await (await get(f)).arrayBuffer())))
    const out = new Float32Array(hours * stride)
    let offset = 0
    for (const p of parts) {
      out.set(p, offset)
      offset += p.length
    }
    if (offset !== out.length) throw new Error('hourly table size does not match ephemeris.json')
    return out
  }
  const ephemeris = await concat(years.map((y) => eph.years[y].file), 7)
  // the orientation table fills in a year at a time; failed loads are not cached, so they are retried
  const firstHour: number[] = []
  years.reduce((n, y) => (firstHour.push(n), n + eph.years[y].hours), 0)
  const yearOf = (hour: number) => {
    let i = 0
    while (i + 1 < years.length && firstHour[i + 1] <= hour) i++
    return i
  }
  const orientation = new Float32Array(hours * 4)
  const filled = new Set<number>()
  const yearLoads = new Map<number, Promise<void>>()
  let starLoad: Promise<Float32Array> | null = null
  const loadSky = async (hour: number): Promise<Sky> => {
    const i = yearOf(hour)
    starLoad ??= get(starMeta.file).then(async (r) => {
      const stars = new Float32Array(await r.arrayBuffer())
      if (stars.length !== starMeta.count * 5) throw new Error('stars.bin size does not match stars.json')
      return stars
    })
    starLoad.catch(() => { starLoad = null })
    let year = yearLoads.get(i)
    if (!year) {
      const meta = eph.orientation.years[years[i]]
      year = get(meta.file).then(async (r) => {
        const part = new Float32Array(await r.arrayBuffer())
        if (part.length !== eph.years[years[i]].hours * 4) throw new Error(`${meta.file}: unexpected size`)
        orientation.set(part, firstHour[i] * 4)
        filled.add(i)
      })
      year.catch(() => yearLoads.delete(i))
      yearLoads.set(i, year)
    }
    const [stars] = await Promise.all([starLoad, year])
    return { orientation, stars, covers: (h: number) => filled.has(yearOf(h)) }
  }
  return {
    synthetic: Boolean(sites.synthetic || points.synthetic || eph.synthetic || basemap.synthetic || starMeta.synthetic),
    tour,
    basemap,
    constraintDefs: schema.constraints,
    sites: sites.sites,
    points: points.points,
    centreIndex: points.grid.centre_index,
    startMs: Date.parse(eph.start_utc),
    hours,
    ephemeris,
    starSource: starMeta.source,
    loadSky,
  }
}

export interface Region {
  masks: Uint16Array // 360 per point, row = point index
  slopes: Uint8Array // degrees per point
  ridges: Int8Array // 360 x 3: horizon-crest normal x 127 in the site's east/north/up axes, seen from the site centre
}

const regions = new Map<string, Promise<Region>>()

/** Masks and slopes of one region. Loaded on demand, cached. */
export function loadRegion(region: string): Promise<Region> {
  let r = regions.get(region)
  if (!r) {
    r = Promise.all([get(`masks/${region}.bin`), get(`slopes/${region}.bin`), get(`ridges/${region}.bin`)]).then(async ([m, s, g]) => ({
      masks: new Uint16Array(await m.arrayBuffer()),
      slopes: new Uint8Array(await s.arrayBuffer()),
      ridges: new Int8Array(await g.arrayBuffer()),
    }))
    r.catch(() => regions.delete(region)) // a failed load is not cached, so "Try again" really retries
    regions.set(region, r)
  }
  return r
}

export interface SitePoint {
  mask: Uint16Array // 360 bins, the point's own horizon
  slopeDeg: number
}

const sitePoints = new Map<string, Promise<SitePoint>>()

/**
 * One grid point's horizon mask and slope without the rest of its region: a ranged request for the 720-byte mask row
 * (the Moon view's pins need each site's own point, not nine 317 KB regions). A server that ignores Range answers 200
 * with the whole file, and the row is cut from it. Cached; a failed load is not.
 */
export function loadSitePoint(region: string, index: number): Promise<SitePoint> {
  const key = `${region}:${index}`
  let p = sitePoints.get(key)
  if (!p) {
    const row = 360 * 2
    p = Promise.all([
      fetch(`${BASE}masks/${region}.bin`, { headers: { Range: `bytes=${index * row}-${(index + 1) * row - 1}` } }),
      get(`slopes/${region}.bin`),
    ]).then(async ([m, s]) => {
      if (!m.ok) throw new Error(`masks/${region}.bin: HTTP ${m.status}`)
      const bytes = await m.arrayBuffer()
      const mask = m.status === 206 && bytes.byteLength === row ? new Uint16Array(bytes) : new Uint16Array(bytes).subarray(index * 360, (index + 1) * 360)
      if (mask.length !== 360) throw new Error(`masks/${region}.bin: unexpected size`)
      return { mask, slopeDeg: new Uint8Array(await s.arrayBuffer())[index] }
    })
    p.catch(() => sitePoints.delete(key))
    sitePoints.set(key, p)
  }
  return p
}

const heightmaps = new Map<string, Promise<Uint16Array>>()

/** A 16-bit heightmap (a site's, or a relief grid), decoded once and shared by the ground view and the Moon view. A failed load is not cached. */
export function loadHeightmap(file: string, size: number, rows = size): Promise<Uint16Array> {
  let p = heightmaps.get(file)
  if (!p) {
    p = decodeHeightmap(file, size, rows)
    p.catch(() => heightmaps.delete(file))
    heightmaps.set(file, p)
  }
  return p
}

/** Decode a 16-bit greyscale PNG written by horizonwalk.export.write_png16. */
async function decodeHeightmap(file: string, size: number, rows: number): Promise<Uint16Array> {
  const bytes = new Uint8Array(await (await get(file)).arrayBuffer())
  const view = new DataView(bytes.buffer)
  const idat: Uint8Array[] = []
  for (let p = 8; p < bytes.length; ) {
    const len = view.getUint32(p)
    const type = String.fromCharCode(...bytes.subarray(p + 4, p + 8))
    if (type === 'IHDR' && (view.getUint32(p + 8) !== size || view.getUint32(p + 12) !== rows || bytes[p + 16] !== 16 || bytes[p + 17] !== 0))
      throw new Error(`${file}: expected ${size} x ${rows} px 16-bit greyscale`)
    if (type === 'IDAT') idat.push(bytes.subarray(p + 8, p + 8 + len))
    p += 12 + len
  }
  const stream = new Blob(idat as BlobPart[]).stream().pipeThrough(new DecompressionStream('deflate'))
  const raw = new DataView(await new Response(stream).arrayBuffer())
  const stride = 1 + size * 2
  if (raw.byteLength !== stride * rows) throw new Error(`${file}: unexpected pixel data size`)
  const out = new Uint16Array(size * rows)
  const bytes2 = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
  for (let r = 0; r < rows; r++) {
    // only PNG filters 0 (None) and 2 (Up) are handled: our writer emits nothing else (export.write_png16)
    const f = bytes2[r * stride]
    if (f === 2 && r > 0) for (let k = 1; k < stride; k++) bytes2[r * stride + k] = (bytes2[r * stride + k] + bytes2[(r - 1) * stride + k]) & 255
    else if (f !== 0 && f !== 2) throw new Error(`${file}: unsupported PNG filter`)
    for (let c = 0; c < size; c++) out[r * size + c] = raw.getUint16(r * stride + 1 + c * 2)
  }
  return out
}
