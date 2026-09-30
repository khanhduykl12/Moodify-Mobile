import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LogBox, View, StyleSheet } from 'react-native';
import { PlayerProvider } from '@/context/PlayerContext';
import { MiniPlayer } from '@/components/player/MiniPlayer';
import { FullscreenPlayer } from '@/components/player/FullscreenPlayer';

// Tắt toàn bộ console warning không cần thiết để trải nghiệm dev mượt mà
LogBox.ignoreAllLogs(true);

export default function RootLayout() {
  return (
    <PlayerProvider>
      <View style={styles.container}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: '#0c0c10',
              borderTopColor: '#1e1e28',
              borderTopWidth: 1,
              height: 60,
              paddingBottom: 8,
              paddingTop: 6,
            },
            tabBarActiveTintColor: '#8b5cf6',
            tabBarInactiveTintColor: '#6b7280',
            tabBarLabelStyle: {
              fontSize: 11,
              fontWeight: '700',
            },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: 'Trang chủ',
              tabBarIcon: ({ color, focused }) => (
                <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="explore"
            options={{
              title: 'Tìm kiếm',
              tabBarIcon: ({ color, focused }) => (
                <Ionicons name={focused ? 'search' : 'search-outline'} size={22} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="library"
            options={{
              title: 'Thư viện',
              tabBarIcon: ({ color, focused }) => (
                <Ionicons name={focused ? 'library' : 'library-outline'} size={22} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: 'Tài khoản',
              tabBarIcon: ({ color, focused }) => (
                <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
              ),
            }}
          />
        </Tabs>

        {/* Thanh MiniPlayer nổi phía trên Tab bar */}
        <MiniPlayer />

        {/* Trình phát nhạc toàn màn hình Fullscreen Player */}
        <FullscreenPlayer />
      </View>
    </PlayerProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c0c10',
  },
});
