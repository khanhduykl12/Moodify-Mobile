/**
 * Cấu hình Network & API Endpoint cho Moodify Mobile
 */

// IP máy tính trong mạng Wi-Fi hiện tại (Nha Tro 10 LTT 2)
export const CURRENT_LAN_IP = '10.0.0.131';
export const DEV_PORT = '8080';

// API Base URL gọi trực tiếp qua Wi-Fi phòng trọ (Siêu nhanh, không cần tunnel)
export const API_BASE_URL = `http://${CURRENT_LAN_IP}:${DEV_PORT}/api`;

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'moodify_access_token',
  REFRESH_TOKEN: 'moodify_refresh_token',
  USER_INFO: 'moodify_user_info',
};
