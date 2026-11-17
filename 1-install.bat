@echo off
title Veil - install
cd /d "%~dp0"
echo Installing packages (takes 1-3 minutes)...
call npm install
if errorlevel 1 goto failed
echo.
echo Running tests...
call node_modules\.bin\vitest.cmd run
if errorlevel 1 goto failed
echo.
echo ALL GOOD. Install finished and tests passed.
goto end
:failed
echo.
echo SOMETHING FAILED. Send Claude a screenshot of this window.
:end
pause
