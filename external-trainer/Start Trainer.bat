@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title ABYSS Trainer

rem Node's installer updates PATH for new Windows sessions. Prefer its canonical
rem location too, so launching from an already-open Explorer session works now.
if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"
if exist "%LocalAppData%\Programs\Python\Python312\python.exe" set "PATH=%LocalAppData%\Programs\Python\Python312;%PATH%"
if exist "C:\Program Files\Python312\python.exe" set "PATH=C:\Program Files\Python312;%PATH%"

where node >nul 2>nul
if errorlevel 1 goto :missing_node

if not exist "node_modules\@playwright\test\package.json" (
  echo Installing the trainer browser bridge. This is only needed once...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :dependency_failed
)

where py >nul 2>nul
if not errorlevel 1 (
  py -3 app.py %*
) else (
  where python >nul 2>nul
  if errorlevel 1 goto :missing_python
  python app.py %*
)
set "trainer_exit=%errorlevel%"
if not "%trainer_exit%"=="0" (
  echo.
  echo The trainer stopped with error %trainer_exit%. Copy the error above if you need help.
  pause
)
exit /b %trainer_exit%

:missing_node
echo Node.js is required. Install the current LTS release from https://nodejs.org/ and run this file again.
pause
exit /b 1

:missing_python
echo Python 3.9 through 3.12 is required. Install it from https://www.python.org/downloads/windows/ and select "Add Python to PATH".
pause
exit /b 1

:dependency_failed
echo The browser bridge could not be installed. Check your internet connection, then run this file again.
pause
exit /b 1
