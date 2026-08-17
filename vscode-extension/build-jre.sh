#!/usr/bin/env bash
# Build the trimmed Java runtime that ships inside a platform-specific VSIX.
#
#   ./build-jre.sh                    # for this machine, using the JDK on PATH
#   ./build-jre.sh --jmods <dir>      # cross-build, using another platform's jmods
#
# Cross-building is how one CI runner produces runtimes for every target: jlink can
# link an image for a foreign platform as long as it is given that platform's jmods
# and the versions match.
#
# The output (jre/) is a build artifact: gitignored, but deliberately NOT in
# .vscodeignore, because it must ship inside the VSIX.
set -e
cd "$(dirname "$0")"

# From `jdeps --print-module-deps` on the shaded server jar, plus three that static
# analysis cannot see: java.logging and jdk.zipfs are reached reflectively, and
# jdk.crypto.ec is needed for TLS. Verified by running the real LSP request set
# against the linked image -- if you trim this, re-run that check.
MODULES=java.base,java.compiler,java.desktop,java.management,java.naming,java.sql,jdk.unsupported,java.logging,jdk.zipfs,jdk.crypto.ec

JMODS=""
if [ "$1" = "--jmods" ]; then
  if [ -z "$2" ]; then
    echo "!! --jmods needs a directory" >&2
    exit 1
  fi
  JMODS="--module-path $2"
  echo ">> cross-linking from jmods at $2"
fi

if ! command -v jlink >/dev/null 2>&1; then
  echo "!! jlink not found. It ships with the JDK (not the JRE); install a JDK 21+." >&2
  exit 1
fi

rm -rf jre
jlink $JMODS \
  --add-modules "$MODULES" \
  --strip-debug \
  --no-header-files \
  --no-man-pages \
  --compress=zip-6 \
  --output jre

echo ">> built jre/ ($(du -sh jre | cut -f1))"
./jre/bin/java -version
