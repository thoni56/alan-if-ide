#!/usr/bin/env bash
# Render every section of the guide and fail if a kbd: or menu: macro comes out as
# literal text. Asciidoctor does that silently when a file lacks :experimental:.
# Usage: check.sh [file.adoc ...], default all sections beside this script.
set -e
cd "$(dirname "$0")"
[ $# -gt 0 ] || set -- *.adoc
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
failed=0
for f in "$@"; do
    asciidoctor -s -o "$out/page.html" "$f"
    raw=$(grep -n -o -E '(kbd|menu):[^ <]*\[' "$out/page.html") || continue
    echo "$raw" | sed "s|^|$f: raw macro in output, line |"
    failed=1
done
exit $failed
