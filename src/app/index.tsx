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

// Danh mục Vibe / Thể loại lấy cảm hứng từ Moodify Web
const FILTER_CHIPS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'vpop', label: 'V-Pop' },
  { id: 'hiphop', label: 'Hip-Hop' },
  { id: 'indie', label: 'Indie' },
  { id: 'remix', label: 'Remix/EDM' },
];

export default function HomeScreen() {
  const { playTrack, currentTrack, isPlaying } = usePlayer();
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allTracks, setAllTracks] = useState<Track[]>([]);

  // Tải danh sách bài hát từ Backend Spring Boot
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

  // Lọc bài hát theo thể loại đã chọn
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

  // 6 bài hát cho ô lưới Gần đây (Quick Access 2 cột x 3 hàng)
  const quickAccessTracks = useMemo(() => allTracks.slice(0, 6), [allTracks]);

  // Bài hát nổi bật cho Hero Banner
  const featuredTrack = useMemo(() => allTracks[0] || null, [allTracks]);

  // Danh sách nghệ sĩ duy nhất rút từ dữ liệu bài hát
  const featuredArtists = useMemo(() => {
    const map = new Map<string, { name: string; image?: string | null }>();
    allTracks.forEach((t) => {
      if (t.artistName && !map.has(t.artistName)) {
        map.set(t.artistName, { name: t.artistName, image: t.imageUrl });
      }
    });
    return Array.from(map.values()).slice(0, 10);
  }, [allTracks]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* ========================================================================= */}
        {/* 1. TOP HEADER (Avatar + Filter Chips)                                      */}
        {/* ========================================================================= */}
        <View style={styles.header}>
          {/* Avatar User */}
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>K</Text>
          </View>

          {/* Filter Chips Scroll */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
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

          {/* Bell / Search Icon */}
          <TouchableOpacity style={styles.headerIconBtn}>
            <Ionicons name="notifications-outline" size={22} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color="#6366f1" />
            <Text style={styles.loadingText}>Đang tải giai điệu từ Moodify...</Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />
            }
          >
            {/* ===================================================================== */}
            {/* 2. QUICK ACCESS GRID (2 Cột x 3 Hàng kiểu Spotify)                   */}
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
                        <View style={styles.quickImagePlaceholder}>
                          <Text style={{ fontSize: 16 }}>🎵</Text>
                        </View>
                      )}
                      <Text style={styles.quickTitle} numberOfLines={2}>
                        {item.name}
                      </Text>
                      {isCurrent && isPlaying && (
                        <Ionicons name="volume-high" size={16} color="#818cf8" style={{ marginRight: 8 }} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* ===================================================================== */}
            {/* 3. HERO / FEATURED BANNER CARD                                       */}
            {/* ===================================================================== */}
            {featuredTrack && (
              <View style={styles.bannerCard}>
                {featuredTrack.imageUrl && (
                  <Image source={{ uri: featuredTrack.imageUrl }} style={styles.bannerImage} />
                )}
                <View style={styles.bannerOverlay}>
                  <View style={styles.bannerBadge}>
                    <Text style={styles.bannerBadgeText}>GIAI ĐIỆU MỚI THỨ SÁU</Text>
                  </View>
                  <Text style={styles.bannerTitle} numberOfLines={2}>
                    {featuredTrack.name}
                  </Text>
                  <Text style={styles.bannerArtist} numberOfLines={1}>
                    {featuredTrack.artistName}
                  </Text>
                  <View style={styles.bannerActionRow}>
                    <TouchableOpacity
                      style={styles.bannerPlayBtn}
                      onPress={() => playTrack(featuredTrack)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="play" size={18} color="#000000" />
                      <Text style={styles.bannerPlayBtnText}>Nghe ngay</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {/* ===================================================================== */}
            {/* 4. CAROUSEL 1: Giai điệu thịnh hành                                 */}
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
                      <View style={styles.cardImagePlaceholder}>
                        <Text style={{ fontSize: 24 }}>🎵</Text>
                      </View>
                    )}
                    {currentTrack?.id === item.id && isPlaying && (
                      <View style={styles.playingBadge}>
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
            {/* 5. CAROUSEL 2: Nghệ sĩ nổi bật (Ảnh tròn)                           */}
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
                  {item.image ? (
                    <Image source={{ uri: item.image }} style={styles.artistImage} />
                  ) : (
                    <View style={styles.artistPlaceholder}>
                      <Text style={{ fontSize: 20 }}>🎤</Text>
                    </View>
                  )}
                  <Text style={styles.artistName} numberOfLines={1}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
            />

            {/* ===================================================================== */}
            {/* 6. TOP BẢNG XẾP HẠNG (List dọc 8 bài)                                */}
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
                    <Text
                      style={[
                        styles.rankNumber,
                        index < 3 && styles.rankNumberTop,
                      ]}
                    >
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
                      <Text
                        style={[styles.rankTitle, isCurrent && styles.rankTitleActive]}
                        numberOfLines={1}
                      >
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

            <View style={{ height: 100 }} />
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121216',
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
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

  // 1. Header & Filter Chips
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#121216',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15,
  },
  filterScroll: {
    gap: 8,
    paddingRight: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#23232e',
  },
  filterChipActive: {
    backgroundColor: '#818cf8',
  },
  filterChipText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#000000',
    fontWeight: '800',
  },
  headerIconBtn: {
    padding: 6,
    marginLeft: 4,
  },

  // 2. Quick Access Grid
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 8,
    marginTop: 8,
    marginBottom: 20,
  },
  quickCard: {
    width: (width - 40) / 2,
    height: 52,
    backgroundColor: '#20202c',
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  quickCardActive: {
    backgroundColor: '#2c2c3e',
    borderWidth: 1,
    borderColor: '#818cf8',
  },
  quickImage: {
    width: 52,
    height: 52,
    backgroundColor: '#2b2b3b',
  },
  quickImagePlaceholder: {
    width: 52,
    height: 52,
    backgroundColor: '#2b2b3b',
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

  // 3. Hero / Featured Banner
  bannerCard: {
    marginHorizontal: 16,
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
    backgroundColor: '#1e1b4b',
  },
  bannerImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    opacity: 0.65,
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    padding: 16,
    justifyContent: 'flex-end',
  },
  bannerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 6,
  },
  bannerBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  bannerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bannerArtist: {
    color: '#e2e8f0',
    fontSize: 13,
    marginTop: 2,
    marginBottom: 10,
  },
  bannerActionRow: {
    flexDirection: 'row',
  },
  bannerPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  bannerPlayBtnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '700',
  },

  // Section Headers
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
    marginTop: 10,
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

  // 4. Horizontal Track Carousel
  horizontalList: {
    paddingHorizontal: 16,
    gap: 14,
    paddingBottom: 8,
  },
  trackCard: {
    width: 144,
  },
  cardImageContainer: {
    width: 144,
    height: 144,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#23232e',
    position: 'relative',
    marginBottom: 8,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playingBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: '#6366f1',
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

  // 5. Artist Carousel
  artistCard: {
    width: 100,
    alignItems: 'center',
  },
  artistImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#23232e',
    marginBottom: 8,
  },
  artistPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#23232e',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  artistName: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },

  // 6. Rank List
  rankList: {
    paddingHorizontal: 16,
    gap: 12,
  },
  rankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  rankItemActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
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
    color: '#818cf8',
    fontSize: 18,
  },
  rankThumb: {
    width: 46,
    height: 46,
    borderRadius: 6,
    backgroundColor: '#23232e',
    marginRight: 12,
  },
  rankThumbPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 6,
    backgroundColor: '#23232e',
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
    color: '#818cf8',
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
