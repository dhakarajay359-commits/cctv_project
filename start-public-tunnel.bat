@echo off
echo =========================================================
echo  NIRIKSHAN CCTV - CLOUDFLARE PUBLIC HTTPS TUNNEL
echo =========================================================
echo.
echo Connecting your local GPU server (http://localhost:10000)
echo to a secure, public HTTPS URL...
echo.

set "CF_CMD=cloudflared"
if exist "C:\Program Files (x86)\cloudflared\cloudflared.exe" (
    set "CF_CMD=C:\Program Files (x86)\cloudflared\cloudflared.exe"
)

"%CF_CMD%" tunnel --protocol http2 --edge-ip-version 4 --url http://localhost:10000
pause
