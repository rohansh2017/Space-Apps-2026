#!/bin/sh
# Upload web/public/data to the R2 bucket under the same relative paths (the data contract's paths).
# Run from web/. Files whose size and MD5 already match the bucket are skipped via a local stamp file.
set -eu
bucket=tranquility-base-data
stamp=.wrangler/r2-uploaded
mkdir -p .wrangler && touch "$stamp"
cd public/data
find . -type f ! -name '.*' | sed 's|^\./||' | sort | while read -r f; do
  sum="$(md5 -q "$f" 2>/dev/null || md5sum "$f" | cut -d' ' -f1) $f"
  if grep -qxF "$sum" "../../$stamp"; then continue; fi
  (cd ../.. && sh scripts/wrangler.sh r2 object put "$bucket/$f" --file "public/data/$f" --remote >/dev/null)
  grep -vF " $f" "../../$stamp" > "../../$stamp.tmp" || true
  echo "$sum" >> "../../$stamp.tmp" && mv "../../$stamp.tmp" "../../$stamp"
  echo "uploaded $f"
done
echo "R2 data is up to date"
