// Data files under /data/ come from the R2 bucket (same paths as web/public/data); the copy bundled
// with the static assets is the fallback. Everything else is a static asset.
// Gemini routes and the mission room are added in P4.
const TYPES = { json: 'application/json', bin: 'application/octet-stream', png: 'image/png' }

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
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
