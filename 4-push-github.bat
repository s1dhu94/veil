@echo off
title Veil - push to GitHub
cd /d "%~dp0"
where git >nul 2>nul
if errorlevel 1 goto nogit
if exist ".git" goto commit
call git init -b main
call git config user.name "s1dhu94"
call git config user.email "s1dhu94@users.noreply.github.com"
call git remote add origin https://github.com/s1dhu94/veil.git
:commit
call git remote set-url origin https://s1dhu94@github.com/s1dhu94/veil.git
call git config core.autocrlf true
call git add -A
call git commit -q -F commit-msg.txt
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
echo Push failed. If a GitHub sign-in window opened, sign in as s1dhu94 and run this file again.
echo Otherwise send Claude a screenshot of this window.
:end
pause
