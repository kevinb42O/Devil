@echo off
setlocal
cd /d "%~dp0"
title ABYSS Trainer
"%~dp0Abyss Trainer.exe" %*
if errorlevel 1 (
  echo.
  echo The trainer could not start. Copy the error above if you need help.
  pause
)
