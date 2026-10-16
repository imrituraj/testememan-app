@echo off
title TestMeMan Secure Assessment Launcher
echo ========================================================
echo   Launching TestMeMan Secure Assessment Windows App
echo ========================================================
echo.

if not exist "node_modules\" (
    echo Installing dependencies...
    npm install
)

echo Starting Electron Assessment Client...
npm start
