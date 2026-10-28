import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  Image,
  Dimensions,
  ScrollView,
  Alert,
  FlatList,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '@/context/PlayerContext';
import { PlaylistApi } from '@/services/api';
import { Playlist } from '@/types';

const { width, height } = Dimensions.get('window');

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export interface LyricLine {
  id: number;
  time: number;
  endTime: number;
  text: string;
}

export function parseLyrics(lyricsRaw: string | null | undefined, totalDurationSeconds: number): LyricLine[] {
  if (!lyricsRaw || !lyricsRaw.trim()) return [];

  const rawLines = lyricsRaw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (rawLines.length === 0) return [];

  const lrcRegex = /^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)$/;
  const hasLrc = rawLines.some((l) => lrcRegex.test(l));

  if (hasLrc) {
    const parsed: LyricLine[] = [];
    let idCounter = 0;
    for (const raw of rawLines) {
      if (/^\[(ti|ar|al|by|offset|length):/i.test(raw)) continue;
      const match = raw.match(lrcRegex);
      if (match) {
        const mins = parseInt(match[1], 10);
        const secs = parseInt(match[2], 10);
        const ms = match[3] ? parseFloat('0.' + match[3]) : 0;
        const time = mins * 60 + secs + ms;
        const text = match[4].trim();
        if (text) {
          parsed.push({
            id: idCounter++,
            time: Math.round(time * 100) / 100,
            endTime: Math.round((time + 3.5) * 100) / 100,
            text,
          });
        }
      }
    }
    for (let i = 0; i < parsed.length - 1; i++) {
      parsed[i].endTime = parsed[i + 1].time;
    }
    if (parsed.length > 0) return parsed;
  }

  // Plain multiline lyrics: distribute smoothly across duration
  const total = totalDurationSeconds > 10 ? totalDurationSeconds : 210;
  const introDuration = Math.min(8, Math.max(3, total * 0.04));
  const outroDuration = Math.min(10, Math.max(3, total * 0.04));
  const singableDuration = Math.max(10, total - introDuration - outroDuration);

  const step = singableDuration / rawLines.length;
  return rawLines.map((line, idx) => ({
    id: idx,
    time: Math.round((introDuration + idx * step) * 100) / 100,
    endTime: Math.round((introDuration + (idx + 1) * step) * 100) / 100,
    text: line,
  }));
}

