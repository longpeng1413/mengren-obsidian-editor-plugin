param([string]$OutputDirectory)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $outputRoot = (Resolve-Path -LiteralPath (Join-Path $projectRoot '..')).Path
} else {
  $outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
  New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
}
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'manifest.json') -Raw | ConvertFrom-Json
$packageName = $manifest.name -replace '[\\/:*?"<>|]', '-'
$installZip = Join-Path $outputRoot ($packageName + '-' + $manifest.version + '-安装包.zip')
$sourceZip = Join-Path $outputRoot ($packageName + '-' + $manifest.version + '-源码.zip')
foreach ($zipPath in @($installZip, $sourceZip)) {
  if (Test-Path -LiteralPath $zipPath) { throw "ZIP already exists; keep it or rename it before packaging: $zipPath" }
}
$stageRoot = Join-Path $outputRoot ('package-stage-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stageRoot | Out-Null
$installRoot = Join-Path $stageRoot 'installer'
$installFolder = Join-Path $installRoot 'trader-editor-tools'
New-Item -ItemType Directory -Path $installFolder | Out-Null
foreach ($name in @('manifest.json','main.js','styles.css','versions.json','README.md','TESTING.md','CHANGELOG.md','LICENSE','THIRD-PARTY-NOTICES.md')) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination $installFolder
}
$sourceRoot = Join-Path $stageRoot 'source'
$sourceFolder = Join-Path $sourceRoot 'trader-editor-tools-source'
New-Item -ItemType Directory -Path $sourceFolder | Out-Null
# Explicit public allowlist: never package vault data, backups, dependencies or Git credentials.
foreach ($name in @('src','tests','scripts','examples','docs','.github','.gitignore','.gitattributes','manifest.json','main.js','styles.css','versions.json','README.md','TESTING.md','CHANGELOG.md','CONTRIBUTING.md','SECURITY.md','LICENSE','THIRD-PARTY-NOTICES.md','package.json','pnpm-lock.yaml')) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination $sourceFolder -Recurse -Force
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
# ZipFile includes dotfiles on every supported platform, unlike Compress-Archive.
[System.IO.Compression.ZipFile]::CreateFromDirectory($installRoot, $installZip)
[System.IO.Compression.ZipFile]::CreateFromDirectory($sourceRoot, $sourceZip)
# Staging is intentionally retained; do not recursively delete computed paths.
Write-Output $installZip
Write-Output $sourceZip
