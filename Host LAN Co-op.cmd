@echo off
cd /d "%~dp0"
node scripts\launch-coop.mjs --lan
if errorlevel 1 pause
