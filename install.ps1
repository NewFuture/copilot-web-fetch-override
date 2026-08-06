[CmdletBinding()]
param(
    [string]$Version = "",
    [string]$Destination = (Join-Path $HOME ".copilot\extensions\proxy-web-fetch")
)

$ErrorActionPreference = "Stop"
$repository = "NewFuture/copilot-proxy-web-fetch"
$archivePattern = "copilot-proxy-web-fetch-*.zip"
$installFiles = @(
    "extension.mjs",
    "README.md",
    "THIRD_PARTY_NOTICES.md"
)
$requiredFiles = $installFiles + "VERSION"

$gh = Get-Command gh -CommandType Application -ErrorAction SilentlyContinue
if (-not $gh) {
    throw "GitHub CLI is required. Install it from https://cli.github.com/ and run 'gh auth login'."
}

& $gh.Source auth status --hostname github.com *> $null
if ($LASTEXITCODE -ne 0) {
    throw "GitHub CLI is not authenticated. Run 'gh auth login' with an account that can access $repository."
}

$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) (
    "copilot-proxy-web-fetch-" + [Guid]::NewGuid().ToString("N")
)
$downloadDirectory = Join-Path $temporaryRoot "download"
$extractDirectory = Join-Path $temporaryRoot "extract"

try {
    New-Item -ItemType Directory -Path $downloadDirectory -Force | Out-Null

    $downloadArguments = @("release", "download")
    if ($Version) {
        $downloadArguments += $Version
    }
    $downloadArguments += @(
        "--repo", $repository,
        "--pattern", $archivePattern,
        "--dir", $downloadDirectory
    )

    & $gh.Source @downloadArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Could not download the requested release from $repository."
    }

    $archives = @(
        Get-ChildItem -LiteralPath $downloadDirectory -File -Filter $archivePattern
    )
    if ($archives.Count -ne 1) {
        throw "Expected exactly one release archive, but found $($archives.Count)."
    }

    Expand-Archive -LiteralPath $archives[0].FullName -DestinationPath $extractDirectory
    $payloadDirectory = Join-Path $extractDirectory "proxy-web-fetch"

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

    $installedVersion = Get-Content -LiteralPath (
        Join-Path $payloadDirectory "VERSION"
    ) -Raw
    Write-Host "Installed proxy-web-fetch $($installedVersion.Trim()) to $Destination"
    Write-Host "Run /clear or restart Copilot to reload the extension."
} finally {
    if (Test-Path -LiteralPath $temporaryRoot) {
        Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
    }
}
