@echo off
title Veil - Firebase login
cd /d "%~dp0"
set "CFG=%USERPROFILE%\.config\configstore"
if exist "%CFG%\firebase-tools.json" goto login
if not exist "%CFG%" mkdir "%CFG%"
> "%CFG%\firebase-tools.json" echo {"usage": false}
:login
echo A browser window will open. Sign in with the SAME Google account you use in the Firebase console
echo (your PERSONAL Gmail: theskaursidhu), then click Allow. Come back here when it says Success.
echo.
call node_modules\.bin\firebase.cmd logout
call node_modules\.bin\firebase.cmd login
if errorlevel 1 goto failed
call node_modules\.bin\firebase.cmd projects:list
echo.
echo Logged in. Tell Claude "done".
goto end
:failed
echo.
echo Login failed. Send Claude a screenshot of this window.
:end
pause
