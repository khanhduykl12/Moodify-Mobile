@echo off
title Moodify Mobile (Expo)
echo ====================================================
echo Dang khoi dong Moodify Mobile (Expo)...
echo ====================================================
cd /d "%~dp0"
if not exist "node_modules\" (
    echo Chua tim thay thu vien node_modules, dang tien hanh npm install...
    call npm install
)
call npx expo start -c
pause
