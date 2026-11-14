#!/bin/sh
# Run wrangler with an API token from the repo's .env, if there is one (otherwise `wrangler login` applies).
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && [ -f ../.env ]; then
  for name in CLOUDFLARE_ACCOUNT_API_TOKEN Cloudflare_Token_Value; do
    token=$(grep "^$name=" ../.env | head -1 | cut -d= -f2- | tr -d ' "')
    [ -n "$token" ] && export CLOUDFLARE_API_TOKEN="$token" && break
  done
fi
exec npx wrangler "$@"
