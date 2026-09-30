@echo off
setlocal
title Code and Document Assistant - Luna (Local)
pushd "%~dp0"
if errorlevel 1 exit /b 1

if not exist "start_ai.ps1" (
  echo ERROR: start_ai.ps1 is missing next to this launcher.
  goto failed
)

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js was not found in PATH.
  goto failed
)

powershell -NoProfile -Command "try { if ([System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port -contains 4317) { exit 1 } } catch { exit 2 }"
if errorlevel 1 (
  echo ERROR: Port 4317 is already in use.
  echo Stop the previous assistant with Ctrl+C, then run this file again.
  goto failed
)

set "CDA_LOCAL_URL=http://127.0.0.1:4317/"
set "CHROME_EXE="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

rem Wait for HTTP readiness, then open the local assistant in Chrome.
start "" powershell -NoProfile -WindowStyle Hidden -Command "$ready = $false; for ($attempt = 0; $attempt -lt 30; $attempt++) { try { $response = Invoke-WebRequest -Uri $env:CDA_LOCAL_URL -UseBasicParsing -TimeoutSec 1; if ($response.StatusCode -eq 200) { $ready = $true; break } } catch {}; Start-Sleep -Milliseconds 500 }; if ($ready) { if ($env:CHROME_EXE) { Start-Process -FilePath $env:CHROME_EXE -ArgumentList $env:CDA_LOCAL_URL } else { Write-Host 'Google Chrome was not found; opening the Windows default browser.'; Start-Process $env:CDA_LOCAL_URL } }"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_ai.ps1" -Config "%~dp0config\ai.local.json" -Model "gpt-5.6-luna"
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
