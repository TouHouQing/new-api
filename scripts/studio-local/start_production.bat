@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_production.ps1" %*
if errorlevel 1 pause
