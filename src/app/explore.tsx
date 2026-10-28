import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  Dimensions,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TrackApi } from '@/services/api';
import { Track } from '@/types';
import { usePlayer } from '@/context/PlayerContext';
import { TrackActionModal } from '@/components/player/TrackActionModal';

const { width } = Dimensions.get('window');

const BROWSE_CATEGORIES = [
  { id: '1', title: 'V-Pop Thịnh Hành', color: '#881337', icon: '🎤', genre: 'vpop' },
  { id: '2', title: 'Rap Việt / Flow', color: '#78350f', icon: '🔥', genre: 'hiphop' },
  { id: '3', title: 'Indie & Chill', color: '#581c87', icon: '🎸', genre: 'indie' },
  { id: '4', title: 'Tâm Trạng / Buồn', color: '#831843', icon: '💔', genre: 'sad' },
  { id: '5', title: 'Thư Giãn / Cafe', color: '#14532d', icon: '🌙', genre: 'acoustic' },
  { id: '6', title: 'Tập Trung / Deep', color: '#1e3a8a', icon: '☕', genre: 'focus' },
  { id: '7', title: 'Party / EDM / Remix', color: '#0369a1', icon: '🎉', genre: 'remix' },
  { id: '8', title: 'Bảng Xếp Hạng Hit', color: '#431407', icon: '🏆', genre: 'top' },
];

const AI_MOOD_PRESETS = [
  { label: '🌧️ Buồn & Lắng đọng', query: 'Buồn, cô đơn, mưa rơi' },
  { label: '⚡ Năng lượng cực đại', query: 'Năng lượng, thể thao, bốc' },
  { label: '🌙 Chữa lành đêm khuya', query: 'Thư giãn, acoustic, êm dịu' },
  { label: '💖 Hạnh phúc yêu đời', query: 'Vui tươi, tình yêu, yêu đời' },
  { label: '☕ Tập trung làm việc', query: 'Tập trung, lofi, deep work' },
];

