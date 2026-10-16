@echo off
title TestMeMan Secure Assessment Launcher
cd /d "%~dp0"

if exist "dist\win-unpacked\TestMeMan Secure Assessment.exe" (
  start "" "dist\win-unpacked\TestMeMan Secure Assessment.exe"
) else (
  echo Launching TestMeMan Secure Assessment via runtime...
  npm start
)
