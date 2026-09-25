import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TrackApi } from '@/services/api';
import { Track } from '@/types';
import { usePlayer } from '@/context/PlayerContext';

const { width } = Dimensions.get('window');

// Danh mục Vibe / Thể loại
const FILTER_CHIPS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'vpop', label: 'V-Pop' },
  { id: 'hiphop', label: 'Hip-Hop' },
  { id: 'indie', label: 'Indie' },
  { id: 'remix', label: 'Remix/EDM' },
];

// Danh mục Tâm trạng (Moodify Signature)
const MOOD_CARDS = [
  { id: 'vpop', name: 'V-Pop Thịnh Hành', icon: '🔥', color: '#881337', gradient: '#fb7185' },
  { id: 'hiphop', name: 'Năng Lượng & Flow', icon: '⚡', color: '#78350f', gradient: '#fbbf24' },
  { id: 'indie', name: 'Acoustic & Chill', icon: '🌙', color: '#581c87', gradient: '#c084fc' },
  { id: 'remix', name: 'Sôi Động / Remix', icon: '🎉', color: '#0369a1', gradient: '#38bdf8' },
  { id: 'all', name: 'Tập Trung / Deep', icon: '🎧', color: '#134e4a', gradient: '#2dd4bf' },
];

export default function HomeScreen() {
  const { playTrack, currentTrack, isPlaying } = usePlayer();
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allTracks, setAllTracks] = useState<Track[]>([]);

  // Tải danh sách bài hát từ Backend
  const loadData = async () => {
    try {
      const data = await TrackApi.getTracks(0, 50);
      setAllTracks(data.content || []);
    } catch (error) {
      console.warn('Lỗi tải bài hát:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Lọc bài hát theo thể loại
  const filteredTracks = useMemo(() => {
    if (selectedFilter === 'all') return allTracks;
    return allTracks.filter((t) => {
      const genres = (t.genres || []).map((g) => g.toLowerCase());
      if (selectedFilter === 'vpop') return genres.some((g) => g.includes('pop') || g.includes('viet'));
      if (selectedFilter === 'hiphop') return genres.some((g) => g.includes('hip') || g.includes('rap'));
      if (selectedFilter === 'indie') return genres.some((g) => g.includes('indie'));
      if (selectedFilter === 'remix') return genres.some((g) => g.includes('remix') || g.includes('edm') || g.includes('dance'));
      return true;
    });
  }, [allTracks, selectedFilter]);

  // Ưu tiên các bài hát có sẵn audio stream MP3 từ Spring Boot để bấm là nghe nhạc ngay
  const playableTracks = useMemo(() => {
    const withAudio = allTracks.filter((t) => t.localPath || t.previewUrl);
    const withoutAudio = allTracks.filter((t) => !t.localPath && !t.previewUrl);
    return [...withAudio, ...withoutAudio];
  }, [allTracks]);

  // 6 bài hát gần đây cho ô lưới Quick Access (2 cột x 3 hàng)
  const quickAccessTracks = useMemo(() => playableTracks.slice(0, 6), [playableTracks]);

  // Bài hát tiêu điểm Spotlight (bài hit có audio MP3 đỉnh nhất)
  const spotlightTrack = useMemo(() => playableTracks[0] || null, [playableTracks]);

  // Danh sách nghệ sĩ
  const featuredArtists = useMemo(() => {
    const map = new Map<string, { name: string; image?: string | null }>();
    allTracks.forEach((t) => {
      if (t.artistName && !map.has(t.artistName) && t.imageUrl) {
        map.set(t.artistName, { name: t.artistName, image: t.imageUrl });
      }
    });
    return Array.from(map.values()).slice(0, 8);
  }, [allTracks]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* ========================================================================= */}
        {/* 1. TOP HEADER (Avatar + Logo + Action Icons)                              */}
        {/* ========================================================================= */}
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>K</Text>
            </View>
            <View style={styles.brandRow}>
              <Image
                source={require('@/assets/images/moodify-logo.png')}
                style={styles.brandLogo}
                resizeMode="contain"
              />
              <Text style={styles.brandTitle}>Moodify</Text>
            </View>
          </View>

          <View style={styles.topBarRight}>
            <TouchableOpacity style={styles.iconBtn}>
              <Ionicons name="notifications-outline" size={21} color="#ffffff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn}>
              <Ionicons name="settings-outline" size={21} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* 2. FILTER PILLS ROW */}
        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {FILTER_CHIPS.map((chip) => {
              const active = selectedFilter === chip.id;
              return (
                <TouchableOpacity
                  key={chip.id}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setSelectedFilter(chip.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {loading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color="#8b5cf6" />
            <Text style={styles.loadingText}>Đang nạp giai điệu Moodify...</Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8b5cf6" />}
          >
            {/* ===================================================================== */}
            {/* 3. QUICK ACCESS GRID (2 Cột x 3 Hàng Spotify style)                  */}
            {/* ===================================================================== */}
            {quickAccessTracks.length > 0 && (
              <View style={styles.quickGrid}>
                {quickAccessTracks.map((item) => {
                  const isCurrent = currentTrack?.id === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.quickCard, isCurrent && styles.quickCardActive]}
                      onPress={() => playTrack(item)}
                      activeOpacity={0.8}
                    >
                      {item.imageUrl ? (
                        <Image source={{ uri: item.imageUrl }} style={styles.quickImage} />
                      ) : (
                        <View style={styles.quickPlaceholder}>
                          <Text style={{ fontSize: 16 }}>🎵</Text>
                        </View>
                      )}
                      <Text style={styles.quickTitle} numberOfLines={2}>
                        {item.name}
                      </Text>
                      {isCurrent && isPlaying ? (
                        <Ionicons name="volume-high" size={16} color="#a78bfa" style={{ marginRight: 8 }} />
                      ) : (
                        <View style={styles.quickPlayGhost}>
                          <Ionicons name="play" size={14} color="#ffffff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* ===================================================================== */}
            {/* 4. SPOTLIGHT HERO BANNER (Spotify Featured Card)                     */}
            {/* ===================================================================== */}
            {spotlightTrack && (
              <View style={styles.spotlightContainer}>
                <View style={styles.spotlightCard}>
                  {/* Background Artwork */}
                  {spotlightTrack.imageUrl && (
                    <Image
                      source={{ uri: spotlightTrack.imageUrl }}
                      style={styles.spotlightBgImage}
                      blurRadius={20}
                    />
                  )}
                  {/* Dark Vignette Overlay */}
                  <View style={styles.spotlightOverlay} />

                  <View style={styles.spotlightContent}>
                    {/* Cover Thumbnail */}
                    {spotlightTrack.imageUrl ? (
                      <Image source={{ uri: spotlightTrack.imageUrl }} style={styles.spotlightCover} />
                    ) : (
                      <View style={styles.spotlightCoverPlaceholder}>
                        <Text style={{ fontSize: 32 }}>🎵</Text>
                      </View>
                    )}

                    {/* Meta info */}
                    <View style={styles.spotlightMeta}>
                      <View style={styles.spotlightBadge}>
                        <Text style={styles.spotlightBadgeText}>🔥 TIÊU ĐIỂM MOODIFY</Text>
                      </View>
                      <Text style={styles.spotlightTitle} numberOfLines={1}>
                        {spotlightTrack.name}
                      </Text>
                      <Text style={styles.spotlightArtist} numberOfLines={1}>
                        {spotlightTrack.artistName}
                      </Text>

                      <TouchableOpacity
                        style={styles.spotlightPlayBtn}
                        onPress={() => playTrack(spotlightTrack)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="play" size={16} color="#000000" />
                        <Text style={styles.spotlightPlayBtnText}>Nghe ngay</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* ===================================================================== */}
            {/* 5. MOOD / VIBE CARDS (Khám phá theo cảm xúc)                         */}
            {/* ===================================================================== */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Cảm xúc âm nhạc</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moodScroll}>
              {MOOD_CARDS.map((mood) => (
                <TouchableOpacity
                  key={mood.id}
                  style={[styles.moodCard, { backgroundColor: mood.color }]}
                  onPress={() => setSelectedFilter(mood.id)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.moodIcon}>{mood.icon}</Text>
                  <Text style={styles.moodName}>{mood.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* ===================================================================== */}
            {/* 6. CAROUSEL: Giai điệu thịnh hành                                    */}
            {/* ===================================================================== */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Giai điệu thịnh hành</Text>
              <TouchableOpacity>
                <Text style={styles.sectionLink}>Hiện tất cả</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              horizontal
              data={filteredTracks}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.trackCard}
                  onPress={() => playTrack(item)}
                  activeOpacity={0.8}
                >
                  <View style={styles.cardImageContainer}>
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={styles.cardImage} />
                    ) : (
                      <View style={styles.cardPlaceholder}>
                        <Text style={{ fontSize: 24 }}>🎵</Text>
                      </View>
                    )}
                    {currentTrack?.id === item.id && isPlaying && (
                      <View style={styles.cardPlayingBadge}>
                        <Ionicons name="musical-notes" size={14} color="#ffffff" />
                      </View>
                    )}
                  </View>
                  <Text style={styles.cardTrackName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.cardArtistName} numberOfLines={1}>
                    {item.artistName}
                  </Text>
                </TouchableOpacity>
              )}
            />

            {/* ===================================================================== */}
            {/* 7. CAROUSEL: Nghệ sĩ Việt Nam nổi bật (Ảnh tròn chuẩn)               */}
            {/* ===================================================================== */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Nghệ sĩ Việt Nam nổi bật</Text>
              <TouchableOpacity>
                <Text style={styles.sectionLink}>Hiện tất cả</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              horizontal
              data={featuredArtists}
              keyExtractor={(item, idx) => item.name + idx}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.artistCard} activeOpacity={0.8}>
                  <View style={styles.artistAvatarWrapper}>
                    {item.image ? (
                      <Image source={{ uri: item.image }} style={styles.artistAvatar} />
                    ) : (
                      <View style={styles.artistAvatarPlaceholder}>
                        <Text style={{ fontSize: 22 }}>🎤</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.artistName} numberOfLines={1}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
            />

            {/* ===================================================================== */}
            {/* 8. TOP BẢNG XẾP HẠNG                                                 */}
            {/* ===================================================================== */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Bảng xếp hạng Moodify</Text>
            </View>

            <View style={styles.rankList}>
              {allTracks.slice(0, 8).map((t, index) => {
                const isCurrent = currentTrack?.id === t.id;
                return (
                  <TouchableOpacity
                    key={t.id || index}
                    style={[styles.rankItem, isCurrent && styles.rankItemActive]}
                    onPress={() => playTrack(t)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.rankNumber, index < 3 && styles.rankNumberTop]}>
                      {index + 1}
                    </Text>

                    {t.imageUrl ? (
                      <Image source={{ uri: t.imageUrl }} style={styles.rankThumb} />
                    ) : (
                      <View style={styles.rankThumbPlaceholder}>
                        <Text style={{ fontSize: 14 }}>🎵</Text>
                      </View>
                    )}

                    <View style={styles.rankInfo}>
                      <Text style={[styles.rankTitle, isCurrent && styles.rankTitleActive]} numberOfLines={1}>
                        {t.name}
                      </Text>
                      <Text style={styles.rankArtist} numberOfLines={1}>
                        {t.artistName}
                      </Text>
                    </View>

                    <TouchableOpacity style={styles.rankMoreBtn}>
                      <Ionicons name="ellipsis-vertical" size={18} color="#6b7280" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ height: 110 }} />
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c0c10',
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#9ca3af',
    marginTop: 12,
    fontSize: 14,
  },

  // 1. Top Bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandLogo: {
    width: 26,
    height: 26,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    padding: 6,
  },

  // 2. Filter Pills
  filterRow: {
    paddingBottom: 10,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#1e1e28',
  },
  filterChipActive: {
    backgroundColor: '#8b5cf6',
  },
  filterChipText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },

  // 3. Quick Access Grid
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 8,
    marginTop: 4,
    marginBottom: 20,
  },
  quickCard: {
    width: (width - 40) / 2,
    height: 52,
    backgroundColor: '#1a1a24',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  quickCardActive: {
    backgroundColor: '#262638',
    borderWidth: 1,
    borderColor: '#8b5cf6',
  },
  quickImage: {
    width: 52,
    height: 52,
    backgroundColor: '#242432',
  },
  quickPlaceholder: {
    width: 52,
    height: 52,
    backgroundColor: '#242432',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickTitle: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 8,
  },
  quickPlayGhost: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },

  // 4. Spotlight Card
  spotlightContainer: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  spotlightCard: {
    height: 160,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#1e1b4b',
  },
  spotlightBgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    opacity: 0.5,
  },
  spotlightOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(12, 12, 16, 0.75)',
  },
  spotlightContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 16,
  },
  spotlightCover: {
    width: 128,
    height: 128,
    borderRadius: 12,
    backgroundColor: '#262638',
  },
  spotlightCoverPlaceholder: {
    width: 128,
    height: 128,
    borderRadius: 12,
    backgroundColor: '#262638',
    justifyContent: 'center',
    alignItems: 'center',
  },
  spotlightMeta: {
    flex: 1,
    justifyContent: 'center',
  },
  spotlightBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(139, 92, 246, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.5)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 6,
  },
  spotlightBadgeText: {
    color: '#c4b5fd',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  spotlightTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 2,
  },
  spotlightArtist: {
    color: '#cbd5e1',
    fontSize: 13,
    marginBottom: 10,
  },
  spotlightPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 6,
  },
  spotlightPlayBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '800',
  },

  // Section Headers
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
    marginTop: 6,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '800',
  },
  sectionLink: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '600',
  },

  // 5. Mood Cards
  moodScroll: {
    paddingHorizontal: 16,
    gap: 10,
    paddingBottom: 16,
  },
  moodCard: {
    width: 140,
    height: 70,
    borderRadius: 10,
    padding: 10,
    justifyContent: 'space-between',
  },
  moodIcon: {
    fontSize: 18,
  },
  moodName: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },

  // 6. Track Carousel
  horizontalList: {
    paddingHorizontal: 16,
    gap: 14,
    paddingBottom: 16,
  },
  trackCard: {
    width: 144,
  },
  cardImageContainer: {
    width: 144,
    height: 144,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#1f1f2e',
    position: 'relative',
    marginBottom: 8,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardPlayingBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: '#8b5cf6',
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTrackName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  cardArtistName: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 2,
  },

  // 7. Artist Carousel
  artistCard: {
    width: 96,
    alignItems: 'center',
  },
  artistAvatarWrapper: {
    width: 86,
    height: 86,
    borderRadius: 43,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#2e2e40',
    marginBottom: 8,
    backgroundColor: '#1f1f2e',
  },
  artistAvatar: {
    width: '100%',
    height: '100%',
  },
  artistAvatarPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  artistName: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },

  // 8. Rank List
  rankList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  rankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  rankItemActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
  },
  rankNumber: {
    width: 24,
    fontSize: 16,
    fontWeight: '700',
    color: '#6b7280',
    textAlign: 'center',
    marginRight: 10,
  },
  rankNumberTop: {
    color: '#a78bfa',
    fontSize: 18,
  },
  rankThumb: {
    width: 46,
    height: 46,
    borderRadius: 6,
    backgroundColor: '#1f1f2e',
    marginRight: 12,
  },
  rankThumbPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 6,
    backgroundColor: '#1f1f2e',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankInfo: {
    flex: 1,
  },
  rankTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  rankTitleActive: {
    color: '#a78bfa',
  },
  rankArtist: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 2,
  },
  rankMoreBtn: {
    padding: 8,
  },
});
