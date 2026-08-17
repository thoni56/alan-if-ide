#!/usr/bin/env bash
# Build the trimmed Java runtime that ships inside a platform-specific VSIX.
#
#   ./build-jre.sh                    # for this machine, using the JDK on PATH
#   ./build-jre.sh --jmods <dir>      # cross-build, using another platform's jmods
#
# Cross-building is how one CI runner produces runtimes for every target: jlink can
# link an image for a foreign platform as long as it is given that platform's jmods.
# A patch-level difference between the host jlink and the target jmods is fine
# (verified 21.0.11 linking 21.0.12).
#
# Note --strip-java-debug-attributes rather than --strip-debug: the latter also strips
# NATIVE debug symbols, which it does by shelling out to the host's objcopy. That
# cannot read a foreign binary format, so cross-builds emit "file format not
# recognized" errors -- and jlink still exits 0, so the failure is easy to miss. The
# native stripping saved nothing measurable anyway (51 MB either way).
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
  --strip-java-debug-attributes \
  --no-header-files \
  --no-man-pages \
  --compress=zip-6 \
  --output jre

echo ">> built jre/ ($(du -sh jre | cut -f1))"

if [ -n "$JMODS" ]; then
  # A cross-built image cannot be run here. jlink's release file records only
  # JAVA_VERSION and MODULES -- no OS/arch -- so prove the target from the launcher's
  # actual binary format instead, and fail if it was not produced at all.
  LAUNCHER=jre/bin/java
  [ -f jre/bin/java.exe ] && LAUNCHER=jre/bin/java.exe
  if [ ! -s "$LAUNCHER" ]; then
    echo "!! no launcher at jre/bin/java[.exe] -- the image is not usable" >&2
    exit 1
  fi
  grep '^JAVA_VERSION=' jre/release
  command -v file >/dev/null 2>&1 && file "$LAUNCHER"
else
  ./jre/bin/java -version
fi
