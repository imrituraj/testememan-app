@echo off
title Build TestMeMan Windows Assessment Installer (.exe)
echo ========================================================
echo   Building TestMeMan Secure Assessment Windows Installer
echo ========================================================
echo.

if not exist "node_modules\" (
    echo Installing dependencies...
    npm install
)

echo Packaging NSIS installer and portable executable...
npm run build:win

echo.
echo ========================================================
echo   Build finished! Executable installer is in dist/
echo ========================================================
pause
