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
  heightmap: { file: string; offset_m: number; scale_m: number; size_px: number; span_m: number } | null
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
}

const BASE = `${import.meta.env.BASE_URL}data/`

async function get(path: string): Promise<Response> {
  const r = await fetch(BASE + path)
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
  return r
}

export async function loadDataset(): Promise<Dataset> {
  const [sites, points, eph, schema, tour, basemap] = await Promise.all(
    ['sites.json', 'points.json', 'ephemeris.json', 'constraints.schema.json', 'tour.json', 'basemap.json'].map(async (f) => (await get(f)).json()),
  )
  if (eph.step_seconds !== 3600 || eph.fields.length !== 7) throw new Error('unexpected ephemeris layout')
  // Years are contiguous from start_utc, so the yearly files concatenate into one hourly table.
  const years = Object.keys(eph.years).sort()
  const parts = await Promise.all(
    years.map(async (y) => new Float32Array(await (await get(eph.years[y].file)).arrayBuffer())),
  )
  const hours = years.reduce((n, y) => n + eph.years[y].hours, 0)
  const ephemeris = new Float32Array(hours * 7)
  let offset = 0
  for (const p of parts) {
    ephemeris.set(p, offset)
    offset += p.length
  }
  if (offset !== ephemeris.length) throw new Error('ephemeris size does not match ephemeris.json')
  return {
    synthetic: Boolean(sites.synthetic || points.synthetic || eph.synthetic || basemap.synthetic),
    tour,
    basemap,
    constraintDefs: schema.constraints,
    sites: sites.sites,
    points: points.points,
    centreIndex: points.grid.centre_index,
    startMs: Date.parse(eph.start_utc),
    hours,
    ephemeris,
  }
}

export interface Region {
  masks: Uint16Array // 360 per point, row = point index
  slopes: Uint8Array // degrees per point
}

const regions = new Map<string, Promise<Region>>()

/** Masks and slopes of one region. Loaded on demand, cached. */
export function loadRegion(region: string): Promise<Region> {
  let r = regions.get(region)
  if (!r) {
    r = Promise.all([get(`masks/${region}.bin`), get(`slopes/${region}.bin`)]).then(async ([m, s]) => ({
      masks: new Uint16Array(await m.arrayBuffer()),
      slopes: new Uint8Array(await s.arrayBuffer()),
    }))
    regions.set(region, r)
  }
  return r
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
