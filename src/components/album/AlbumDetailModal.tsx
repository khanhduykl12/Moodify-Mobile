import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  Image,
  FlatList,
  ActivityIndicator,
  Alert,
  Share,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AlbumApi } from '@/services/api';
import { Album, Track } from '@/types';
import { usePlayer } from '@/context/PlayerContext';
import { TrackActionModal } from '@/components/player/TrackActionModal';

const { width } = Dimensions.get('window');

function formatDuration(ms?: number): string {
  if (!ms) return '3:20';
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

interface AlbumDetailModalProps {
  visible: boolean;
  albumId: number | null;
  onClose: () => void;
}

export const AlbumDetailModal: React.FC<AlbumDetailModalProps> = ({ visible, albumId, onClose }) => {
  const { playTrack, currentTrack, isPlaying } = usePlayer();
  const [album, setAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionTrack, setActionTrack] = useState<Track | null>(null);

  useEffect(() => {
    if (visible && albumId) {
      setLoading(true);
      AlbumApi.getAlbumDetail(albumId)
        .then((data) => {
          setAlbum(data);
        })
        .catch(() => {
          Alert.alert('Lỗi', 'Không thể tải chi tiết album.');
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setAlbum(null);
    }
  }, [visible, albumId]);

  const handlePlayAll = () => {
    if (album?.tracks && album.tracks.length > 0) {
      playTrack(album.tracks[0], album.tracks);
    }
  };

  const handleShufflePlay = () => {
    if (album?.tracks && album.tracks.length > 0) {
      const shuffled = [...album.tracks].sort(() => Math.random() - 0.5);
      playTrack(shuffled[0], shuffled);
    }
  };

  const handleShareAlbum = async () => {
    if (!album) return;
    try {
      await Share.share({
        message: `💿 Cùng nghe album "${album.title}" của ${album.authorName || 'Moodify'} trên ứng dụng Moodify!`,
        title: album.title,
      });
    } catch (err) {
      console.warn('Lỗi chia sẻ album:', err);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          {/* Header Bar */}
          <View style={styles.topHeader}>
            <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
              <Ionicons name="chevron-down" size={28} color="#ffffff" />
            </TouchableOpacity>

            <Text style={styles.headerTitle} numberOfLines={1}>
              {album?.title || 'Chi tiết Album'}
            </Text>

            <TouchableOpacity onPress={handleShareAlbum} style={styles.headerBtn}>
              <Ionicons name="share-social-outline" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color="#8b5cf6" />
              <Text style={styles.loadingText}>Đang tải giai điệu album...</Text>
            </View>
          ) : album ? (
            <FlatList
              data={album.tracks || []}
              keyExtractor={(item, index) => `${item.id || index}_${index}`}
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={
                <View style={styles.bannerContainer}>
                  {/* Artwork with glow shadow */}
                  <View style={styles.artworkWrapper}>
                    {album.coverUrl ? (
                      <Image source={{ uri: album.coverUrl }} style={styles.artwork} />
                    ) : (
                      <View style={styles.artworkPlaceholder}>
                        <Ionicons name="disc" size={60} color="#8b5cf6" />
                      </View>
                    )}
                  </View>

                  <Text style={styles.albumTitle} numberOfLines={2}>
                    {album.title}
                  </Text>

                  <View style={styles.metaRow}>
                    <Ionicons name="person-circle" size={18} color="#a78bfa" style={{ marginRight: 4 }} />
                    <Text style={styles.authorName}>
                      {album.authorName || 'Nghệ sĩ Moodify'}
                    </Text>
                    <Text style={styles.metaDot}>•</Text>
                    <Text style={styles.releaseYear}>
                      {album.releaseDate ? album.releaseDate.substring(0, 4) : '2026'}
                    </Text>
                    <Text style={styles.metaDot}>•</Text>
                    <Text style={styles.trackCountText}>
                      {album.tracks?.length || album.trackCount || 0} bài hát
                    </Text>
                  </View>

                  {album.description ? (
                    <Text style={styles.albumDesc} numberOfLines={3}>
                      {album.description}
                    </Text>
                  ) : null}

                  {/* Play & Shuffle buttons */}
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.playAllBtn}
                      activeOpacity={0.8}
                      onPress={handlePlayAll}
                    >
                      <Ionicons name="play" size={20} color="#000000" />
                      <Text style={styles.playAllText}>Phát tất cả</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.shuffleBtn}
                      activeOpacity={0.8}
                      onPress={handleShufflePlay}
                    >
                      <Ionicons name="shuffle" size={20} color="#ffffff" />
                      <Text style={styles.shuffleText}>Trộn bài</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              }
              renderItem={({ item, index }) => {
                const isCurrent = currentTrack?.id === item.id;
                return (
                  <TouchableOpacity
                    style={[styles.trackRow, isCurrent && styles.trackRowActive]}
                    onPress={() => playTrack(item, album.tracks)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.trackNumber, isCurrent && styles.trackNumberActive]}>
                      {index + 1}
                    </Text>

                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={styles.trackThumb} />
                    ) : (
                      <View style={styles.trackThumbPlaceholder}>
                        <Ionicons name="musical-note" size={16} color="#8b5cf6" />
                      </View>
                    )}

                    <View style={styles.trackInfo}>
                      <Text style={[styles.trackName, isCurrent && styles.trackNameActive]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.trackArtist} numberOfLines={1}>
                        {item.artistName}
                      </Text>
                    </View>

                    <Text style={styles.trackDuration}>{formatDuration(item.durationMs)}</Text>

                    <TouchableOpacity
                      style={styles.moreBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={() => setActionTrack(item)}
                    >
                      <Ionicons name="ellipsis-vertical" size={16} color="#9ca3af" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              }}
            />
          ) : (
            <View style={styles.centerLoading}>
              <Text style={{ color: '#9ca3af' }}>Không tìm thấy thông tin album.</Text>
            </View>
          )}

          {/* Action Modal for individual tracks */}
          <TrackActionModal
            visible={!!actionTrack}
            track={actionTrack}
            onClose={() => setActionTrack(null)}
          />
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c0c10',
  },
  safeArea: {
    flex: 1,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e28',
  },
  headerBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#9ca3af',
    marginTop: 12,
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 110,
  },
  bannerContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e28',
    marginBottom: 16,
  },
  artworkWrapper: {
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    marginBottom: 16,
  },
  artwork: {
    width: width * 0.52,
    height: width * 0.52,
    borderRadius: 14,
  },
  artworkPlaceholder: {
    width: width * 0.52,
    height: width * 0.52,
    borderRadius: 14,
    backgroundColor: '#1f1f2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  authorName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#c4b5fd',
  },
  metaDot: {
    color: '#6b7280',
    marginHorizontal: 6,
    fontSize: 12,
  },
  releaseYear: {
    color: '#9ca3af',
    fontSize: 13,
  },
  trackCountText: {
    color: '#9ca3af',
    fontSize: 13,
  },
  albumDesc: {
    color: '#9ca3af',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  playAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 6,
  },
  playAllText: {
    color: '#000000',
    fontWeight: '800',
    fontSize: 14,
  },
  shuffleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#262636',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 6,
  },
  shuffleText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  trackRowActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
  },
  trackNumber: {
    width: 26,
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  trackNumberActive: {
    color: '#a78bfa',
  },
  trackThumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
    marginRight: 12,
  },
  trackThumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#1f1f2e',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  trackInfo: {
    flex: 1,
  },
  trackName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 3,
  },
  trackNameActive: {
    color: '#a78bfa',
  },
  trackArtist: {
    fontSize: 12,
    color: '#9ca3af',
  },
  trackDuration: {
    fontSize: 12,
    color: '#6b7280',
    marginRight: 8,
  },
  moreBtn: {
    padding: 6,
  },
});
