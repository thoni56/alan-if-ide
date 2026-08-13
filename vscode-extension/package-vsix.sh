#!/usr/bin/env bash
# Package the extension into an installable .vsix (bypasses vsce, which needs Node 20+).
set -e
cd "$(dirname "$0")"
VER=$(node -p "require('./package.json').version")
NAME=$(node -p "require('./package.json').name")
DISP=$(node -p "require('./package.json').displayName")
DESC=$(node -p "require('./package.json').description")
OUT="$PWD/$NAME-$VER.vsix"
STAGE=$(mktemp -d)
mkdir -p "$STAGE/extension"
cp -r package.json language-configuration.json out syntaxes icons server node_modules "$STAGE/extension/"
cat > "$STAGE/extension.vsixmanifest" <<XML
<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="$NAME" Version="$VER" Publisher="alanif"/>
    <DisplayName>$DISP</DisplayName>
    <Description>$DESC</Description>
    <Tags>alan,alan-if,interactive-fiction</Tags><Categories>Programming Languages</Categories><GalleryFlags>Public</GalleryFlags>
    <Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.75.0"/></Properties>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation>
  <Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets>
</PackageManifest>
XML
cat > "$STAGE/[Content_Types].xml" <<XML
<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json"/>
  <Default Extension="js" ContentType="application/javascript"/>
  <Default Extension="jar" ContentType="application/java-archive"/>
  <Default Extension="svg" ContentType="image/svg+xml"/>
  <Default Extension="map" ContentType="application/json"/>
  <Default Extension="vsixmanifest" ContentType="text/xml"/>
</Types>
XML
rm -f "$OUT"
(cd "$STAGE" && zip -q -r "$OUT" "extension" "extension.vsixmanifest" "[Content_Types].xml")
rm -rf "$STAGE"
echo "built $OUT"
