@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\pythonw.exe" (
    py -3 -m venv .venv
    if errorlevel 1 goto failed
)
".venv\Scripts\python.exe" -c "import webview" >nul 2>&1
if errorlevel 1 (
    ".venv\Scripts\python.exe" -m pip install -r native\requirements.txt
    if errorlevel 1 goto failed
)
start "" ".venv\Scripts\pythonw.exe" "native\main.py"
exit /b 0
:failed
echo Setup failed. Check Python 3 and the network connection.
pause
exit /b 1
