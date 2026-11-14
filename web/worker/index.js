// Data files under /data/ come from the R2 bucket (same paths as web/public/data); the copy bundled
// with the static assets is the fallback. /room/{id} is the mission room WebSocket (F24).
// /api/constraints turns a typed sentence into constraint JSON through Gemini (F21).
// Everything else is a static asset.
import { constraintsFromSentence } from './gemini.js'

export { MissionRoom } from './room.js'

const TYPES = { json: 'application/json', bin: 'application/octet-stream', png: 'image/png' }
const ROOM_ID = /^[a-z0-9][a-z0-9-]{2,39}$/

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (pathname === '/api/constraints') return constraintsFromSentence(request, env)
    if (pathname.startsWith('/room/')) {
      const id = pathname.slice('/room/'.length)
      if (!ROOM_ID.test(id)) return new Response('Room ids are 3 to 40 lower-case letters, digits or dashes', { status: 400 })
      return env.ROOM.getByName(id).fetch(request)
    }
    const key = pathname.startsWith('/data/') ? pathname.slice('/data/'.length) : ''
    // the bucket also holds the raw DEMs under raw/, which are never served
    if (key && !key.startsWith('raw/') && (request.method === 'GET' || request.method === 'HEAD')) {
      const object = await env.DATA.get(key).catch(() => null)
      if (object) {
        return new Response(request.method === 'HEAD' ? null : object.body, {
          headers: {
            'content-type': TYPES[key.split('.').pop()] ?? 'application/octet-stream',
            'content-length': String(object.size),
            etag: object.httpEtag,
            'cache-control': 'public, max-age=300',
            'x-data-source': 'r2',
          },
        })
      }
    }
    const response = await env.ASSETS.fetch(request)
    if (!key) return response
    const fallback = new Response(response.body, response)
    fallback.headers.set('x-data-source', 'assets')
    return fallback
  },
}
