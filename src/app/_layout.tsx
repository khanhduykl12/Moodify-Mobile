import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LogBox, View, StyleSheet } from 'react-native';
import { PlayerProvider } from '@/context/PlayerContext';
import { MiniPlayer } from '@/components/player/MiniPlayer';

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
              backgroundColor: '#121216',
              borderTopColor: '#23232e',
              borderTopWidth: 1,
              height: 58,
              paddingBottom: 6,
              paddingTop: 6,
            },
            tabBarActiveTintColor: '#ffffff',
            tabBarInactiveTintColor: '#6b7280',
            tabBarLabelStyle: {
              fontSize: 11,
              fontWeight: '600',
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
        </Tabs>
        <MiniPlayer />
      </View>
    </PlayerProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121216',
  },
});
