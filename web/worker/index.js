// Static assets are served before this runs. Gemini routes and the mission room are added in P4.
export default {
  fetch: (request, env) => env.ASSETS.fetch(request),
}
