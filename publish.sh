#!/usr/bin/env bash
# Publish a release's VSIXes to Open VSX.
#
#   export OVSX_PAT=...        # never pass -p: it would land in shell history
#   ./publish.sh               # the version in vscode-extension/package.json
#   ./publish.sh 0.5.0         # or an explicit one
#
# Safe to re-run: anything already on the registry is reported as such and
# skipped, so a partial publish can be finished by running this again.
set -u
cd "$(dirname "$0")/vscode-extension" || exit 1

if [ -z "${OVSX_PAT:-}" ]; then
  echo "!! OVSX_PAT is not set. Export it first; do not pass the token on the command line." >&2
  exit 1
fi

VERSION="${1:-$(node -p "require('./package.json').version")}"
UNIVERSAL="alan-if-ide-$VERSION.vsix"

# Platform builds first, universal last: if this dies partway, the targeted builds
# are the ones authors actually install.
shopt -s nullglob
FILES=(alan-if-ide-*-"$VERSION".vsix)
FILES+=("$UNIVERSAL")
shopt -u nullglob

# Fetch anything missing rather than failing on it -- the release is the source of
# truth for what should be published.
missing=0
for f in "${FILES[@]}"; do [ -f "$f" ] || missing=1; done
if [ "$missing" = 1 ]; then
  echo ">> fetching v$VERSION artifacts from the GitHub release"
  gh release download "v$VERSION" --pattern '*.vsix' --clobber || {
    echo "!! could not download the v$VERSION artifacts" >&2; exit 1; }
  shopt -s nullglob
  FILES=(alan-if-ide-*-"$VERSION".vsix); FILES+=("$UNIVERSAL")
  shopt -u nullglob
fi

published=(); skipped=(); pending=(); failed=()

for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "!! missing $f"; failed+=("$f (not found)"); continue
  fi

  # Open VSX has been flaky (four outages in a fortnight around 0.4.0), so retry --
  # but only on errors that retrying can actually fix. "Already published" is
  # terminal, and retrying it just burns two minutes per file.
  for attempt in 1 2 3 4 5 6; do
    echo ">> $f (attempt $attempt)"
    out=$(npx ovsx publish "$f" 2>&1); status=$?
    echo "$out" | sed 's/^/   /'

    if [ $status -eq 0 ]; then
      published+=("$f"); break
    fi
    # "already published, but currently isn't active" means the upload landed and
    # Open VSX has held it -- /user-settings/extensions shows these as "Under
    # review". Normal, and nothing a publisher can do but wait, but NOT the same as
    # being live. Terminal for this run either way; retrying cannot help.
    if echo "$out" | grep -qiE "isn't active|is not active"; then
      echo "   (uploaded; held by the registry for review)"
      pending+=("$f"); break
    fi
    if echo "$out" | grep -qiE "already (published|exists)"; then
      echo "   (already live on the registry -- skipping)"
      skipped+=("$f"); break
    fi
    if [ $attempt -eq 6 ]; then
      failed+=("$f"); break
    fi
    delay=$((attempt * 20))
    echo "   retrying in ${delay}s"
    sleep $delay
  done
done

# A silent failure on the LAST file is exactly how 0.5.0 shipped without its
# universal build, so always say what happened to every one of them.
echo
echo "=============== v$VERSION ==============="
printf '  published : %s\n' "${#published[@]}"; for f in "${published[@]:-}"; do [ -n "$f" ] && echo "      $f"; done
printf '  skipped   : %s\n' "${#skipped[@]}";   for f in "${skipped[@]:-}";   do [ -n "$f" ] && echo "      $f"; done
printf '  pending   : %s\n' "${#pending[@]}";   for f in "${pending[@]:-}";   do [ -n "$f" ] && echo "      $f"; done
printf '  FAILED    : %s\n' "${#failed[@]}";    for f in "${failed[@]:-}";    do [ -n "$f" ] && echo "      $f"; done
echo "========================================"

if [ "${#pending[@]}" -gt 0 ]; then
  echo "Some uploads are under review by Open VSX -- see the status at"
  echo "  https://open-vsx.org/user-settings/extensions"
  echo "Or check whether one has gone live:"
  echo "  curl -s -o /dev/null -w '%{http_code}\n' \\"
  echo "    https://open-vsx.org/api/alanif/alan-if-ide/universal/$VERSION"
  echo "200 means live; 404 means still not activated."
fi

[ "${#failed[@]}" -eq 0 ] || exit 1
