// Kho bài Karaoke — port từ karaoke-track-catalog.tsx của web
// Search debounce 250ms + cuộn tải thêm trang (FlatList)

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KaraokeApi } from '@/services/api';
import type { KaraokeTrackSummary } from '@/types';

type Props = {
  selectedSongId: string | null;
  onSelect: (track: KaraokeTrackSummary) => void;
  pageSize?: number;
};

function formatDuration(durationMs: number | null): string {
  if (!durationMs || durationMs < 0) return '--:--';
  const seconds = Math.floor(durationMs / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function getInitials(title: string): string {
  const parts = title.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '');
  const initials = parts.join('').toUpperCase();
  return initials || '♫';
}

export const KaraokeTrackCatalog: React.FC<Props> = ({ selectedSongId, onSelect, pageSize = 10 }) => {
  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState<KaraokeTrackSummary[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  // Search debounce 250ms — đổi query về trang 0
  useEffect(() => {
    const timer = setTimeout(() => {
      let cancelled = false;
      setLoading(true);
      setError('');
      KaraokeApi.getTracks(0, pageSize, query.trim() || undefined)
        .then((result) => {
          if (cancelled) return;
          setTracks(result.content || []);
          setPage(0);
          setTotalPages(result.totalPages || 1);
          setTotalElements(result.totalElements || 0);
        })
        .catch((reason: unknown) => {
          if (cancelled) return;
          setError(reason instanceof Error ? reason.message : 'Không thể tải danh sách bài Karaoke.');
          setTracks([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, query ? 250 : 0);

    return () => clearTimeout(timer);
  }, [query, pageSize]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || page + 1 >= totalPages) return;
    setLoadingMore(true);
    try {
      const result = await KaraokeApi.getTracks(page + 1, pageSize, query.trim() || undefined);
      setTracks((current) => {
        const seen = new Set(current.map((t) => t.songId));
        return [...current, ...(result.content || []).filter((t) => !seen.has(t.songId))];
      });
      setPage(page + 1);
      setTotalPages(result.totalPages || 1);
    } catch {
      // giữ nguyên danh sách hiện tại khi tải thêm lỗi
    } finally {
      setLoadingMore(false);
    }
  }, [loading, loadingMore, page, pageSize, query, totalPages]);

  const renderItem = useCallback(({ item, index }: { item: KaraokeTrackSummary; index: number }) => {
    const selected = selectedSongId === item.songId;
    return (
      <TouchableOpacity
        style={[styles.track, selected && styles.trackSelected]}
        activeOpacity={0.7}
        onPress={() => onSelect(item)}
      >
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.cover} />
        ) : (
          <View style={styles.coverFallback}>
            <Text style={styles.coverInitials}>{getInitials(item.title)}</Text>
          </View>
        )}
        <View style={styles.trackCopy}>
          <Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.trackArtist} numberOfLines={1}>{item.artist || 'Chưa rõ nghệ sĩ'}</Text>
        </View>
        <View style={styles.trackMeta}>
          {item.scoringAvailable && (
            <View style={styles.scoringBadge}>
              <Ionicons name="mic" size={10} color="#10b981" />
              <Text style={styles.scoringBadgeText}>Chấm điểm</Text>
            </View>
          )}
          <Text style={styles.trackDuration}>{formatDuration(item.durationMs)}</Text>
        </View>
      </TouchableOpacity>
    );
  }, [selectedSongId, onSelect]);

  return (
    <View style={styles.catalog}>
      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color="#6b7280" />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Tìm bài hát, ca sĩ..."
            placeholderTextColor="#6b7280"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color="#6b7280" />
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.count}>{loading ? 'Đang tải...' : `${totalElements} bài hát`}</Text>
      </View>

      {error ? (
        <View style={styles.state}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : loading && tracks.length === 0 ? (
        <View style={styles.state}>
          <ActivityIndicator color="#8b5cf6" />
          <Text style={styles.stateText}>Đang tải kho bài hát Karaoke...</Text>
        </View>
      ) : tracks.length === 0 ? (
        <View style={styles.state}>
          <Text style={styles.stateText}>Không tìm thấy bài Karaoke phù hợp.</Text>
        </View>
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={(item) => item.songId}
          renderItem={renderItem}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoading}>
                <ActivityIndicator color="#8b5cf6" size="small" />
              </View>
            ) : undefined
          }
          style={styles.list}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  catalog: {
    backgroundColor: '#1f1f2e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#383854',
    overflow: 'hidden',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0c0c10',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#383854',
    paddingHorizontal: 10,
    height: 38,
  },
  searchInput: {
    flex: 1,
    color: '#f3f4f6',
    fontSize: 14,
    padding: 0,
  },
  count: {
    color: '#9ca3af',
    fontSize: 12,
  },
  list: {
    maxHeight: 380,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  trackSelected: {
    backgroundColor: '#262638',
    borderLeftColor: '#8b5cf6',
  },
  cover: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#0c0c10',
  },
  coverFallback: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#0c0c10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverInitials: {
    color: '#8b5cf6',
    fontSize: 15,
    fontWeight: '700',
  },
  trackCopy: {
    flex: 1,
    gap: 2,
  },
  trackTitle: {
    color: '#f3f4f6',
    fontSize: 14,
    fontWeight: '600',
  },
  trackArtist: {
    color: '#9ca3af',
    fontSize: 12,
  },
  trackMeta: {
    alignItems: 'flex-end',
    gap: 4,
  },
  scoringBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  scoringBadgeText: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '600',
  },
  trackDuration: {
    color: '#9ca3af',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  state: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 32,
  },
  stateText: {
    color: '#9ca3af',
    fontSize: 13,
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  footerLoading: {
    paddingVertical: 12,
  },
});
