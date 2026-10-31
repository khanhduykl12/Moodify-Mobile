/**
 * Cấu hình Network & API Endpoint cho Moodify Mobile
 */
import Constants from 'expo-constants';

// Tự động nhận diện IP máy tính dev đang chạy Expo qua Wi-Fi hiện tại
const debuggerHost = Constants.expoConfig?.hostUri;
const detectedIp = debuggerHost ? debuggerHost.split(':')[0] : '192.168.60.101';

export const CURRENT_LAN_IP = detectedIp || '192.168.60.101';
export const DEV_PORT = '8080';

// API Base URL gọi trực tiếp qua Wi-Fi (Tự thích ứng theo IP mạng kết nối)
export const API_BASE_URL = `http://${CURRENT_LAN_IP}:${DEV_PORT}/api`;

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'moodify_access_token',
  REFRESH_TOKEN: 'moodify_refresh_token',
  USER_INFO: 'moodify_user_info',
};
