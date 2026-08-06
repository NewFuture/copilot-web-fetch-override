[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern("^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$")]
    [string]$Version
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (
    Join-Path $repositoryRoot "package.json"
) -Raw | ConvertFrom-Json
$packageVersion = $Version.Substring(1)

if ($package.version -ne $packageVersion) {
    throw "Tag $Version does not match package.json version $($package.version)."
}

$releaseFiles = @(
    "extension.mjs",
    "README.md",
    "LICENSE",
    "SECURITY.md",
    "THIRD_PARTY_NOTICES.md",
    "install.ps1"
)
foreach ($file in $releaseFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $repositoryRoot $file) -PathType Leaf)) {
        throw "Required release file is missing: $file"
    }
}

$distDirectory = Join-Path $repositoryRoot "dist"
$archivePath = Join-Path $distDirectory "copilot-web-fetch-override-$Version.zip"
$checksumPath = "$archivePath.sha256"
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) (
    "copilot-web-fetch-override-package-" + [Guid]::NewGuid().ToString("N")
)
$payloadDirectory = Join-Path $temporaryRoot "web-fetch-override"

try {
    New-Item -ItemType Directory -Path $distDirectory -Force | Out-Null
    New-Item -ItemType Directory -Path $payloadDirectory -Force | Out-Null

    foreach ($file in $releaseFiles) {
        Copy-Item -LiteralPath (Join-Path $repositoryRoot $file) `
            -Destination (Join-Path $payloadDirectory $file)
    }
    Set-Content -LiteralPath (Join-Path $payloadDirectory "VERSION") `
        -Value $Version -NoNewline -Encoding ascii

    if (Test-Path -LiteralPath $archivePath) {
        Remove-Item -LiteralPath $archivePath -Force
    }
    Compress-Archive -LiteralPath $payloadDirectory -DestinationPath $archivePath
    $hash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    Set-Content -LiteralPath $checksumPath `
        -Value "$hash  $(Split-Path -Leaf $archivePath)" -Encoding ascii
    Write-Output $archivePath
    Write-Output $checksumPath
} finally {
    if (Test-Path -LiteralPath $temporaryRoot) {
        Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
    }
}
