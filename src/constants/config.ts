/**
 * Cấu hình Network & API Endpoint cho Moodify Mobile
 */
import Constants from "expo-constants";

// Tự động nhận diện IP máy tính dev đang chạy Expo qua Wi-Fi hiện tại
const debuggerHost = Constants.expoConfig?.hostUri;
const detectedIp = debuggerHost ? debuggerHost.split(':')[0] : '172.20.10.4';

export const CURRENT_LAN_IP = detectedIp || '172.20.10.4';
// Backend Spring Boot runs on SERVER_PORT=8088 (see moodify-backend/.env).
export const DEV_PORT = '8088';

const configuredApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
const defaultApiBaseUrl = debuggerHost
  ? `http://${CURRENT_LAN_IP}:${DEV_PORT}/api`
  : "https://api.moodify.click/api";
const apiBaseUrl = configuredApiBaseUrl || defaultApiBaseUrl;

// Cho phép cấu hình bằng origin (https://api.moodify.click) hoặc full API base
// (https://api.moodify.click/api) qua EXPO_PUBLIC_API_BASE_URL.
export const API_BASE_URL = (
  apiBaseUrl.endsWith("/api") ? apiBaseUrl : `${apiBaseUrl}/api`
).replace(/\/+$/, "");

export const STORAGE_KEYS = {
  ACCESS_TOKEN: "moodify_access_token",
  REFRESH_TOKEN: "moodify_refresh_token",
  USER_INFO: "moodify_user_info",
  DEVICE_UUID: "moodify_device_uuid",
};

// ============================================================================
// OAuth Social Login — đồng bộ với hệ thống web Moodify & backend (.env)
//
// GOOGLE (Authorization Code + PKCE):
//  - Google đã chặn implicit flow VÀ không cho client dạng Web đăng ký redirect
//    URI dạng scheme tùy chỉnh (exp://, moodify://) => Google login KHÔNG chạy
//    được trong Expo Go. Phải dùng client riêng cho Android/iOS + bản build APK:
//    1. Google Cloud Console > Credentials > Create Credentials > OAuth client ID
//       > chọn loại "Android":
//         • Package name: com.khanhduykl12steam.moodify
//         • SHA-1: lấy từ keystore EAS bằng lệnh `npx eas-cli credentials`
//    2. Copy Client ID (xxx.apps.googleusercontent.com) vào GOOGLE_ANDROID_CLIENT_ID.
//    3. Thêm intentFilter (scheme com.googleusercontent.apps.<ANDROID_CLIENT_ID>)
//       vào app.json > android rồi build lại APK (build-apk.bat).
//  - Client web (GOOGLE_CLIENT_ID) vẫn dùng cho hệ thống web moodify.click.
//
// FACEBOOK: thêm redirect URI vào "Valid OAuth Redirect URIs" của App ID.
// ============================================================================
export const GOOGLE_CLIENT_ID =
  "711124485487-2qb1s0uqa7e1uja1qio1kjggqgqdka7i.apps.googleusercontent.com";
export const GOOGLE_ANDROID_CLIENT_ID =
  "711124485487-9jhe2ehomto8cam97l2tcds3tgug084q.apps.googleusercontent.com";
export const GOOGLE_IOS_CLIENT_ID = "";
export const FACEBOOK_APP_ID = "2981895912150587";
