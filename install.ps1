[CmdletBinding()]
param(
    [ValidatePattern("^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$")]
    [string]$Version = "",
    [string]$Destination = (Join-Path $HOME ".copilot\extensions\web-fetch-override")
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$repository = "NewFuture/copilot-web-fetch-override"
$installFiles = @(
    "plugin.json",
    "extension.mjs",
    "README.md",
    "LICENSE",
    "SECURITY.md",
    "THIRD_PARTY_NOTICES.md"
)
$requiredFiles = $installFiles + @("install.ps1", "VERSION")
$headers = @{
    Accept = "application/vnd.github+json"
    "User-Agent" = "copilot-web-fetch-override-installer"
    "X-GitHub-Api-Version" = "2022-11-28"
}

[Net.ServicePointManager]::SecurityProtocol = (
    [Net.ServicePointManager]::SecurityProtocol -bor
    [Net.SecurityProtocolType]::Tls12
)

if ($Version -and -not $Version.StartsWith("v")) {
    $Version = "v$Version"
}

$releaseApiUrl = if ($Version) {
    "https://api.github.com/repos/$repository/releases/tags/$Version"
} else {
    "https://api.github.com/repos/$repository/releases/latest"
}

try {
    $release = Invoke-RestMethod -Uri $releaseApiUrl -Headers $headers
} catch {
    throw "Could not read the public GitHub Release metadata: $($_.Exception.Message)"
}

$tagName = [string]$release.tag_name
if ($tagName -notmatch "^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$") {
    throw "Release metadata contains an invalid tag: $tagName"
}
$archiveName = "copilot-web-fetch-override-$tagName.zip"
$archiveAssets = @($release.assets | Where-Object { $_.name -eq $archiveName })
if ($archiveAssets.Count -ne 1) {
    throw "Release $tagName must contain exactly one $archiveName asset."
}

$archiveAsset = $archiveAssets[0]
$digest = [string]$archiveAsset.digest
if ($digest -notmatch "^sha256:([0-9a-fA-F]{64})$") {
    throw "GitHub did not provide a valid SHA-256 digest for $archiveName."
}
$expectedHash = $Matches[1].ToLowerInvariant()

$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) (
    "copilot-web-fetch-override-" + [Guid]::NewGuid().ToString("N")
)
$archivePath = Join-Path $temporaryRoot $archiveName
$extractDirectory = Join-Path $temporaryRoot "extract"

try {
    New-Item -ItemType Directory -Path $temporaryRoot -Force | Out-Null
    Invoke-WebRequest -Uri $archiveAsset.browser_download_url `
        -OutFile $archivePath -UseBasicParsing

    $actualHash = (
        Get-FileHash -LiteralPath $archivePath -Algorithm SHA256
    ).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) {
        throw "Release archive SHA-256 mismatch. Expected $expectedHash, got $actualHash."
    }

    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractDirectory
    $payloadDirectory = Join-Path $extractDirectory "web-fetch-override"

    foreach ($file in $requiredFiles) {
        if (-not (Test-Path -LiteralPath (Join-Path $payloadDirectory $file) -PathType Leaf)) {
            throw "Release archive is missing required file: $file"
        }
    }

    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    foreach ($file in $installFiles) {
        Copy-Item -LiteralPath (Join-Path $payloadDirectory $file) `
            -Destination (Join-Path $Destination $file) -Force
    }

    Write-Host "Installed web-fetch-override $tagName to $Destination"
    Write-Host "Verified release SHA-256: $actualHash"
    Write-Host "Run /clear or restart Copilot to reload the extension."
} finally {
    if (Test-Path -LiteralPath $temporaryRoot) {
        Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
    }
}
