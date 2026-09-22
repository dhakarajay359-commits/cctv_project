@echo off
echo ===================================================
echo  Starting Nirikshan CCTV Platform Local Server
echo ===================================================
if exist "%~dp0node.exe" (
    set "NODE_CMD=%~dp0node.exe"
) else (
    where node >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        set "NODE_CMD=node"
    ) else (
        set "NODE_CMD="
    )
)

if defined NODE_CMD (
    echo Starting Nirikshan Backend Engine at http://localhost:10000/
    echo Press Ctrl+C to terminate.
    echo.
    "%NODE_CMD%" "%~dp0server.js"
) else (
    echo [INFO] Node.js not found. Starting with Python at http://localhost:8080/
    echo Press Ctrl+C to terminate.
    echo.
    python -m http.server 8080
)
pause
