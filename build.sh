#!/usr/bin/env bash
# Lahore Coffee Club — assemble src/ into one self-contained index.html.
#
#   ./build.sh            build once
#   ./build.sh --watch    rebuild whenever a file in src/ changes
#
# The template's markers are replaced, so index.html stays one
# self-contained file:
#   <!-- @favicon -->  src/logos/favicon-32.png as a data URI
#   <!-- @styles -->   the CSS files below, with src/fonts/*.woff2 inlined
#                      as base64 wherever a stylesheet says url("fonts/…")
#   <!-- @logos -->    the logo SVGs below as hidden <template>s (ui.logo)
#   <!-- @scripts -->  the JS files below, in order
# Add new files to these lists.
#
# PWA files can't be inlined (the phone fetches them as real files), so
# they are copied next to index.html with relative paths:
#   src/manifest.json -> manifest.json, src/sw.js -> sw.js,
#   src/manifest-cafe.json -> manifest-cafe.json, the icons below -> icons/
# cafe.html is the same built page as the "LCC Cafés" app: its own
# manifest and titles, and it opens on #/cafe when no route is given.
set -euo pipefail
cd "$(dirname "$0")"

SRC="src"
OUT="index.html"
TEMPLATE="$SRC/index.template.html"

CSS_FILES=(
  base.css
  cafe.css
  app.css
  club.css
  landing.css
)

# Inlined as <template id="logo-NAME">; colours come from --logo-* in CSS
LOGO_FILES=(
  wordmark.svg
  monogram-horizontal.svg
  ring.svg
  app-icon-mark.svg
)
FONT_FILES=(
  GlacialIndifference-Regular.woff2
  GlacialIndifference-Bold.woff2
)
FAVICON="$SRC/logos/favicon-32.png"

# Copied as real files for the installable app (PWA)
PWA_FILES=(manifest.json manifest-cafe.json sw.js)
ICON_FILES=(
  app-icon-192.png
  app-icon-512.png
  app-icon-maskable-512.png
  apple-touch-icon-180.png
)

# Order matters: data -> state -> ui -> router -> surfaces
JS_FILES=(
  data.js
  state.js
  ui.js
  router.js
  sync.js
  kit.js
  cafe.js
  app.js
  app-cafes.js
  app-brand.js
  app-plan.js
  app-club.js
  app-welcome.js
  landing.js
)

b64() { base64 < "$1" | tr -d '\n'; }

