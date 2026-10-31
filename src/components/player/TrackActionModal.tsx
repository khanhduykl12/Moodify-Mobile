import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  Image,
  Share,
  Alert,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Track, Playlist } from '@/types';
import { usePlayer } from '@/context/PlayerContext';
import { useOffline } from '@/context/OfflineContext';
import { PlaylistApi } from '@/services/api';

interface TrackActionModalProps {
  visible: boolean;
  track: Track | null;
  onClose: () => void;
}

export const TrackActionModal: React.FC<TrackActionModalProps> = ({ visible, track, onClose }) => {
  const { playTrack, isLiked, toggleLikeTrack } = usePlayer();
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const { isTrackDownloaded, isDownloading, downloadTrack, deleteOfflineTrack, downloadProgressMap } = useOffline();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);

  if (!track) return null;

  const trackKey = track.spotifyId || track.id;
  const liked = isLiked(trackKey);

  const downloaded = isTrackDownloaded(track.id);
  const downloading = isDownloading(track.id);
  const progress = downloadProgressMap[track.id] || 0;

  const handleToggleOffline = () => {
    if (downloading) return;
    if (downloaded) {
      Alert.alert('Xóa bài hát ngoại tuyến', `Bạn có muốn xóa "${track.name}" khỏi bộ nhớ ngoại tuyến?`, [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: () => {
            deleteOfflineTrack(track.id);
            onClose();
          },
        },
      ]);
    } else {
      downloadTrack(track);
      onClose();
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `🎵 Đang nghe bài hát "${track.name}" của ${track.artistName} trên ứng dụng Moodify! Cùng thưởng thức nào: http://localhost:3000/track/${track.id || track.spotifyId}`,
        title: track.name,
      });
    } catch (err) {
      console.warn('Lỗi chia sẻ:', err);
    }
  };

  const handleOpenPlaylistPicker = () => {
    setLoadingPlaylists(true);
    setShowPlaylistPicker(true);
    PlaylistApi.getMyPlaylists()
      .then((res) => setPlaylists(res || []))
      .catch(() => setPlaylists([]))
      .finally(() => setLoadingPlaylists(false));
  };

  const handleAddToPlaylist = async (pl: Playlist) => {
    try {
      await PlaylistApi.addTrackToPlaylist(pl.id, trackKey);
      Alert.alert('Thành công', `Đã thêm "${track.name}" vào "${pl.name}"!`);
      setShowPlaylistPicker(false);
      onClose();
    } catch {
      Alert.alert('Thông báo', 'Không thể thêm bài hát vào danh sách phát (có thể bài hát đã có trong playlist).');
    }
  };

  return (
    <>
      <Modal visible={visible && !showPlaylistPicker} animationType="slide" transparent={true} onRequestClose={onClose}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity style={styles.sheet} activeOpacity={1}>
            <View style={styles.handle} />

            {/* Track Info Header */}
            <View style={styles.trackHeader}>
              {track.imageUrl ? (
                <Image source={{ uri: track.imageUrl }} style={styles.cover} />
              ) : (
                <View style={styles.coverPlaceholder}>
                  <Text style={{ fontSize: 20 }}>🎵</Text>
                </View>
              )}
              <View style={styles.info}>
                <Text style={styles.trackName} numberOfLines={1}>
                  {track.name}
                </Text>
                <Text style={styles.artistName} numberOfLines={1}>
                  {track.artistName}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            {/* Action Items */}
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => {
                playTrack(track);
                onClose();
              }}
            >
              <Ionicons name="play-circle-outline" size={24} color="#8b5cf6" />
              <Text style={styles.actionText}>Phát ngay</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => {
                toggleLikeTrack(track);
              }}
            >
              <Ionicons
                name={liked ? 'heart' : 'heart-outline'}
                size={24}
                color={liked ? '#ec4899' : '#ffffff'}
              />
              <Text style={[styles.actionText, liked && { color: '#ec4899' }]}>
                {liked ? 'Đã yêu thích bài hát này' : 'Thêm vào Bài hát đã thích'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionItem} onPress={handleToggleOffline}>
              {downloading ? (
                <ActivityIndicator size="small" color="#38bdf8" />
              ) : (
                <Ionicons
                  name={downloaded ? 'arrow-down-circle' : 'arrow-down-circle-outline'}
                  size={24}
                  color={downloaded ? '#34d399' : '#38bdf8'}
                />
              )}
              <Text style={[styles.actionText, downloaded && { color: '#34d399' }]}>
                {downloading
                  ? `Đang tải ngoại tuyến (${progress}%)...`
                  : downloaded
                  ? 'Đã tải về máy (Nhấn để xóa)'
                  : 'Tải về nghe Offline (Mã hóa)'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionItem} onPress={handleOpenPlaylistPicker}>
              <Ionicons name="add-circle-outline" size={24} color="#ffffff" />
              <Text style={styles.actionText}>Thêm vào danh sách phát...</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionItem} onPress={handleShare}>
              <Ionicons name="share-social-outline" size={24} color="#ffffff" />
              <Text style={styles.actionText}>Chia sẻ bài hát</Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>Đóng</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Nested Playlist Picker Modal */}
      <Modal
        visible={showPlaylistPicker}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowPlaylistPicker(false)}
      >
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Thêm vào danh sách phát</Text>
            <Text style={styles.pickerSubtitle}>Chọn playlist để lưu bài hát "{track.name}"</Text>

            {loadingPlaylists ? (
              <Text style={styles.loadingText}>Đang tải danh sách playlist...</Text>
            ) : playlists.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>Chưa có danh sách phát nào trong tài khoản.</Text>
              </View>
            ) : (
              <FlatList
                data={playlists}
                keyExtractor={(item) => item.id}
                style={{ maxHeight: 250, marginVertical: 8 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.playlistItem}
                    onPress={() => handleAddToPlaylist(item)}
                  >
                    <Ionicons name="musical-note" size={20} color="#8b5cf6" style={{ marginRight: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.playlistName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.playlistCount}>{item.trackCount || 0} bài hát</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#6b7280" />
                  </TouchableOpacity>
                )}
              />
            )}

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowPlaylistPicker(false)}>
              <Text style={styles.cancelBtnText}>Hủy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#161622',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#374151',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  trackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cover: {
    width: 52,
    height: 52,
    borderRadius: 8,
  },
  coverPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: '#262636',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    marginLeft: 14,
    flex: 1,
  },
  trackName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  artistName: {
    fontSize: 13,
    color: '#9ca3af',
  },
  divider: {
    height: 1,
    backgroundColor: '#262636',
    marginVertical: 10,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  actionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    marginLeft: 14,
  },
  closeBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 6,
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#9ca3af',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  pickerCard: {
    width: '100%',
    backgroundColor: '#1a1a28',
    borderRadius: 16,
    padding: 20,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
  },
  pickerSubtitle: {
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 12,
  },
  loadingText: {
    color: '#9ca3af',
    marginVertical: 20,
    textAlign: 'center',
  },
  emptyBox: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 13,
  },
  playlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#262636',
  },
  playlistName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  playlistCount: {
    color: '#9ca3af',
    fontSize: 12,
  },
  cancelBtn: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#262636',
    borderRadius: 8,
  },
  cancelBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
});
