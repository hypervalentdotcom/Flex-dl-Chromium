@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto missing_node

call npm run service:stop
if errorlevel 1 goto failed

echo.
echo The FlexDL service is stopped.
timeout /t 2 /nobreak >nul
exit /b 0

:missing_node
echo Node.js 22 or newer is required and must be available on PATH.

:failed
echo.
echo FlexDL could not stop cleanly. Press any key to close.
pause >nul
exit /b 1
