@echo off
title Veil - build and deploy
cd /d "%~dp0"
echo Testing...
call node_modules\.bin\vitest.cmd run
if errorlevel 1 goto failed
echo Building...
call node_modules\.bin\vite.cmd build
if errorlevel 1 goto failed
echo Deploying to Firebase Hosting...
call node_modules\.bin\firebase.cmd deploy --only hosting --project veil-hybrid-3fc9f
if errorlevel 1 goto failed
echo.
echo DEPLOYED: https://veil-hybrid-3fc9f.web.app
echo Tell Claude "done".
goto end
:failed
echo.
echo SOMETHING FAILED. Send Claude a screenshot of this window.
:end
pause
