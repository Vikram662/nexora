$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Nexora RTC - LiveKit Windows Native Setup" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$destDir = "$PSScriptRoot\bin"
if (!(Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}

$exePath = "$destDir\livekit-server.exe"

if (Test-Path $exePath) {
    Write-Host "[OK] LiveKit server binary found at: $exePath" -ForegroundColor Green
} else {
    Write-Host "[*] Fetching latest release info from GitHub API..." -ForegroundColor Yellow
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $headers = @{ "User-Agent" = "Nexora-Setup-Script" }
    
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/livekit/livekit/releases/latest" -Headers $headers
    $asset = $release.assets | Where-Object { $_.name -like "*windows_amd64.zip" } | Select-Object -First 1

    if (-not $asset) {
        Write-Host "[ERROR] Could not find windows_amd64.zip in latest GitHub release!" -ForegroundColor Red
        exit 1
    }

    $downloadUrl = $asset.browser_download_url
    $zipPath = "$destDir\livekit_windows.zip"

    Write-Host "[*] Downloading: $($asset.name)..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -Headers $headers

    Write-Host "[*] Computing SHA256 checksum for verification..." -ForegroundColor Yellow
    $fileHash = (Get-FileHash -Path $zipPath -Algorithm SHA256).Hash
    Write-Host "[OK] Archive SHA256: $fileHash" -ForegroundColor Green

    Write-Host "[*] Extracting LiveKit archive..." -ForegroundColor Yellow
    Expand-Archive -Path $zipPath -DestinationPath $destDir -Force
    Remove-Item $zipPath -Force

    if (Test-Path $exePath) {
        Write-Host "[SUCCESS] LiveKit binary installed successfully!" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] Could not find livekit-server.exe after extraction" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "[*] Starting LiveKit SFU Media Server on port 7880..." -ForegroundColor Cyan
Write-Host "    WebRTC TCP Port: 7881 | UDP Port Range: 50000-60000" -ForegroundColor Gray
Write-Host "    Control Plane: http://localhost:7880" -ForegroundColor Gray
Write-Host ""

# LiveKit reads its API key pair from LIVEKIT_KEYS. Take it from the environment or backend\.env so both sides always match.
function Get-DotEnvValue($name) {
    $envFile = "$PSScriptRootackend\.env"
    if (!(Test-Path $envFile)) { return $null }
    $line = Get-Content $envFile | Where-Object { $_ -match "^\s*$name\s*=" } | Select-Object -First 1
    if (-not $line) { return $null }
    return ($line -replace "^\s*$name\s*=\s*", "").Trim().Trim('"')
}

$apiKey = if ($env:LIVEKIT_API_KEY) { $env:LIVEKIT_API_KEY } else { Get-DotEnvValue "LIVEKIT_API_KEY" }
$apiSecret = if ($env:LIVEKIT_API_SECRET) { $env:LIVEKIT_API_SECRET } else { Get-DotEnvValue "LIVEKIT_API_SECRET" }

if (-not $apiKey -or -not $apiSecret) {
    Write-Host "[ERROR] Set LIVEKIT_API_KEY and LIVEKIT_API_SECRET in backend\.env (or the environment) first." -ForegroundColor Red
    exit 1
}
if ($apiSecret.Length -lt 32) {
    Write-Host "[ERROR] LIVEKIT_API_SECRET must be at least 32 characters." -ForegroundColor Red
    exit 1
}

$env:LIVEKIT_KEYS = "${apiKey}: ${apiSecret}"
& "$exePath" --config "$PSScriptRoot\livekit.dev.yaml"
