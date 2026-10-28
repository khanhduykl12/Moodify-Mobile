@echo off
title Build Moodify Mobile APK
echo ====================================================
echo         TIEN HANH BUILD FILE APK (EAS BUILD)
echo ====================================================
echo.
cd /d "%~dp0"

echo [1/2] Kiem tra dang nhap Expo...
call npx eas-cli whoami
if %errorlevel% neq 0 (
    echo.
    echo Ban chua dang nhap vao Expo!
    echo Neu chua co tai khoan, hay dang ky mien phi tai: https://expo.dev/signup
    echo.
    call npx eas-cli login
)

echo.
echo [2/2] Bat dau qua trinh build APK tren Cloud...
call npx eas-cli build -p android --profile preview --clear-cache

echo.
echo Build hoan tat! Kiem tra link hoac ma QR tren man hinh de tai APK ve may.
pause
