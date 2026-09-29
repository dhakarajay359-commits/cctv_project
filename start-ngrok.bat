@echo off
echo =========================================================
echo  NIRIKSHAN CCTV - NGROK PUBLIC TUNNEL
echo =========================================================
echo.
echo Forwarding your local CCTV server (http://localhost:10000)
echo to a secure, public ngrok URL...
echo.

ngrok http 10000
pause
