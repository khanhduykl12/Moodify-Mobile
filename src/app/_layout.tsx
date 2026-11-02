import { Stack } from 'expo-router';
import { LogBox } from 'react-native';
import { PlayerProvider } from '@/context/PlayerContext';
import { OfflineProvider } from '@/context/OfflineContext';

// Tắt toàn bộ console warning không cần thiết để trải nghiệm dev mượt mà
LogBox.ignoreAllLogs(true);

// Root là Stack: nhóm (tabs) là khu vực chính, trang /auth được ĐẨY lên trên
// (không có tab bar) — nhờ đó sau khi đăng nhập/đăng ký, router.back() quay
// chính xác về màn hình đã gọi nó thay vì về tab mặc định (Trang chủ).
export default function RootLayout() {
  return (
    <OfflineProvider>
      <PlayerProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0c0c10' } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="auth" options={{ animation: 'slide_from_right' }} />
        </Stack>
      </PlayerProvider>
    </OfflineProvider>
  );
}