export const FullscreenPlayer: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    togglePlayPause,
    currentTime,
    duration,
    seekTo,
    isPlayerModalVisible,
    closePlayerModal,
    playNext,
    playPrev,
    isLiked,
    toggleLikeTrack,
    isShuffle,
    isRepeat,
    toggleShuffle,
    toggleRepeat,
    volume,
    setVolume,
  } = usePlayer();

  const [showLyrics, setShowLyrics] = useState(false);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);

  const lyricsScrollRef = useRef<any>(null);

  useEffect(() => {
    if (showPlaylistPicker) {
      setLoadingPlaylists(true);
      PlaylistApi.getMyPlaylists()
        .then((res) => setPlaylists(res || []))
        .catch(() => setPlaylists([]))
        .finally(() => setLoadingPlaylists(false));
    }
  }, [showPlaylistPicker]);

  const parsedLyrics = useMemo(() => {
    if (!currentTrack) return [];
    const raw = currentTrack.lyricsSynced || currentTrack.lyricsPlain;
    return parseLyrics(raw, duration);
  }, [currentTrack, duration]);

  const activeLyricIndex = useMemo(() => {
    return parsedLyrics.findIndex((l) => currentTime >= l.time && currentTime < l.endTime);
  }, [parsedLyrics, currentTime]);

  // Tự động cuộn đến câu hát đang phát
  useEffect(() => {
    if (showLyrics && activeLyricIndex >= 0 && lyricsScrollRef.current) {
      lyricsScrollRef.current.scrollTo({
        y: Math.max(0, activeLyricIndex * 42 - 120),
        animated: true,
      });
    }
  }, [activeLyricIndex, showLyrics]);

  const handleAddToPlaylist = async (pl: Playlist) => {
    if (!currentTrack) return;
    try {
      const trackId = currentTrack.spotifyId || currentTrack.id;
      await PlaylistApi.addTrackToPlaylist(pl.id, trackId);
      Alert.alert('Thành công', `Đã thêm "${currentTrack.name}" vào "${pl.name}"!`);
      setShowPlaylistPicker(false);
    } catch {
      Alert.alert('Thông báo', 'Không thể thêm bài hát vào danh sách phát (có thể bài hát đã có trong playlist).');
    }
  };

  if (!currentTrack) return null;

  const trackKey = currentTrack.spotifyId || currentTrack.id;
  const liked = isLiked(trackKey);

  const handleShare = async () => {
    if (!currentTrack) return;
    try {
      await Share.share({
        message: `🎵 Đang nghe "${currentTrack.name}" của ${currentTrack.artistName} trên Moodify! Cùng thưởng thức nào: http://localhost:3000/track/${currentTrack.id || currentTrack.spotifyId}`,
        title: currentTrack.name,
      });
    } catch (err) {
      console.warn('Lỗi chia sẻ:', err);
    }
  };

  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  const handleProgressBarPress = (event: any) => {
    if (duration <= 0) return;
    const { locationX } = event.nativeEvent;
    const progressBarWidth = width - 48;
    const clickRatio = Math.max(0, Math.min(1, locationX / progressBarWidth));
    seekTo(clickRatio * duration);
  };

  return (
    <Modal
      visible={isPlayerModalVisible}
      animationType="slide"
      transparent={false}
      onRequestClose={closePlayerModal}
    >
      <View style={styles.container}>
        {/* Blurred artwork background */}
        {currentTrack.imageUrl && (
          <Image
            source={{ uri: currentTrack.imageUrl }}
            style={styles.bgImage}
            blurRadius={30}
          />
        )}
        <View style={styles.bgOverlay} />

        <SafeAreaView style={styles.safeArea}>
          {/* Top Header */}
          <View style={styles.topHeader}>
            <TouchableOpacity onPress={closePlayerModal} style={styles.headerBtn}>
              <Ionicons name="chevron-down" size={28} color="#ffffff" />
            </TouchableOpacity>

            <View style={styles.headerTitleBox}>
              <Text style={styles.headerSuperTitle}>ĐANG PHÁT TỪ DANH SÁCH</Text>
              <Text style={styles.headerSubTitle} numberOfLines={1}>
                {currentTrack.albumName || 'Moodify Collection'}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity style={[styles.headerBtn, { marginRight: 6 }]} onPress={handleShare}>
                <Ionicons name="share-social-outline" size={22} color="#ffffff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerBtn} onPress={() => setShowPlaylistPicker(true)}>
                <Ionicons name="bookmark-outline" size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            {/* Artwork Card */}
            <View style={styles.artworkContainer}>
              {currentTrack.imageUrl ? (
                <Image source={{ uri: currentTrack.imageUrl }} style={styles.artwork} />
              ) : (
                <View style={styles.artworkPlaceholder}>
                  <Text style={{ fontSize: 60 }}>🎵</Text>
                </View>
              )}
            </View>

            {/* Track Info & Like */}
            <View style={styles.trackInfoRow}>
              <View style={styles.trackTitleBox}>
                <Text style={styles.trackTitle} numberOfLines={1}>
                  {currentTrack.name}
                </Text>
                <Text style={styles.trackArtist} numberOfLines={1}>
                  {currentTrack.artistName}
                </Text>
              </View>

              <TouchableOpacity onPress={() => toggleLikeTrack(currentTrack)} style={styles.likeBtn}>
                <Ionicons
                  name={liked ? 'heart' : 'heart-outline'}
                  size={28}
                  color={liked ? '#ec4899' : '#ffffff'}
                />
              </TouchableOpacity>
            </View>

            {/* Progress Bar (Scrubbable) */}
            <View style={styles.progressContainer}>
              <TouchableOpacity
                style={styles.progressBarTouch}
                activeOpacity={1}
                onPress={handleProgressBarPress}
              >
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
                  <View style={[styles.progressThumb, { left: `${progressPercent}%` }]} />
                </View>
              </TouchableOpacity>

              <View style={styles.timeRow}>
                <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
                <Text style={styles.timeText}>{formatTime(duration)}</Text>
              </View>
            </View>

            {/* Player Controls (Shuffle, Prev, Play/Pause, Next, Repeat) */}
            <View style={styles.controlsRow}>
              <TouchableOpacity
                onPress={toggleShuffle}
                style={styles.controlIconBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name="shuffle"
                  size={24}
                  color={isShuffle ? '#a78bfa' : '#6b7280'}
                />
                {isShuffle && <View style={styles.activeDot} />}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={playPrev}
                style={styles.controlIconBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="play-skip-back" size={32} color="#ffffff" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={togglePlayPause}
                style={styles.mainPlayBtn}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={36}
                  color="#000000"
                  style={{ marginLeft: isPlaying ? 0 : 3 }}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={playNext}
                style={styles.controlIconBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="play-skip-forward" size={32} color="#ffffff" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={toggleRepeat}
                style={styles.controlIconBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name="repeat"
                  size={24}
                  color={isRepeat ? '#a78bfa' : '#6b7280'}
                />
                {isRepeat && <View style={styles.activeDot} />}
              </TouchableOpacity>
            </View>

            {/* Volume Control Quick Slider */}
            <View style={styles.volumeRow}>
              <TouchableOpacity
                onPress={() => setVolume(volume > 0 ? 0 : 1)}
                style={{ padding: 4 }}
              >
                <Ionicons
                  name={volume === 0 ? 'volume-mute' : volume < 0.5 ? 'volume-low' : 'volume-high'}
                  size={20}
                  color="#9ca3af"
                />
              </TouchableOpacity>
              <View style={styles.volumeBarBg}>
                <View style={[styles.volumeBarFill, { width: `${volume * 100}%` }]} />
              </View>
              <Text style={styles.volumeText}>{Math.round(volume * 100)}%</Text>
            </View>

            {/* Realtime Synced Lyrics (Karaoke Style) */}
            <View style={styles.lyricsCard}>
              <View style={styles.lyricsHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="mic" size={18} color="#a78bfa" style={{ marginRight: 6 }} />
                  <Text style={styles.lyricsTitle}>Lời bài hát thời gian thực</Text>
                </View>
                <TouchableOpacity onPress={() => setShowLyrics(!showLyrics)}>
                  <Text style={styles.lyricsToggleText}>
                    {showLyrics ? 'Thu gọn' : 'Xem toàn bộ'}
                  </Text>
                </TouchableOpacity>
              </View>

              {parsedLyrics.length > 0 ? (
                showLyrics ? (
                  <ScrollView
                    ref={lyricsScrollRef}
                    style={styles.fullLyricsScroll}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled={true}
                  >
                    {parsedLyrics.map((line, idx) => {
                      const isActive = idx === activeLyricIndex;
                      return (
                        <TouchableOpacity
                          key={line.id}
                          onPress={() => seekTo(line.time)}
                          style={[styles.lyricLineBox, isActive && styles.lyricLineBoxActive]}
                        >
                          <Text style={[styles.lyricLineText, isActive && styles.lyricLineTextActive]}>
                            {line.text}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <TouchableOpacity
                    onPress={() => setShowLyrics(true)}
                    activeOpacity={0.8}
                    style={{ paddingVertical: 4 }}
                  >
                    <Text style={styles.lyricsPreviewActive}>
                      {activeLyricIndex >= 0
                        ? parsedLyrics[activeLyricIndex].text
                        : parsedLyrics[0]?.text || 'Giai điệu đang vang lên...'}
                    </Text>
                    {parsedLyrics[activeLyricIndex + 1] && (
                      <Text style={styles.lyricsPreviewNext}>
                        {parsedLyrics[activeLyricIndex + 1].text}
                      </Text>
                    )}
                  </TouchableOpacity>
                )
              ) : (
                <Text style={styles.lyricsEmptyText}>
                  🎵 Giai điệu đang vang lên... Lời bài hát sẽ sớm được cập nhật.
                </Text>
              )}
            </View>
          </ScrollView>

          {/* Playlist Picker Sheet Modal */}
          <Modal
            visible={showPlaylistPicker}
            animationType="fade"
            transparent={true}
            onRequestClose={() => setShowPlaylistPicker(false)}
          >
            <View style={styles.sheetOverlay}>
              <View style={styles.sheetCard}>
                <Text style={styles.sheetTitle}>Thêm vào danh sách phát</Text>
                <Text style={styles.sheetSubtitle}>
                  Chọn playlist bạn muốn lưu bài hát "{currentTrack.name}"
                </Text>

                {playlists.length === 0 ? (
                  <View style={styles.emptyPlaylistNotice}>
                    <Text style={styles.emptyNoticeText}>Chưa có danh sách phát nào.</Text>
                    <Text style={styles.emptyNoticeSub}>Hãy tạo playlist mới tại tab Thư viện!</Text>
                  </View>
                ) : (
                  <FlatList
                    data={playlists}
                    keyExtractor={(item) => item.id}
                    style={styles.pickerList}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={styles.pickerItem}
                        onPress={() => handleAddToPlaylist(item)}
                      >
                        <View style={styles.pickerItemIcon}>
                          <Ionicons name="musical-notes" size={20} color="#8b5cf6" />
                        </View>
                        <View style={styles.pickerItemInfo}>
                          <Text style={styles.pickerItemName} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={styles.pickerItemMeta}>
                            {item.trackCount || 0} bài hát
                          </Text>
                        </View>
                        <Ionicons name="add-circle" size={22} color="#a78bfa" />
                      </TouchableOpacity>
                    )}
                  />
                )}

                <TouchableOpacity
                  style={styles.closeSheetBtn}
                  onPress={() => setShowPlaylistPicker(false)}
                >
                  <Text style={styles.closeSheetText}>Hủy bỏ</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
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
  bgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.35,
  },
  bgOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(12, 12, 16, 0.75)',
  },
  safeArea: {
    flex: 1,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerBtn: {
    padding: 6,
  },
  headerTitleBox: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 12,
  },
  headerSuperTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9ca3af',
    letterSpacing: 1,
    marginBottom: 2,
  },
  headerSubTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  artworkContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  artwork: {
    width: width - 80,
    height: width - 80,
    borderRadius: 16,
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
  },
  artworkPlaceholder: {
    width: width - 80,
    height: width - 80,
    borderRadius: 16,
    backgroundColor: '#1f1f2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  trackTitleBox: {
    flex: 1,
    marginRight: 16,
  },
  trackTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
  },
  trackArtist: {
    fontSize: 15,
    color: '#9ca3af',
  },
  likeBtn: {
    padding: 8,
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressBarTouch: {
    paddingVertical: 10,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: '#374151',
    borderRadius: 2,
    position: 'relative',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#8b5cf6',
    borderRadius: 2,
  },
  progressThumb: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    position: 'absolute',
    top: -4,
    marginLeft: -6,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  timeText: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  controlIconBtn: {
    padding: 10,
    alignItems: 'center',
    position: 'relative',
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#a78bfa',
    position: 'absolute',
    bottom: 2,
  },
  mainPlayBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 8,
    gap: 12,
  },
  volumeBarBg: {
    flex: 1,
    height: 4,
    backgroundColor: '#262636',
    borderRadius: 2,
    overflow: 'hidden',
  },
  volumeBarFill: {
    height: '100%',
    backgroundColor: '#a78bfa',
    borderRadius: 2,
  },
  volumeText: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '600',
    width: 32,
    textAlign: 'right',
  },
  lyricsCard: {
    backgroundColor: 'rgba(30, 27, 75, 0.45)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.25)',
  },
  lyricsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  lyricsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#c4b5fd',
  },
  lyricsToggleText: {
    fontSize: 12,
    color: '#a78bfa',
    fontWeight: '700',
  },
  fullLyricsScroll: {
    maxHeight: 260,
  },
  lyricLineBox: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  lyricLineBoxActive: {
    backgroundColor: 'rgba(124, 58, 237, 0.25)',
  },
  lyricLineText: {
    fontSize: 15,
    color: '#9ca3af',
    fontWeight: '600',
    lineHeight: 22,
  },
  lyricLineTextActive: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
  },
  lyricsPreviewActive: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
    lineHeight: 22,
  },
  lyricsPreviewNext: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '600',
  },
  lyricsEmptyText: {
    fontSize: 13,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: '#181824',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: height * 0.6,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 16,
  },
  emptyPlaylistNotice: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyNoticeText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
    marginBottom: 4,
  },
  emptyNoticeSub: {
    fontSize: 12,
    color: '#9ca3af',
  },
  pickerList: {
    marginBottom: 16,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#262636',
  },
  pickerItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#262636',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  pickerItemInfo: {
    flex: 1,
  },
  pickerItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 2,
  },
  pickerItemMeta: {
    fontSize: 12,
    color: '#9ca3af',
  },
  closeSheetBtn: {
    paddingVertical: 12,
    backgroundColor: '#262636',
    borderRadius: 8,
    alignItems: 'center',
  },
  closeSheetText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
