#!/usr/bin/env bash
# Lahore Coffee Club — assemble src/ into one self-contained index.html.
#
#   ./build.sh            build once
#   ./build.sh --watch    rebuild whenever a file in src/ changes
#
# The template's <!-- @styles --> and <!-- @scripts --> markers are
# replaced with the files below, in order. Add new files to these lists.
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
  app-plan.js
  app-club.js
  app-welcome.js
  landing.js
)

build() {
  for f in "${CSS_FILES[@]}" "${JS_FILES[@]}"; do
    [[ -f "$SRC/$f" ]] || { echo "build: missing $SRC/$f" >&2; return 1; }
  done

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
  fi

  local tmp
  tmp="$(mktemp "${TMPDIR:-/tmp}/lcc-build.XXXXXX")"
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      *"<!-- @styles -->"*)
        echo "<style>"
        for f in "${CSS_FILES[@]}"; do echo "/* ---- $SRC/$f ---- */"; cat "$SRC/$f"; echo; done
        echo "</style>"
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