# Print a stylesheet with url("fonts/X.woff2") replaced by a base64 data URI
FONT_SED=()
inline_fonts() {
  if [[ ${#FONT_SED[@]} -eq 0 ]]; then
    local f
    for f in "${FONT_FILES[@]}"; do FONT_SED+=(-e "s|url(\"fonts/$f\")|url(\"data:font/woff2;base64,$(b64 "$SRC/fonts/$f")\")|g"); done
  fi
  sed "${FONT_SED[@]}" "$1"
}

build() {
  for f in "${CSS_FILES[@]}" "${JS_FILES[@]}"; do
    [[ -f "$SRC/$f" ]] || { echo "build: missing $SRC/$f" >&2; return 1; }
  done
  for f in "${LOGO_FILES[@]}"; do [[ -f "$SRC/logos/$f" ]] || { echo "build: missing $SRC/logos/$f" >&2; return 1; }; done
  for f in "${FONT_FILES[@]}"; do [[ -f "$SRC/fonts/$f" ]] || { echo "build: missing $SRC/fonts/$f" >&2; return 1; }; done
  [[ -f "$FAVICON" ]] || { echo "build: missing $FAVICON" >&2; return 1; }
  for f in "${PWA_FILES[@]}"; do [[ -f "$SRC/$f" ]] || { echo "build: missing $SRC/$f" >&2; return 1; }; done
  for f in "${ICON_FILES[@]}"; do [[ -f "$SRC/logos/$f" ]] || { echo "build: missing $SRC/logos/$f" >&2; return 1; }; done

  # A literal </script> or </style> inside a source file would end the tag early
  if grep -l -i '</script' "${JS_FILES[@]/#/$SRC/}" >/dev/null 2>&1; then
    echo "build: a JS file contains '</script'; split it as '<\\/script'" >&2; return 1
  fi
  if grep -l -i '</style' "${CSS_FILES[@]/#/$SRC/}" >/dev/null 2>&1; then
    echo "build: a CSS file contains '</style'" >&2; return 1
  fi

  # Syntax-check scripts when Node is available
  if command -v node >/dev/null 2>&1; then
    for f in "${JS_FILES[@]}"; do node --check "$SRC/$f" || return 1; done
    node --check "$SRC/sw.js" || return 1
  fi

  local tmp
  tmp="$(mktemp "${TMPDIR:-/tmp}/lcc-build.XXXXXX")"
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      *"<!-- @favicon -->"*)
        echo "  <link rel=\"icon\" type=\"image/png\" sizes=\"32x32\" href=\"data:image/png;base64,$(b64 "$FAVICON")\">"
        ;;
      *"<!-- @styles -->"*)
        echo "<style>"
        for f in "${CSS_FILES[@]}"; do echo "/* ---- $SRC/$f ---- */"; inline_fonts "$SRC/$f"; echo; done
        echo "</style>"
        ;;
      *"<!-- @logos -->"*)
        echo "<div id=\"lcc-logos\" hidden>"
        for f in "${LOGO_FILES[@]}"; do
          echo "<template id=\"logo-${f%.svg}\">"; cat "$SRC/logos/$f"; echo; echo "</template>"
        done
        echo "</div>"
        ;;
      *"<!-- @scripts -->"*)
        for f in "${JS_FILES[@]}"; do
          echo "<script>"; echo "/* ---- $SRC/$f ---- */"; cat "$SRC/$f"; echo; echo "</script>"
        done
        ;;
      *) printf '%s\n' "$line" ;;
    esac
  done < "$TEMPLATE" > "$tmp"
  mv "$tmp" "$OUT"

  # cafe.html: the café app. Same page, its own manifest, titles and start route.
  # The route line goes first in <head>, before any script reads the hash.
  local cafe_tmp
  cafe_tmp="$(mktemp "${TMPDIR:-/tmp}/lcc-cafe.XXXXXX")"
  sed \
    -e 's|<link rel="manifest" href="manifest.json">|<link rel="manifest" href="manifest-cafe.json">|' \
    -e 's|<meta name="apple-mobile-web-app-title" content="LCC">|<meta name="apple-mobile-web-app-title" content="LCC Cafés">|' \
    -e 's|<title>Lahore Coffee Club</title>|<title>LCC Cafés</title>|' \
    -e 's|<meta charset="utf-8">|<meta charset="utf-8">\
  <script>if (!location.hash \|\| location.hash === "#") history.replaceState(null, "", location.pathname + location.search + "#/cafe");</script>|' \
    "$OUT" > "$cafe_tmp"
  for want in 'href="manifest-cafe.json"' 'content="LCC Cafés"' '<title>LCC Cafés</title>' '"#/cafe");</script>'; do
    grep -qF "$want" "$cafe_tmp" || { echo "build: cafe.html is missing $want (did the template change?)" >&2; rm -f "$cafe_tmp"; return 1; }
  done
  mv "$cafe_tmp" cafe.html

  # PWA files next to index.html (relative paths, so a subfolder works too)
  for f in "${PWA_FILES[@]}"; do cp "$SRC/$f" "$f"; done
  mkdir -p icons
  for f in "${ICON_FILES[@]}"; do cp "$SRC/logos/$f" "icons/$f"; done

  local size
  size=$(wc -c < "$OUT" | tr -d ' ')
  echo "build: wrote $OUT ($(( size / 1024 )) KB) at $(date +%H:%M:%S)"
}

build

if [[ "${1:-}" == "--watch" ]]; then
  echo "build: watching $SRC/ (Ctrl+C to stop)"
  stamp() { find "$SRC" -type f -exec stat -f '%m %N' {} + 2>/dev/null || find "$SRC" -type f -exec stat -c '%Y %n' {} +; }
  last="$(stamp)"
  while sleep 1; do
    now="$(stamp)"
    if [[ "$now" != "$last" ]]; then last="$now"; build || true; fi
  done
fi
