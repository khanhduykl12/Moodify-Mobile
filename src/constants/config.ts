/**
 * Cấu hình Network & API Endpoint cho Moodify Mobile
 * 
 * LƯU Ý KHI TEST:
 * 1. Chạy trên điện thoại thật (chung Wi-Fi): Dùng IP LAN của máy tính (Hiện tại: 172.16.23.31)
 * 2. Chạy trên Android Emulator: Dùng 'http://10.0.2.2:8080/api'
 * 3. Chạy qua Ngrok/Cloudflared: Dùng URL do tunnel cung cấp
 */

// IP máy tính trong mạng Wi-Fi hiện tại của bạn
export const DEV_LAN_IP = '172.16.23.31';
export const DEV_PORT = '8080';

export const API_BASE_URL = `http://${DEV_LAN_IP}:${DEV_PORT}/api`;

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'moodify_access_token',
  REFRESH_TOKEN: 'moodify_refresh_token',
  USER_INFO: 'moodify_user_info',
};
