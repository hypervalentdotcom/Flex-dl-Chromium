@echo off
setlocal
cd /d "%~dp0"

where powershell.exe >nul 2>nul
if errorlevel 1 goto missing_powershell

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Windows.ps1"
set "FLEXDL_INSTALL_EXIT=%errorlevel%"
echo.

if not "%FLEXDL_INSTALL_EXIT%"=="0" goto failed

echo FlexDL and its dependencies are ready.
if defined CI exit /b 0
echo Press any key to close this window.
pause >nul
exit /b 0

:missing_powershell
echo Windows PowerShell is required to install FlexDL.
set "FLEXDL_INSTALL_EXIT=1"

:failed
echo FlexDL installation failed.
echo Review the error above, then run Install.bat again.
if defined CI exit /b %FLEXDL_INSTALL_EXIT%
echo Press any key to close this window.
pause >nul
exit /b %FLEXDL_INSTALL_EXIT%
