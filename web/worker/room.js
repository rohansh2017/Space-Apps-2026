// F24 mission room: one Durable Object per room id holds the latest shared state (site, point, UTC
// time, constraints) and relays changes to every connected browser over WebSockets. It computes
// nothing; every client runs the engine locally. Message shape: CLAUDE.md, "Room message".
import { DurableObject } from 'cloudflare:workers'

const MAX_BYTES = 4096

export class MissionRoom extends DurableObject {
  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket upgrade', { status: 426 })
    const [client, server] = Object.values(new WebSocketPair())
    this.ctx.acceptWebSocket(server) // hibernation API: the object can sleep between messages
    const latest = await this.ctx.storage.get('state')
    if (latest) server.send(JSON.stringify(latest)) // late joiners get the latest copy
    this.presence()
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > MAX_BYTES) return
    let msg
    try {
      msg = JSON.parse(message)
    } catch {
      return
    }
    // shape check only; the browsers validate values against the constraint schema
    if (msg?.type !== 'state' || typeof msg.site_id !== 'string' || typeof msg.utc !== 'string'
      || typeof msg.constraints !== 'object' || msg.constraints === null || typeof msg.sender !== 'string') return
    await this.ctx.storage.put('state', msg)
    this.broadcast(JSON.stringify(msg), ws)
  }

  webSocketClose(ws, code, reason) {
    this.presence(ws)
    try {
      ws.close(code, reason)
    } catch {
      // a browser close without a status arrives as 1005, which close() rejects; the runtime finishes the handshake itself
    }
  }

  webSocketError(ws) {
    this.presence(ws)
  }

  presence(leaving) {
    const count = this.ctx.getWebSockets().filter((w) => w !== leaving).length
    this.broadcast(JSON.stringify({ type: 'presence', count }), leaving)
  }

  broadcast(text, except) {
    for (const w of this.ctx.getWebSockets()) {
      if (w === except) continue
      try {
        w.send(text)
      } catch {
        // a socket that is closing; its close event follows
      }
    }
  }
}
