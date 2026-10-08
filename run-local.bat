@echo off
setlocal
title NeoArcade - dev server

rem Run from the repo root no matter where the file was double-clicked from.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 20 or newer, then run this again.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dependencies for the first run...
  call npm install
  if errorlevel 1 (
    echo Dependency install failed.
    pause
    exit /b 1
  )
)

echo.
echo   Arcade Hall : http://localhost:5173/hall/
echo   Games       : http://localhost:5173/ports/^<slug^>/
echo   Pass Lab    : http://localhost:5173/hall/dev/pass-lab/
echo.
echo   Press Ctrl+C to stop the server.
echo.

call npm run dev -- --open /hall/

pause
