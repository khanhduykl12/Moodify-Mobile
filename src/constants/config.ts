/**
 * Cấu hình Network & API Endpoint cho Moodify Mobile
 * 
 * Do bạn đang kết nối mạng Wi-Fi trường/KTX (HUIT_SV 2) có bật tính năng bảo mật chặn mạng nội bộ (Client Isolation),
 * Backend được kết nối thông qua Tunnel HTTPS an toàn để điện thoại truy cập mượt mà 100%.
 */

// Tunnel HTTPS kết nối thẳng tới Backend Spring Boot cổng 8080 trên máy tính
export const BACKEND_TUNNEL_URL = 'https://red-pugs-rush.loca.lt/api';

// Khi về nhà hoặc dùng Wi-Fi cá nhân không bị chặn IP:
export const DEV_LAN_IP = '172.16.23.31';
export const DEV_PORT = '8080';
export const LOCAL_LAN_URL = `http://${DEV_LAN_IP}:${DEV_PORT}/api`;

// Mặc định sử dụng Tunnel để điện thoại dùng Wi-Fi trường hay 4G đều gọi được BE
export const API_BASE_URL = BACKEND_TUNNEL_URL;

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'moodify_access_token',
  REFRESH_TOKEN: 'moodify_refresh_token',
  USER_INFO: 'moodify_user_info',
};
