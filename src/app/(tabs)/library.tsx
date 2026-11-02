import React, { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Image,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PlaylistApi, UserLibraryApi, AlbumApi } from '@/services/api';
import { Storage } from '@/services/storage';
import { Playlist, Track, Album, OfflineTrack } from '@/types';
import { usePlayer } from '@/context/PlayerContext';
import { useOffline } from '@/context/OfflineContext';
import { TrackActionModal } from '@/components/player/TrackActionModal';
import { AlbumDetailModal } from '@/components/album/AlbumDetailModal';

// Danh sách ảo ghim đầu tiên — thống kê từ API "bài hát đã thích" của user trên backend
type LibraryItem =
  | { type: 'playlist'; playlist: Playlist }
  | { type: 'album'; album: Album }
  | { type: 'offline'; offline: OfflineTrack };

const FAV_PLAYLIST: Playlist = {
  id: 'fav',
  name: 'Bài hát đã thích',
  description: 'Danh sách bài hát yêu thích của bạn',
  coverUrl: null,
  trackCount: 0,
};

function formatDuration(ms?: number): string {
  if (!ms) return '0:00';
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function LibraryScreen() {
  const { playTrack, currentTrack, isPlaying } = usePlayer();
  const { offlineTracks, deleteOfflineTrack, refreshOfflineTracks } = useOffline();
  const [filter, setFilter] = useState('all');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [favoriteAlbums, setFavoriteAlbums] = useState<Album[]>([]);
  const [likedTracks, setLikedTracks] = useState<Track[]>([]);
  const [likedCount, setLikedCount] = useState(0);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userInitial, setUserInitial] = useState('K');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAlbumId, setSelectedAlbumId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');

  // Playlist Details Modal State
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [actionTrack, setActionTrack] = useState<Track | null>(null);

  // Danh sách hiển thị: ghim "Bài hát đã thích" (số liệu thật từ API) + playlist thật của user
  const playlistItems = useMemo(
    () => [{ ...FAV_PLAYLIST, trackCount: likedCount }, ...playlists],
    [playlists, likedCount]
  );

  const fetchLibraryData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const token = await Storage.getAccessToken();
      if (!token) {
        setIsLoggedIn(false);
        setPlaylists([]);
        setFavoriteAlbums([]);
        setLikedTracks([]);
        setLikedCount(0);
        return;
      }
      setIsLoggedIn(true);

      // Ảnh avatar hiển thị chữ cái đầu từ thông tin user đã lưu
      const storedUser = await Storage.getItem('moodify_user_info');
      if (storedUser) {
        try {
          const info = JSON.parse(storedUser);
          const name = info?.fullName || info?.fullname || info?.username || 'K';
          setUserInitial(name.charAt(0).toUpperCase());
        } catch {}
      }

      const [plData, favAlbums, likedPage] = await Promise.all([
        PlaylistApi.getMyPlaylists(),
        AlbumApi.getUserFavoriteAlbums(),
        UserLibraryApi.getLikedTracksPage(0, 100),
      ]);
      setPlaylists(plData || []);
      setFavoriteAlbums(favAlbums || []);
      setLikedTracks(likedPage.tracks);
      setLikedCount(likedPage.totalElements);
    } catch (err) {
      console.warn('Lỗi tải thư viện:', err);
      Alert.alert('Lỗi', 'Không tải được thư viện. Vui lòng kéo xuống để thử lại.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchLibraryData();
      refreshOfflineTracks();
    }, [])
  );

  const handleRemoveTrackFromPlaylist = (track: Track) => {
    if (!selectedPlaylist) return;
    const trackKey = track.spotifyId || track.id;
    Alert.alert('Xóa bài hát', `Bạn có muốn gỡ "${track.name}" khỏi playlist này?`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Gỡ bài hát',
        style: 'destructive',
        onPress: async () => {
          try {
            await PlaylistApi.removeTrackFromPlaylist(selectedPlaylist.id, trackKey);
          } catch {}
          setPlaylistTracks((prev) => prev.filter((t) => (t.spotifyId || t.id) !== trackKey));
        },
      },
    ]);
  };

  const handleCreatePlaylist = async () => {
    if (!newTitle.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập tên danh sách phát');
      return;
    }

    try {
      const created = await PlaylistApi.createPlaylist({
        name: newTitle.trim(),
        description: newDesc.trim(),
      });
      setPlaylists([created, ...playlists]);
      Alert.alert('Thành công', `Đã tạo danh sách phát "${created.name}"`);
    } catch {
      Alert.alert('Lỗi', 'Không tạo được danh sách phát. Vui lòng thử lại.');
    }

    setNewTitle('');
    setNewDesc('');
    setIsModalOpen(false);
  };

  const handleOpenPlaylist = async (item: Playlist) => {
    setSelectedPlaylist(item);
    setLoadingTracks(true);
    try {
      if (item.id === 'fav') {
        // "Bài hát đã thích" — dữ liệu thật từ thư viện user trên backend
        if (likedTracks.length > 0) {
          setPlaylistTracks(likedTracks);
        } else {
          const page = await UserLibraryApi.getLikedTracksPage(0, 100);
          setPlaylistTracks(page.tracks);
        }
      } else {
        const pl = await PlaylistApi.getPlaylistById(item.id);
        setPlaylistTracks(pl.tracks || []);
      }
    } catch {
      setPlaylistTracks([]);
      Alert.alert('Lỗi', 'Không tải được danh sách bài hát. Vui lòng thử lại.');
    } finally {
      setLoadingTracks(false);
    }
  };

  const handlePlayAll = () => {
    if (playlistTracks.length > 0) {
      playTrack(playlistTracks[0], playlistTracks);
    }
  };

  const handleShufflePlay = () => {
    if (playlistTracks.length > 0) {
      const shuffled = [...playlistTracks].sort(() => Math.random() - 0.5);
      playTrack(shuffled[0], shuffled);
    }
  };

  const handleDeletePlaylist = (playlistId: string) => {
    Alert.alert('Xác nhận xóa', 'Bạn có chắc chắn muốn xóa danh sách phát này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            await PlaylistApi.deletePlaylist(playlistId);
          } catch {}
          setPlaylists(playlists.filter((p) => p.id !== playlistId));
          setSelectedPlaylist(null);
          Alert.alert('Đã xóa', 'Danh sách phát đã được xóa thành công.');
        },
      },
    ]);
  };

  const libraryItems: LibraryItem[] = useMemo(() => {
    if (filter === 'downloaded') {
      return offlineTracks.map((o) => ({ type: 'offline' as const, offline: o }));
    }
    if (filter === 'playlists') {
      return playlistItems.map((p) => ({ type: 'playlist' as const, playlist: p }));
    }
    if (filter === 'albums') {
      return favoriteAlbums.map((a) => ({ type: 'album' as const, album: a }));
    }
    return [
      ...playlistItems.map((p) => ({ type: 'playlist' as const, playlist: p })),
      ...favoriteAlbums.map((a) => ({ type: 'album' as const, album: a })),
    ];
  }, [filter, offlineTracks, playlistItems, favoriteAlbums]);

  const totalOfflineBytes = useMemo(() => {
    return offlineTracks.reduce((acc, t) => acc + (t.fileSize || 3.5 * 1024 * 1024), 0);
  }, [offlineTracks]);

  const totalOfflineMB = (totalOfflineBytes / (1024 * 1024)).toFixed(1);

  const renderEmptyState = () => {
    const emptyConfig: Record<
      string,
      { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; subtitle: string }
    > = {
      all: {
        icon: 'library-outline',
        title: 'Thư viện trống',
        subtitle: 'Tạo danh sách phát hoặc lưu album yêu thích để bắt đầu!',
      },
      playlists: {
        icon: 'musical-notes',
        title: 'Chưa có danh sách phát',
        subtitle: 'Nhấn dấu + ở góc trên để tạo danh sách phát đầu tiên của bạn!',
      },
      albums: {
        icon: 'disc-outline',
        title: 'Chưa có album yêu thích',
        subtitle: 'Khám phá các album tại Trang chủ và nhấn biểu tượng trái tim để lưu lại đây!',
      },
      downloaded: {
        icon: 'download-outline',
        title: 'Chưa có bài hát nào được tải xuống',
        subtitle: 'Nhấn biểu tượng tải xuống trên bài hát để lưu và nghe ngoại tuyến.',
      },
    };
    const cfg = emptyConfig[filter] || emptyConfig.all;
    return (
      <View style={styles.emptyBox}>
        <Ionicons name={cfg.icon} size={48} color="#4b5563" style={{ marginBottom: 10 }} />
        <Text style={styles.emptyTitle}>{cfg.title}</Text>
        <Text style={styles.emptySubtitle}>{cfg.subtitle}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatar}>
              {isLoggedIn ? (
                <Text style={styles.avatarText}>{userInitial}</Text>
              ) : (
                <Ionicons name="person" size={16} color="#ffffff" />
              )}
            </View>
            <Text style={styles.headerTitle}>Thư viện</Text>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => (isLoggedIn ? setIsModalOpen(true) : router.push('/auth'))}
            >
              <Ionicons name="add" size={28} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Filter Pills */}
        <View style={{ marginBottom: 16 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {['all', 'playlists', 'albums', 'downloaded'].map((item) => {
              const labels: Record<string, string> = {
                all: 'Tất cả',
                playlists: 'Danh sách phát',
                albums: 'Album yêu thích',
                downloaded: 'Đã tải xuống',
              };
              const active = filter === item;
              return (
                <TouchableOpacity
                  key={item}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setFilter(item)}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>
                    {labels[item]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Unified Library List */}
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#8b5cf6" />
            <Text style={styles.centerBoxText}>Đang tải thư viện...</Text>
          </View>
        ) : !isLoggedIn ? (
          <View style={styles.guestCard}>
            <View style={styles.guestAvatar}>
              <Ionicons name="person" size={26} color="#9ca3af" />
            </View>
            <Text style={styles.guestTitle}>Khách vãng lai</Text>
            <Text style={styles.guestSubtitle}>
              Đăng nhập để đồng bộ thư viện, playlist và bài hát đã thích của bạn
            </Text>
            <TouchableOpacity
              style={styles.guestLoginBtn}
              onPress={() => router.push('/auth')}
              activeOpacity={0.8}
            >
              <Text style={styles.guestLoginText}>Đăng nhập / Đăng ký</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList<LibraryItem>
            data={libraryItems}
            keyExtractor={(item) => item.type === 'playlist' ? item.playlist.id : item.type === 'album' ? `album_${item.album.id}` : `offline_${item.offline.trackId}`}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => fetchLibraryData(true)}
                tintColor="#8b5cf6"
              />
            }
          ListHeaderComponent={
            filter === 'downloaded' && offlineTracks.length > 0 ? (
              <View style={styles.offlineHeaderCard}>
                <View style={styles.offlineHeaderTop}>
                  <View style={styles.offlineBadge}>
                    <Ionicons name="shield-checkmark" size={12} color="#10b981" style={{ marginRight: 4 }} />
                    <Text style={styles.offlineBadgeText}>AES-256 CTR</Text>
                  </View>
                  <Text style={styles.offlineSizeText}>{totalOfflineMB} MB đã lưu</Text>
                </View>
                <Text style={styles.offlineHeaderTitle}>Kho Nhạc Ngoại Tuyến</Text>
                <Text style={styles.offlineHeaderSubtitle}>
                  {offlineTracks.length} bài hát đã mã hóa phần cứng • Sẵn sàng nghe khi mất mạng
                </Text>
              </View>
            ) : undefined
          }
            ListEmptyComponent={renderEmptyState}
            renderItem={({ item }) => {
            if (item.type === 'offline') {
              const ot = item.offline;
              const trk = ot.track;
              const isPlayingThis = currentTrack?.id === trk.id && isPlaying;
              const isExpired = ot.status === 'EXPIRED';

              return (
                <TouchableOpacity
                  style={[styles.playlistItem, isPlayingThis && styles.offlineItemPlaying]}
                  onPress={() => {
                    playTrack(trk, offlineTracks.map((o) => o.track));
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.coverWrapper}>
                    {trk.imageUrl ? (
                      <Image source={{ uri: trk.imageUrl }} style={styles.cover} />
                    ) : (
                      <View style={styles.placeholderCover}>
                        <Ionicons name="musical-note" size={26} color="#8b5cf6" />
                      </View>
                    )}
                    {isPlayingThis && (
                      <View style={styles.playingIndicatorOverlay}>
                        <Ionicons name="volume-high" size={12} color="#8b5cf6" />
                      </View>
                    )}
                  </View>

                  <View style={styles.info}>
                    <Text
                      style={[styles.playlistName, isPlayingThis && { color: '#8b5cf6' }]}
                      numberOfLines={1}
                    >
                      {trk.name}
                    </Text>
                    <View style={styles.offlineMetaRow}>
                      <Text style={styles.playlistMeta} numberOfLines={1}>
                        {trk.artistName}
                      </Text>
                      <View style={styles.metaDot} />
                      <View style={[styles.statusPill, isExpired && styles.statusPillExpired]}>
                        <Text style={[styles.statusPillText, isExpired && styles.statusPillTextExpired]}>
                          {isExpired ? 'Hết hạn' : 'Ngoại tuyến'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.offlineDeleteBtn}
                    onPress={() => {
                      Alert.alert('Quản lý bài hát ngoại tuyến', `Bạn có muốn xóa bài hát "${trk.name}" khỏi bộ nhớ thiết bị?`, [
                        { text: 'Hủy', style: 'cancel' },
                        {
                          text: 'Xóa khỏi máy',
                          style: 'destructive',
                          onPress: () => deleteOfflineTrack(trk.id),
                        },
                      ]);
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color="#6b7280" />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            }

              if (item.type === 'album') {
                const alb = item.album;
                return (
                  <TouchableOpacity
                    style={styles.playlistItem}
                    onPress={() => setSelectedAlbumId(alb.id)}
                    activeOpacity={0.7}
                  >
                    {alb.coverUrl ? (
                      <Image source={{ uri: alb.coverUrl }} style={styles.cover} />
                    ) : (
                      <View style={styles.placeholderCover}>
                        <Ionicons name="disc" size={26} color="#8b5cf6" />
                      </View>
                    )}

                    <View style={styles.info}>
                      <Text style={styles.playlistName} numberOfLines={1}>
                        {alb.title}
                      </Text>
                      <Text style={styles.playlistMeta} numberOfLines={1}>
                        Album • {alb.authorName || 'Nhiều nghệ sĩ'} • {alb.trackCount || 0} bài hát
                      </Text>
                    </View>

                    <View style={styles.albumFavBadge}>
                      <Ionicons name="heart" size={16} color="#ec4899" />
                    </View>
                  </TouchableOpacity>
                );
              }

              const pl = item.playlist;
              const isFav = pl.id === 'fav';
              return (
                <TouchableOpacity
                  style={styles.playlistItem}
                  onPress={() => handleOpenPlaylist(pl)}
                  activeOpacity={0.7}
                >
                  {isFav ? (
                    <View style={styles.favCover}>
                      <Ionicons name="heart" size={26} color="#ffffff" />
                    </View>
                  ) : pl.coverUrl ? (
                    <Image source={{ uri: pl.coverUrl }} style={styles.cover} />
                  ) : (
                    <View style={styles.placeholderCover}>
                      <Ionicons name="musical-notes" size={26} color="#8b5cf6" />
                    </View>
                  )}

                  <View style={styles.info}>
                    <Text style={styles.playlistName} numberOfLines={1}>
                      {pl.name}
                    </Text>
                    <Text style={styles.playlistMeta} numberOfLines={1}>
                      Danh sách phát • {pl.trackCount || 0} bài hát
                    </Text>
                  </View>

                  {isFav && (
                    <View style={styles.pinBadge}>
                      <Ionicons name="pin" size={14} color="#8b5cf6" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* Create Playlist Modal */}
        <Modal
          visible={isModalOpen}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setIsModalOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Tạo danh sách phát</Text>
              <Text style={styles.modalSubtitle}>Đặt tên cho playlist cảm xúc của bạn</Text>

              <TextInput
                style={styles.modalInput}
                placeholder="Tên danh sách phát..."
                placeholderTextColor="#6b7280"
                value={newTitle}
                onChangeText={setNewTitle}
                autoFocus
              />

              <TextInput
                style={[styles.modalInput, { height: 70 }]}
                placeholder="Mô tả (tùy chọn)..."
                placeholderTextColor="#6b7280"
                value={newDesc}
                onChangeText={setNewDesc}
                multiline
              />

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setIsModalOpen(false)}
                >
                  <Text style={styles.modalCancelText}>Hủy</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalSubmitBtn}
                  onPress={handleCreatePlaylist}
                >
                  <Text style={styles.modalSubmitText}>Tạo ngay</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Playlist Detail Full Modal */}
        <Modal
          visible={selectedPlaylist !== null}
          animationType="slide"
          onRequestClose={() => setSelectedPlaylist(null)}
        >
          {selectedPlaylist && (
            <View style={styles.detailContainer}>
              <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                {/* Detail Header */}
                <View style={styles.detailHeader}>
                  <TouchableOpacity
                    onPress={() => setSelectedPlaylist(null)}
                    style={styles.detailBackBtn}
                  >
                    <Ionicons name="arrow-back" size={24} color="#ffffff" />
                  </TouchableOpacity>

                  <Text style={styles.detailHeaderTitle} numberOfLines={1}>
                    {selectedPlaylist.name}
                  </Text>

                  {selectedPlaylist.id !== 'fav' ? (
                    <TouchableOpacity
                      onPress={() => handleDeletePlaylist(selectedPlaylist.id)}
                      style={styles.detailBackBtn}
                    >
                      <Ionicons name="trash-outline" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  ) : (
                    <View style={{ width: 36 }} />
                  )}
                </View>

                {/* Playlist Info Banner */}
                <View style={styles.playlistBanner}>
                  {selectedPlaylist.id === 'fav' ? (
                    <View style={styles.bannerFavCover}>
                      <Ionicons name="heart" size={44} color="#ffffff" />
                    </View>
                  ) : selectedPlaylist.coverUrl ? (
                    <Image source={{ uri: selectedPlaylist.coverUrl }} style={styles.bannerCover} />
                  ) : (
                    <View style={styles.bannerPlaceholderCover}>
                      <Ionicons name="musical-notes" size={44} color="#8b5cf6" />
                    </View>
                  )}

                  <Text style={styles.bannerTitle}>{selectedPlaylist.name}</Text>
                  <Text style={styles.bannerDesc}>
                    {selectedPlaylist.description || 'Danh sách bài hát tuyển chọn trên Moodify'}
                  </Text>
                  <Text style={styles.bannerMeta}>
                    {playlistTracks.length} bài hát • Moodify Music
                  </Text>

                  {/* Play & Shuffle Action Row */}
                  <View style={styles.bannerActions}>
                    <TouchableOpacity
                      style={styles.playAllBtn}
                      onPress={handlePlayAll}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="play" size={20} color="#000000" />
                      <Text style={styles.playAllText}>Phát tất cả</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.shuffleBtn}
                      onPress={handleShufflePlay}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="shuffle" size={20} color="#ffffff" />
                      <Text style={styles.shuffleText}>Trộn bài</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Track List */}
                {loadingTracks ? (
                  <View style={styles.loadingBox}>
                    <ActivityIndicator size="large" color="#8b5cf6" />
                    <Text style={styles.loadingText}>Đang tải danh sách bài hát...</Text>
                  </View>
                ) : (
                  <FlatList
                    data={playlistTracks}
                    keyExtractor={(t, i) => `${t.id}_${i}`}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }}
                    ListEmptyComponent={
                      <View style={styles.emptyBox}>
                        <Ionicons name="musical-notes" size={40} color="#4b5563" style={{ marginBottom: 10 }} />
                        <Text style={styles.emptyTitle}>
                          {selectedPlaylist?.id === 'fav' ? 'Chưa có bài hát đã thích' : 'Playlist đang trống'}
                        </Text>
                        <Text style={styles.emptySubtitle}>
                          Nhấn trái tim ở trình phát để lưu bài hát vào đây.
                        </Text>
                      </View>
                    }
                    renderItem={({ item, index }) => {
                      const isThisPlaying = currentTrack?.id === item.id && isPlaying;
                      return (
                        <TouchableOpacity
                          style={styles.detailTrackRow}
                          onPress={() => playTrack(item, playlistTracks)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.trackIndex}>{index + 1}</Text>

                          {item.imageUrl ? (
                            <Image source={{ uri: item.imageUrl }} style={styles.detailTrackCover} />
                          ) : (
                            <View style={styles.detailTrackPlaceholder}>
                              <Ionicons name="musical-note" size={16} color="#8b5cf6" />
                            </View>
                          )}

                          <View style={styles.detailTrackInfo}>
                            <Text
                              style={[
                                styles.detailTrackName,
                                isThisPlaying && { color: '#a78bfa' },
                              ]}
                              numberOfLines={1}
                            >
                              {item.name}
                            </Text>
                            <Text style={styles.detailTrackArtist} numberOfLines={1}>
                              {item.artistName}
                            </Text>
                          </View>

                          <Text style={styles.detailTrackDuration}>
                            {formatDuration(item.durationMs)}
                          </Text>

                          <TouchableOpacity
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={{ paddingLeft: 10 }}
                            onPress={() => setActionTrack(item)}
                          >
                            <Ionicons name="ellipsis-vertical" size={16} color="#9ca3af" />
                          </TouchableOpacity>

                          {selectedPlaylist?.id !== 'fav' && (
                            <TouchableOpacity
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              style={{ paddingLeft: 10 }}
                              onPress={() => handleRemoveTrackFromPlaylist(item)}
                            >
                              <Ionicons name="close-circle-outline" size={18} color="#ef4444" />
                            </TouchableOpacity>
                          )}
                        </TouchableOpacity>
                      );
                    }}
                  />
                )}
              </SafeAreaView>
            </View>
          )}
        </Modal>

        {/* Track Action Modal */}
        <TrackActionModal
          visible={!!actionTrack}
          track={actionTrack}
          onClose={() => setActionTrack(null)}
        />

        {/* Album Detail Modal */}
        <AlbumDetailModal
          visible={!!selectedAlbumId}
          albumId={selectedAlbumId}
          onClose={() => {
            setSelectedAlbumId(null);
            fetchLibraryData();
          }}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconBtn: {
    padding: 4,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#1f1f2e',
  },
  filterChipActive: {
    backgroundColor: '#8b5cf6',
  },
  filterText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '700',
  },
  filterTextActive: {
    color: '#ffffff',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 110,
    gap: 8,
  },
  playlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  favCover: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  cover: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#1f1f2e',
    marginRight: 14,
  },
  placeholderCover: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#1f1f2e',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  info: {
    flex: 1,
  },
  playlistName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  playlistMeta: {
    color: '#9ca3af',
    fontSize: 13,
    marginTop: 4,
  },
  pinBadge: {
    padding: 6,
  },
  albumFavBadge: {
    padding: 6,
  },

  // Loading / Empty / Guest states
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  centerBoxText: {
    color: '#9ca3af',
    fontSize: 14,
  },
  emptyBox: {
    paddingVertical: 40,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtitle: {
    color: '#9ca3af',
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  guestCard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 24,
    backgroundColor: '#161622',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#262638',
    padding: 24,
  },
  guestAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#26263a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  guestTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  guestSubtitle: {
    color: '#9ca3af',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 18,
  },
  guestLoginBtn: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  guestLoginText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },

  // Create Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#1f1f2e',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#383854',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: '#12121a',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2e2e40',
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  modalCancelText: {
    color: '#9ca3af',
    fontWeight: '700',
    fontSize: 14,
  },
  modalSubmitBtn: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  modalSubmitText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },

  // Detail Modal
  detailContainer: {
    flex: 1,
    backgroundColor: '#0c0c10',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a24',
  },
  detailBackBtn: {
    padding: 6,
  },
  detailHeaderTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    maxWidth: '70%',
  },
  playlistBanner: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  bannerFavCover: {
    width: 120,
    height: 120,
    borderRadius: 16,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  bannerCover: {
    width: 120,
    height: 120,
    borderRadius: 16,
    marginBottom: 14,
  },
  bannerPlaceholderCover: {
    width: 120,
    height: 120,
    borderRadius: 16,
    backgroundColor: '#1f1f2e',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  bannerTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 6,
  },
  bannerDesc: {
    color: '#9ca3af',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 6,
  },
  bannerMeta: {
    color: '#6b7280',
    fontSize: 12,
    marginBottom: 16,
  },
  bannerActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    justifyContent: 'center',
  },
  playAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
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
    backgroundColor: '#262638',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 6,
  },
  shuffleText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#9ca3af',
    fontSize: 14,
  },
  detailTrackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#161622',
  },
  trackIndex: {
    color: '#6b7280',
    fontSize: 13,
    width: 24,
    textAlign: 'center',
  },
  detailTrackCover: {
    width: 44,
    height: 44,
    borderRadius: 6,
    marginHorizontal: 10,
  },
  detailTrackPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#1e1e2d',
    marginHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailTrackInfo: {
    flex: 1,
  },
  detailTrackName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  detailTrackArtist: {
    color: '#9ca3af',
    fontSize: 13,
    marginTop: 2,
  },
  detailTrackDuration: {
    color: '#6b7280',
    fontSize: 12,
    marginLeft: 8,
  },
  offlineHeaderCard: {
    backgroundColor: '#12121a',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  offlineHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  offlineBadgeText: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  offlineSizeText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
  },
  offlineHeaderTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  offlineHeaderSubtitle: {
    color: '#6b7280',
    fontSize: 12,
    lineHeight: 16,
  },
  offlineItemPlaying: {
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderColor: 'rgba(139, 92, 246, 0.3)',
    borderWidth: 1,
  },
  coverWrapper: {
    position: 'relative',
  },
  playingIndicatorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  offlineMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#4b5563',
  },
  statusPill: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  statusPillExpired: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  statusPillText: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '700',
  },
  statusPillTextExpired: {
    color: '#ef4444',
  },
  offlineDeleteBtn: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  offlineEmptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  offlineEmptyIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#161622',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#262638',
  },
  offlineEmptyTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  offlineEmptySubtitle: {
    color: '#6b7280',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
