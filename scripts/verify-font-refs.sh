#!/usr/bin/env bash
# Every /fonts/ URL referenced by the built CSS must exist on disk, or the
# browser silently falls back mid-page. Run after `npm run build`. (#978)
set -euo pipefail
cat .next/static/css/*.css app/fonts/*.css \
  | grep -oE 'url\(/fonts/[^)]+\)' | sed 's|url(||; s|)||' | sort -u > /tmp/oikos-fontrefs.txt
echo "CSS 引用的唯一字型 URL 數: $(wc -l < /tmp/oikos-fontrefs.txt | tr -d ' ')"
echo "public/fonts 實際檔案數: $(find public/fonts -name '*.woff2' | wc -l | tr -d ' ')"
missing=0
while read -r u; do
  [ -f "public$u" ] || { echo "MISSING: $u"; missing=1; }
done < /tmp/oikos-fontrefs.txt
if [ "$missing" -eq 0 ]; then echo "OK: 每個被引用的字型檔都存在"; else echo "FAIL"; exit 1; fi
