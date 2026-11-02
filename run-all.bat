@echo off
title Khoi dong toan bo he thong Moodify
echo ====================================================
echo Dang khoi dong toan bo he thong Moodify:
echo  1. Audio Analysis Service (Port 8002)
echo  2. Backend Spring Boot (Port 8080)
echo  3. Frontend Next.js (Port 3000)
echo  4. Mobile App Expo
echo ====================================================

:: 1. Khoi dong Audio Service
start "Moodify - Audio Service (Port 8002)" cmd /k "cd /d %~dp0Moodify-Audio-Service && call run.bat"

:: 2. Khoi dong Backend Spring Boot
start "Moodify - Backend (Port 8080)" cmd /k "cd /d %~dp0Moodify-Backend-main && call run.bat"

:: 3. Khoi dong Frontend Next.js
start "Moodify - Frontend (Port 3000)" cmd /k "cd /d %~dp0Moodify-main && call run.bat"

:: 4. Khoi dong Mobile App Expo
start "Moodify - Mobile (Expo)" cmd /k "cd /d %~dp0Moodify-Mobile && call run.bat"

echo.
echo ====================================================
echo Da mo ca 4 service trong cac cua so rieng biet!
echo ====================================================
timeout /t 5

