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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TrackApi } from '@/services/api';
import { Track } from '@/types';
import { usePlayer } from '@/context/PlayerContext';

const { width } = Dimensions.get('window');

const BROWSE_CATEGORIES = [
  { id: '1', title: 'V-Pop', color: '#881337', icon: '🎤' },
  { id: '2', title: 'Rap Việt', color: '#78350f', icon: '🔥' },
  { id: '3', title: 'Indie Việt', color: '#581c87', icon: '🎸' },
  { id: '4', title: 'Tâm Trạng', color: '#831843', icon: '💔' },
  { id: '5', title: 'Thư Giãn', color: '#14532d', icon: '🌙' },
  { id: '6', title: 'Tập Trung', color: '#1e3a8a', icon: '☕' },
  { id: '7', title: 'Party / EDM', color: '#0369a1', icon: '🎉' },
  { id: '8', title: 'Bảng Xếp Hạng', color: '#431407', icon: '🏆' },
];

export default function SearchScreen() {
  const { playTrack, currentTrack } = usePlayer();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await TrackApi.searchTracks(query.trim(), 0, 30);
        setResults(data.content || []);
      } catch (err) {
        console.warn('Lỗi tìm kiếm:', err);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header Title */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Tìm kiếm</Text>
          <TouchableOpacity style={styles.cameraBtn}>
            <Ionicons name="camera-outline" size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Search Input Box */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#121216" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Bạn muốn nghe bài gì?"
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

        {/* Search Results or Browse Categories */}
        {query.trim() !== '' ? (
          searching ? (
            <View style={styles.centerBox}>
              <ActivityIndicator color="#8b5cf6" size="large" />
              <Text style={styles.hintText}>Đang tìm kiếm bài hát...</Text>
            </View>
          ) : results.length === 0 ? (
            <View style={styles.centerBox}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🔍</Text>
              <Text style={styles.notFoundTitle}>Không tìm thấy kết quả</Text>
              <Text style={styles.hintText}>Thử tìm từ khóa khác hoặc tên nghệ sĩ</Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.resultList}
              renderItem={({ item }) => {
                const isCurrent = currentTrack?.id === item.id;
                return (
                  <TouchableOpacity
                    style={[styles.resultItem, isCurrent && styles.resultItemActive]}
                    onPress={() => playTrack(item)}
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
                    <Ionicons name="play-circle-outline" size={26} color="#8b5cf6" />
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
              <Text style={styles.browseTitle}>Duyệt tìm tất cả</Text>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.categoryCard, { backgroundColor: item.color }]}
                onPress={() => setQuery(item.title)}
                activeOpacity={0.8}
              >
                <Text style={styles.categoryCardTitle}>{item.title}</Text>
                <Text style={styles.categoryCardIcon}>{item.icon}</Text>
              </TouchableOpacity>
            )}
          />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#ffffff',
  },
  cameraBtn: {
    padding: 6,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    color: '#121216',
    fontSize: 14,
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
    position: 'relative',
    overflow: 'hidden',
  },
  categoryCardTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  categoryCardIcon: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    fontSize: 26,
    transform: [{ rotate: '15deg' }],
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 60,
  },
  notFoundTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  hintText: {
    color: '#9ca3af',
    fontSize: 13,
  },
  resultList: {
    paddingHorizontal: 16,
    paddingBottom: 90,
    gap: 8,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  resultItemActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
  },
  resultCover: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#1f1f2e',
    marginRight: 12,
  },
  resultCoverPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#1f1f2e',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  resultInfo: {
    flex: 1,
  },
  resultTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  resultTitleActive: {
    color: '#a78bfa',
  },
  resultArtist: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 2,
  },
});