export default function SearchScreen() {
  const { playTrack, currentTrack } = usePlayer();
  const [searchMode, setSearchMode] = useState<'standard' | 'mood'>('standard');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [actionTrack, setActionTrack] = useState<Track | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        if (searchMode === 'mood') {
          const moodTracks = await TrackApi.getTracksByMood(query.trim(), 30);
          if (moodTracks && moodTracks.length > 0) {
            setResults(moodTracks);
          } else {
            const data = await TrackApi.searchTracks(query.trim(), 0, 30);
            setResults(data.content || []);
          }
        } else {
          const data = await TrackApi.searchTracks(query.trim(), 0, 30);
          setResults(data.content || []);
        }
      } catch (err) {
        console.warn('Lỗi tìm kiếm:', err);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query, searchMode]);

  const handleCategoryPress = (category: typeof BROWSE_CATEGORIES[0]) => {
    setSearchMode('standard');
    setQuery(category.title.split(' ')[0]);
  };

  const handleMoodPresetPress = (presetQuery: string) => {
    setSearchMode('mood');
    setQuery(presetQuery);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header Title */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Tìm kiếm</Text>
          <View style={styles.modeSwitch}>
            <TouchableOpacity
              style={[styles.modeBtn, searchMode === 'standard' && styles.modeBtnActive]}
              onPress={() => setSearchMode('standard')}
            >
              <Text style={[styles.modeBtnText, searchMode === 'standard' && styles.modeBtnTextActive]}>
                Bài hát / Ca sĩ
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, searchMode === 'mood' && styles.modeBtnActiveMood]}
              onPress={() => setSearchMode('mood')}
            >
              <Ionicons
                name="sparkles"
                size={13}
                color={searchMode === 'mood' ? '#ffffff' : '#a78bfa'}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.modeBtnText, searchMode === 'mood' && styles.modeBtnTextActive]}>
                Tâm trạng (AI)
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Input Box */}
        <View style={[styles.searchBar, searchMode === 'mood' && styles.searchBarMood]}>
          <Ionicons
            name={searchMode === 'mood' ? 'sparkles' : 'search'}
            size={20}
            color={searchMode === 'mood' ? '#8b5cf6' : '#121216'}
            style={{ marginRight: 8 }}
          />
          <TextInput
            style={styles.searchInput}
            placeholder={
              searchMode === 'mood'
                ? 'Nhập tâm trạng bạn cảm thấy (vd: Hôm nay tôi buồn...)'
                : 'Bạn muốn nghe bài hát hay nghệ sĩ nào?'
            }
            placeholderTextColor="#6b7280"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
          />
          {query !== '' && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color="#6b7280" />
            </TouchableOpacity>
          )}
        </View>

        {/* AI Mood Suggestion Chips */}
        {searchMode === 'mood' && query === '' && (
          <View style={styles.moodPresetsContainer}>
            <Text style={styles.moodPresetsTitle}>✨ Gợi ý tâm trạng phổ biến:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moodPresetsScroll}>
              {AI_MOOD_PRESETS.map((preset, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.moodPresetChip}
                  onPress={() => handleMoodPresetPress(preset.query)}
                >
                  <Text style={styles.moodPresetText}>{preset.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Search Results or Browse Categories */}
        {query.trim() !== '' ? (
          searching ? (
            <View style={styles.centerBox}>
              <ActivityIndicator color="#8b5cf6" size="large" />
              <Text style={styles.hintText}>
                {searchMode === 'mood' ? 'AI đang phân tích cảm xúc & tìm giai điệu...' : 'Đang tìm kiếm bài hát...'}
              </Text>
            </View>
          ) : results.length === 0 ? (
            <View style={styles.centerBox}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🔍</Text>
              <Text style={styles.notFoundTitle}>Không tìm thấy kết quả</Text>
              <Text style={styles.hintText}>Thử tìm từ khóa khác hoặc tâm trạng khác</Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.resultList}
              ListHeaderComponent={
                searchMode === 'mood' ? (
                  <View style={styles.aiBadge}>
                    <Ionicons name="sparkles" size={14} color="#a78bfa" style={{ marginRight: 6 }} />
                    <Text style={styles.aiBadgeText}>
                      Đề xuất bởi AI Emotion: {results.length} bài hát phù hợp
                    </Text>
                  </View>
                ) : undefined
              }
              renderItem={({ item }) => {
                const isCurrent = currentTrack?.id === item.id;
                return (
                  <TouchableOpacity
                    style={[styles.resultItem, isCurrent && styles.resultItemActive]}
                    onPress={() => playTrack(item, results)}
                    activeOpacity={0.7}
                  >
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={styles.resultCover} />
                    ) : (
                      <View style={styles.resultCoverPlaceholder}>
                        <Text style={{ fontSize: 16 }}>🎵</Text>
                      </View>
                    )}
                    <View style={styles.resultInfo}>
                      <Text style={[styles.resultTitle, isCurrent && styles.resultTitleActive]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.resultArtist} numberOfLines={1}>
                        {item.artistName} {item.albumName ? `• ${item.albumName}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.moreBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      onPress={() => setActionTrack(item)}
                    >
                      <Ionicons name="ellipsis-vertical" size={18} color="#9ca3af" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              }}
            />
          )
        ) : (
          <FlatList
            data={BROWSE_CATEGORIES}
            keyExtractor={(item) => item.id}
            numColumns={2}
            contentContainerStyle={styles.categoryGrid}
            columnWrapperStyle={styles.categoryRow}
            ListHeaderComponent={
              <Text style={styles.browseTitle}>Duyệt tìm thể loại & tâm trạng</Text>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.categoryCard, { backgroundColor: item.color }]}
                onPress={() => handleCategoryPress(item)}
                activeOpacity={0.8}
              >
                <Text style={styles.categoryCardTitle}>{item.title}</Text>
                <Text style={styles.categoryCardIcon}>{item.icon}</Text>
              </TouchableOpacity>
            )}
          />
        )}

        {/* Track Action Modal */}
        <TrackActionModal
          visible={!!actionTrack}
          track={actionTrack}
          onClose={() => setActionTrack(null)}
        />
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
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 8,
  },
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: '#1c1c28',
    borderRadius: 10,
    padding: 3,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
  },
  modeBtnActive: {
    backgroundColor: '#374151',
  },
  modeBtnActiveMood: {
    backgroundColor: '#7c3aed',
  },
  modeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9ca3af',
  },
  modeBtnTextActive: {
    color: '#ffffff',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 12,
  },
  searchBarMood: {
    borderColor: '#8b5cf6',
    borderWidth: 1.5,
    backgroundColor: '#ffffff',
  },
  searchInput: {
    flex: 1,
    color: '#121216',
    fontSize: 13,
    fontWeight: '600',
  },
  moodPresetsContainer: {
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  moodPresetsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#c4b5fd',
    marginBottom: 8,
  },
  moodPresetsScroll: {
    gap: 8,
  },
  moodPresetChip: {
    backgroundColor: '#2e1065',
    borderColor: '#7c3aed',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  moodPresetText: {
    fontSize: 12,
    color: '#e9d5ff',
    fontWeight: '600',
  },
  browseTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 14,
  },
  categoryGrid: {
    paddingHorizontal: 16,
    paddingBottom: 90,
  },
  categoryRow: {
    gap: 12,
    marginBottom: 12,
  },
  categoryCard: {
    width: (width - 44) / 2,
    height: 90,
    borderRadius: 8,
    padding: 12,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  categoryCardTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  categoryCardIcon: {
    fontSize: 24,
    alignSelf: 'flex-end',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  notFoundTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  hintText: {
    color: '#9ca3af',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2e1065',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
    borderColor: '#6d28d9',
    borderWidth: 1,
  },
  aiBadgeText: {
    fontSize: 12,
    color: '#d8b4fe',
    fontWeight: '700',
  },
  resultList: {
    paddingHorizontal: 16,
    paddingBottom: 110,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a24',
  },
  resultItemActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 6,
  },
  resultCover: {
    width: 48,
    height: 48,
    borderRadius: 6,
    marginRight: 12,
  },
  resultCoverPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#1f1f2e',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  resultInfo: {
    flex: 1,
  },
  resultTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  resultTitleActive: {
    color: '#a78bfa',
  },
  resultArtist: {
    color: '#9ca3af',
    fontSize: 12,
  },
  moreBtn: {
    padding: 8,
  },
});
