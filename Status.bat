@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto missing_node

call npm run service:status
set "FLEXDL_STATUS=%errorlevel%"
echo.
if not defined CI pause
exit /b %FLEXDL_STATUS%

:missing_node
echo Node.js 22 or newer is required and must be available on PATH.
echo.
if not defined CI pause
exit /b 1
