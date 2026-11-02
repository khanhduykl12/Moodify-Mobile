// Karaoke Home — port từ karaoke-home-page.tsx của web (2 card chọn Solo / Phòng hát)

import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '@/context/PlayerContext';

export default function KaraokeHomeScreen() {
  const router = useRouter();
  const { isPlaying: globalIsPlaying, togglePlayPause } = usePlayer();

  useEffect(() => {
    if (globalIsPlaying) togglePlayPause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color="#e5e7eb" />
            <Text style={styles.backText}>Quay lại</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.intro}>
          <View style={styles.eyebrowRow}>
            <View style={styles.eyebrowLine} />
            <Text style={styles.eyebrow}>MOODIFY KARAOKE</Text>
            <View style={styles.eyebrowLine} />
          </View>
          <Text style={styles.title}>Đêm nhạc của bạn bắt đầu từ đây.</Text>
          <Text style={styles.subtitle}>
            Hát một mình để được chấm điểm, hoặc mở phòng hát cùng bạn bè.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.modeCard, styles.soloCard]}
          activeOpacity={0.85}
          onPress={() => router.push('/karaoke/solo')}
        >
          <View style={styles.modeIcon}>
            <Ionicons name="mic" size={26} color="#c4b5fd" />
          </View>
          <View style={styles.modeCopy}>
            <Text style={styles.modeTitle}>Hát một mình</Text>
            <Text style={styles.modeDescription}>
              Sân khấu của riêng bạn với lời đồng bộ và chấm điểm sau mỗi bài.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#6b7280" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeCard, styles.roomCard]}
          activeOpacity={0.85}
          onPress={() => router.push('/karaoke/rooms')}
        >
          <View style={styles.modeIcon}>
            <Ionicons name="people" size={26} color="#93c5fd" />
          </View>
          <View style={styles.modeCopy}>
            <Text style={styles.modeTitle}>Phòng hát nhóm</Text>
            <Text style={styles.modeDescription}>
              Tạo hoặc vào phòng, đăng ký lượt hát và cùng nhau chấm điểm chung.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#6b7280" />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    color: '#e5e7eb',
    fontSize: 13,
  },
  intro: {
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  eyebrowLine: {
    width: 28,
    height: 1,
    backgroundColor: 'rgba(139, 92, 246, 0.6)',
  },
  eyebrow: {
    color: '#a78bfa',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
  },
  title: {
    color: '#f9fafb',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  soloCard: {
    backgroundColor: '#1f1f2e',
    borderColor: 'rgba(139, 92, 246, 0.5)',
  },
  roomCard: {
    backgroundColor: '#1f1f2e',
    borderColor: 'rgba(59, 130, 246, 0.4)',
  },
  modeIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(139, 92, 246, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeCopy: {
    flex: 1,
    gap: 4,
  },
  modeTitle: {
    color: '#f9fafb',
    fontSize: 16,
    fontWeight: '700',
  },
  modeDescription: {
    color: '#9ca3af',
    fontSize: 12,
  },
});
