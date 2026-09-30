@echo off
setlocal
title Code and Document Assistant - 4317
pushd "%~dp0"
if errorlevel 1 exit /b 1

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js was not found in PATH. Install Node.js before starting.
  goto failed
)
if not exist "server.js" (
  echo ERROR: server.js is missing next to this BAT file.
  goto failed
)

set "CDA_HOST=0.0.0.0"
set "CDA_PORT=4317"
set "CDA_LOCAL_URL=http://127.0.0.1:4317/"
set "LOCAL_IP="
set "CHROME_EXE="

powershell -NoProfile -Command "try { if ([System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port -contains 4317) { exit 1 } } catch { exit 2 }"
if errorlevel 1 (
  echo ERROR: Port 4317 is already in use, or its status could not be checked.
  echo Stop the previous assistant with Ctrl+C, or inspect the port before retrying.
  goto failed
)

for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "Get-NetIPConfiguration -ErrorAction SilentlyContinue | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | ForEach-Object { $_.IPv4Address.IPAddress } | Select-Object -First 1"`) do set "LOCAL_IP=%%I"
echo Local admin URL: %CDA_LOCAL_URL%
if defined LOCAL_IP (
  echo LAN URL: http://%LOCAL_IP%:4317/
) else (
  echo LAN IP not detected. Use ipconfig to find this computer's IPv4 address.
)
echo WARNING: LAN mode has no login. Use only on a trusted network.
echo Folder approval and real file changes require the LOCAL URL and console admin code.
echo Keep the admin code private. Press Ctrl+C in this window to stop the server.
echo Firewall rules are not changed by this launcher.
echo.

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

rem Wait for HTTP readiness before opening Chrome or the Windows default browser.
start "" powershell -NoProfile -WindowStyle Hidden -Command "$ready = $false; for ($attempt = 0; $attempt -lt 30; $attempt++) { try { $response = Invoke-WebRequest -Uri $env:CDA_LOCAL_URL -UseBasicParsing -TimeoutSec 1; if ($response.StatusCode -eq 200) { $ready = $true; break } } catch {}; Start-Sleep -Milliseconds 500 }; if ($ready) { if ($env:CHROME_EXE) { Start-Process -FilePath $env:CHROME_EXE -ArgumentList $env:CDA_LOCAL_URL } else { Start-Process $env:CDA_LOCAL_URL } }"
node server.js
set "CDA_EXIT_CODE=%ERRORLEVEL%"
echo.
echo Server stopped. Exit code: %CDA_EXIT_CODE%
pause
popd
exit /b %CDA_EXIT_CODE%

:failed
pause
popd
exit /b 1
