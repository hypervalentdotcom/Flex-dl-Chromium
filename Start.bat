@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto missing_node

where npm >nul 2>nul
if errorlevel 1 goto missing_node

where ffmpeg >nul 2>nul
if errorlevel 1 goto missing_ffmpeg

where py >nul 2>nul
if not errorlevel 1 goto start_service
where python >nul 2>nul
if errorlevel 1 goto missing_python

:start_service
call npm run service:start
if errorlevel 1 goto failed

echo.
echo The FlexDL service is ready. You can close this window.
timeout /t 2 /nobreak >nul
exit /b 0

:missing_node
echo Node.js 22 or newer is required and must be available on PATH.
goto failed

:missing_python
echo Python 3 is required and must be available on PATH.
goto failed

:missing_ffmpeg
echo ffmpeg is required and must be available on PATH.
goto failed

:failed
echo.
echo FlexDL could not start. Press any key to close.
pause >nul
exit /b 1
