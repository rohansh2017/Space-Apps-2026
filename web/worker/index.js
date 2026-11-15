// Data files under /data/ come from the R2 bucket (same paths as web/public/data); the copy bundled
// with the static assets is the fallback. /room/{id} is the mission room WebSocket (F24).
// /api/constraints turns a typed sentence into constraint JSON through Gemini (F21); /api/describe puts horizon facts into words (F22);
// /api/copilot turns a slip scenario into a plan for the finder (F26); /api/whynot rephrases why a plan fails (F27).
// Everything else is a static asset.
import { describeHorizon } from './describe.js'
import { planSlip } from './copilot.js'
import { constraintsFromSentence } from './gemini.js'
import { explainWhyNot } from './whynot.js'

export { MissionRoom } from './room.js'

const TYPES = { json: 'application/json', bin: 'application/octet-stream', png: 'image/png', jpg: 'image/jpeg' }
const ROOM_ID = /^[a-z0-9][a-z0-9-]{2,39}$/

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (pathname === '/api/constraints') return constraintsFromSentence(request, env)
    if (pathname === '/api/describe') return describeHorizon(request, env)
    if (pathname === '/api/copilot') return planSlip(request, env)
    if (pathname === '/api/whynot') return explainWhyNot(request, env)
    if (pathname.startsWith('/room/')) {
      const id = pathname.slice('/room/'.length)
      if (!ROOM_ID.test(id)) return new Response('Room ids are 3 to 40 lower-case letters, digits or dashes', { status: 400 })
      return env.ROOM.getByName(id).fetch(request)
    }
    const key = pathname.startsWith('/data/') ? pathname.slice('/data/'.length) : ''
    // the bucket also holds the raw DEMs under raw/, which are never served
    if (key && !key.startsWith('raw/') && (request.method === 'GET' || request.method === 'HEAD')) {
      // a Range request gets just that part (the Moon view reads one 720-byte mask row per site, not nine whole regions)
      const ranged = request.headers.has('range')
      const object = await env.DATA.get(key, ranged ? { range: request.headers } : undefined).catch(() => null)
      if (object) {
        const part = ranged && object.range && typeof object.range.offset === 'number' ? object.range : null
        const length = part ? (part.length ?? object.size - part.offset) : object.size
        const headers = {
          'content-type': TYPES[key.split('.').pop()] ?? 'application/octet-stream',
          'content-length': String(length),
          'accept-ranges': 'bytes',
          etag: object.httpEtag,
          'cache-control': 'public, max-age=300',
          'x-data-source': 'r2',
        }
        if (part) headers['content-range'] = `bytes ${part.offset}-${part.offset + length - 1}/${object.size}`
        return new Response(request.method === 'HEAD' ? null : object.body, { status: part ? 206 : 200, headers })
      }
    }
    const response = await env.ASSETS.fetch(request)
    if (!key) return response
    const fallback = new Response(response.body, response)
    fallback.headers.set('x-data-source', 'assets')
    return fallback
  },
}
