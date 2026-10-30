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
  Share,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ArtistApi, TrackApi } from '@/services/api';
import { Artist, Track } from '@/types';
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

interface ArtistDetailModalProps {
  visible: boolean;
  artistName: string | null;
  artistImage?: string | null;
  onClose: () => void;
}

export const ArtistDetailModal: React.FC<ArtistDetailModalProps> = ({
  visible,
  artistName,
  artistImage,
  onClose,
}) => {
  const { playTrack, currentTrack } = usePlayer();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isFollowed, setIsFollowed] = useState<boolean>(false);
  const [actionTrack, setActionTrack] = useState<Track | null>(null);

  useEffect(() => {
    if (visible && artistName) {
      setLoading(true);
      // Lấy danh sách bài hát của nghệ sĩ thông qua tìm kiếm bài hát hoặc artist tracks
      TrackApi.searchTracks(artistName, 0, 30)
        .then((res) => {
          const list = (res.content || []).filter(
            (t) => t.artistName?.toLowerCase().includes(artistName.toLowerCase())
          );
          setTracks(list.length > 0 ? list : (res.content || []));
        })
        .catch(() => setTracks([]))
        .finally(() => setLoading(false));
    } else {
      setTracks([]);
    }
  }, [visible, artistName]);

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      playTrack(tracks[0], tracks);
    }
  };

  const handleShareArtist = async () => {
    if (!artistName) return;
    try {
      await Share.share({
        message: `🎤 Khám phá các ca khúc đỉnh cao của nghệ sĩ ${artistName} trên Moodify!`,
        title: artistName,
      });
    } catch (err) {
      console.warn('Lỗi chia sẻ nghệ sĩ:', err);
    }
  };

  const toggleFollow = () => {
    setIsFollowed((prev) => !prev);
  };

  if (!visible || !artistName) return null;

  const effectiveImage = artistImage || (tracks.length > 0 ? tracks[0].imageUrl : null);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          {/* Header */}
          <View style={styles.topHeader}>
            <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
              <Ionicons name="chevron-down" size={28} color="#ffffff" />
            </TouchableOpacity>

            <Text style={styles.headerTitle} numberOfLines={1}>
              {artistName}
            </Text>

            <TouchableOpacity onPress={handleShareArtist} style={styles.headerBtn}>
              <Ionicons name="share-social-outline" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color="#8b5cf6" />
              <Text style={styles.loadingText}>Đang tải thông tin nghệ sĩ...</Text>
            </View>
          ) : (
            <FlatList
              data={tracks}
              keyExtractor={(item, index) => `${item.id || index}_${index}`}
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={
                <View style={styles.bannerContainer}>
                  {/* Artist Avatar */}
                  <View style={styles.avatarWrapper}>
                    {effectiveImage ? (
                      <Image source={{ uri: effectiveImage }} style={styles.avatar} />
                    ) : (
                      <View style={styles.avatarPlaceholder}>
                        <Ionicons name="person" size={54} color="#8b5cf6" />
                      </View>
                    )}
                  </View>

                  <Text style={styles.artistNameTitle}>{artistName}</Text>

                  <View style={styles.artistBadgeRow}>
                    <View style={styles.verifiedBadge}>
                      <Ionicons name="checkmark-circle" size={14} color="#a78bfa" style={{ marginRight: 4 }} />
                      <Text style={styles.verifiedText}>Nghệ sĩ xác minh</Text>
                    </View>
                    <Text style={styles.trackTotalText}>{tracks.length} ca khúc phát hành</Text>
                  </View>

                  {/* Follow & Play Buttons */}
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.playAllBtn}
                      activeOpacity={0.8}
                      onPress={handlePlayAll}
                    >
                      <Ionicons name="play" size={20} color="#000000" />
                      <Text style={styles.playAllText}>Phát nhạc</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.followBtn, isFollowed && styles.followedBtn]}
                      activeOpacity={0.8}
                      onPress={toggleFollow}
                    >
                      <Ionicons
                        name={isFollowed ? 'heart' : 'heart-outline'}
                        size={18}
                        color={isFollowed ? '#ec4899' : '#ffffff'}
                      />
                      <Text style={[styles.followText, isFollowed && { color: '#ec4899' }]}>
                        {isFollowed ? 'Đang theo dõi' : 'Theo dõi'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.sectionHeaderTitle}>BÀI HÁT PHỔ BIẾN</Text>
                </View>
              }
              renderItem={({ item, index }) => {
                const isCurrent = currentTrack?.id === item.id;
                return (
                  <TouchableOpacity
                    style={[styles.trackRow, isCurrent && styles.trackRowActive]}
                    onPress={() => playTrack(item, tracks)}
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
                      <Text style={styles.albumName} numberOfLines={1}>
                        {item.albumName || artistName}
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
          )}

          {/* Action Modal */}
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
    marginBottom: 12,
  },
  avatarWrapper: {
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    marginBottom: 14,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#1f1f2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  artistNameTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 6,
  },
  artistBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2e1065',
    borderColor: '#7c3aed',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  verifiedText: {
    color: '#e9d5ff',
    fontSize: 11,
    fontWeight: '700',
  },
  trackTotalText: {
    color: '#9ca3af',
    fontSize: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  playAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 6,
  },
  playAllText: {
    color: '#000000',
    fontWeight: '800',
    fontSize: 14,
  },
  followBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#262636',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 6,
  },
  followedBtn: {
    borderColor: '#ec4899',
    borderWidth: 1,
    backgroundColor: '#2e1065',
  },
  followText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  sectionHeaderTitle: {
    alignSelf: 'flex-start',
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 8,
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
  albumName: {
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
