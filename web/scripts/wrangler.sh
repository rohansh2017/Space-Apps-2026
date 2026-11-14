#!/bin/sh
# Run wrangler with the API token from the repo's .env, if there is one (otherwise `wrangler login` applies).
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && [ -f ../.env ]; then
  token=$(grep '^Cloudflare_Token_Value=' ../.env | cut -d= -f2-)
  [ -n "$token" ] && export CLOUDFLARE_API_TOKEN="$token"
fi
exec npx wrangler "$@"
