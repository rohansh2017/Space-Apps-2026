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
  regions: { half_width_m: number; files: Record<string, string> }
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
  orientation: Float32Array // hours x 4: ICRF -> MOON_ME quaternion (w, x, y, z)
  stars: Float32Array // count x 5: ICRF unit vector, V magnitude, B-V (NaN when unknown)
  starSource: string
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
  const [ephemeris, orientation, stars] = await Promise.all([
    concat(years.map((y) => eph.years[y].file), 7),
    concat(years.map((y) => eph.orientation.years[y].file), 4),
    get(starMeta.file).then(async (r) => new Float32Array(await r.arrayBuffer())),
  ])
  if (stars.length !== starMeta.count * 5) throw new Error('stars.bin size does not match stars.json')
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
    orientation,
    stars,
    starSource: starMeta.source,
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

/** Decode a 16-bit greyscale PNG written by horizonwalk.export.write_png16. */
export async function loadHeightmap(file: string, size: number): Promise<Uint16Array> {
  const bytes = new Uint8Array(await (await get(file)).arrayBuffer())
  const view = new DataView(bytes.buffer)
  const idat: Uint8Array[] = []
  for (let p = 8; p < bytes.length; ) {
    const len = view.getUint32(p)
    const type = String.fromCharCode(...bytes.subarray(p + 4, p + 8))
    if (type === 'IHDR' && (view.getUint32(p + 8) !== size || bytes[p + 16] !== 16 || bytes[p + 17] !== 0))
      throw new Error(`${file}: expected ${size} px 16-bit greyscale`)
    if (type === 'IDAT') idat.push(bytes.subarray(p + 8, p + 8 + len))
    p += 12 + len
  }
  const stream = new Blob(idat as BlobPart[]).stream().pipeThrough(new DecompressionStream('deflate'))
  const raw = new DataView(await new Response(stream).arrayBuffer())
  const stride = 1 + size * 2
  if (raw.byteLength !== stride * size) throw new Error(`${file}: unexpected pixel data size`)
  const out = new Uint16Array(size * size)
  for (let r = 0; r < size; r++) {
    // shortcut: only PNG filter 0 is handled (our writer emits nothing else); add unfiltering if another tool writes these
    if (raw.getUint8(r * stride) !== 0) throw new Error(`${file}: unsupported PNG filter`)
    for (let c = 0; c < size; c++) out[r * size + c] = raw.getUint16(r * stride + 1 + c * 2)
  }
  return out
}
