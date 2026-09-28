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
Write-Host "    Control Plane: http://localhost:7880 (keys: devkey:secret)" -ForegroundColor Gray
Write-Host ""

& "$exePath" --config "$PSScriptRoot\livekit.dev.yaml"
