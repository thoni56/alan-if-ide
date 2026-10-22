#!/usr/bin/env bash
# Render every section of the guide and fail if a kbd: or menu: macro comes out as
# literal text. Asciidoctor does that silently when a file lacks :experimental:.
# Also fail on any `alanif.*` name that is not a setting or command in package.json,
# and unless guide.adoc includes every chapter, and only chapters that exist,
# and unless every image the guide uses is made by a shot, and every shot is used.
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
known=$(node -p 'const c = require("../../vscode-extension/package.json").contributes;
    [...Object.keys(c.configuration.properties), ...c.commands.map(x => x.command)].join("\n")')
for f in "$@"; do
    for name in $(grep -o -E '`alanif\.[A-Za-z.]+`' "$f" | tr -d '`' | sort -u); do
        grep -qx "$name" <<<"$known" && continue
        echo "$f: $name is not a setting or command of the extension"
        failed=1
    done
done
master=guide.adoc
if [ ! -f $master ]; then
    echo "$master: missing"
    failed=1
else
    included=$(sed -n -E 's/^include::([^[]+)\[.*/\1/p' $master)
    for f in $included; do
        [ -f "$f" ] || { echo "$master: includes $f, which does not exist"; failed=1; }
    done
    for f in *.adoc; do
        [ "$f" = $master ] && continue
        grep -qx "$f" <<<"$included" || { echo "$master: does not include $f"; failed=1; }
    done
fi
shots=$(node -p 'require("./screenshots/shots").map(s => s.name + ".png").join("\n")' 2>/dev/null) || shots=
used=$(grep -h -o -E 'image::[^[]+\[' *.adoc | sed -E 's/^image::(.*)\[$/\1/' | sort -u)
for png in $used; do
    grep -qx "$png" <<<"$shots" || { echo "$png: used in the guide, but no shot in screenshots/shots.js makes it"; failed=1; }
    [ -f "images/$png" ] || { echo "$png: not in images/, run make screenshots"; failed=1; }
done
for png in $shots; do
    grep -qx "$png" <<<"$used" || { echo "$png: made by a shot, but the guide does not use it"; failed=1; }
done
exit $failed
