@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul && (py -3 app.py %* & exit /b %errorlevel%)
python app.py %*
