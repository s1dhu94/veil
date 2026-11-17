@echo off
title Veil - push to GitHub
cd /d "%~dp0"
where git >nul 2>nul
if errorlevel 1 goto nogit
if exist ".git" goto config
call git init -b main
call git remote add origin https://github.com/s1dhu94/veil.git
:config
call git config user.name "s1dhu94"
call git config user.email "s1dhu94@users.noreply.github.com"
call git config core.autocrlf true
call git remote set-url origin https://s1dhu94@github.com/s1dhu94/veil.git
rem Keep a separate GitHub login for this repo only (your other saved logins are untouched).
call git config --local --unset-all credential.helper
call git config --local --add credential.helper ""
call git config --local --add credential.helper manager
call git config --local credential.useHttpPath true
call git config --local credential.https://github.com.username s1dhu94
:commit
call git add -A
call git commit -q -F commit-msg.txt
echo.
echo A GitHub sign-in window should open in your NORMAL web browser (not the Claude app).
echo Choose "Sign in with your browser", make sure the account shown is s1dhu94, and click Authorize.
echo.
call git push -u origin main
if errorlevel 1 goto failed
echo.
echo PUSHED: https://github.com/s1dhu94/veil
echo Tell Claude "done".
goto end
:nogit
echo Git is not installed. Tell Claude "no git".
goto end
:failed
echo.
echo ---- info for Claude ----
call git --version
call git credential-manager --version
call git config --show-origin --get-all credential.helper
echo -------------------------
echo Push failed. Send Claude a screenshot of this whole window.
:end
pause
