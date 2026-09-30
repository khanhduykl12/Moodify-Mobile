import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  Image,
  Dimensions,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '@/context/PlayerContext';

const { width, height } = Dimensions.get('window');

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
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
  } = usePlayer();

  const [isLiked, setIsLiked] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);

  if (!currentTrack) return null;

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

            <TouchableOpacity style={styles.headerBtn}>
              <Ionicons name="ellipsis-horizontal" size={22} color="#ffffff" />
            </TouchableOpacity>
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

              <TouchableOpacity onPress={() => setIsLiked(!isLiked)} style={styles.likeBtn}>
                <Ionicons
                  name={isLiked ? 'heart' : 'heart-outline'}
                  size={28}
                  color={isLiked ? '#ec4899' : '#ffffff'}
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

            {/* Player Controls */}
            <View style={styles.controlsRow}>
              <TouchableOpacity
                onPress={() => setIsShuffle(!isShuffle)}
                style={styles.controlIconBtn}
              >
                <Ionicons
                  name="shuffle"
                  size={24}
                  color={isShuffle ? '#a78bfa' : '#6b7280'}
                />
              </TouchableOpacity>

              <TouchableOpacity onPress={playPrev} style={styles.controlIconBtn}>
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

              <TouchableOpacity onPress={playNext} style={styles.controlIconBtn}>
                <Ionicons name="play-skip-forward" size={32} color="#ffffff" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setIsRepeat(!isRepeat)}
                style={styles.controlIconBtn}
              >
                <Ionicons
                  name="repeat"
                  size={24}
                  color={isRepeat ? '#a78bfa' : '#6b7280'}
                />
              </TouchableOpacity>
            </View>

            {/* Synced Lyrics Preview Drawer */}
            {(currentTrack.lyricsPlain || currentTrack.lyricsSynced) && (
              <View style={styles.lyricsCard}>
                <View style={styles.lyricsHeader}>
                  <Text style={styles.lyricsTitle}>Lời bài hát</Text>
                  <TouchableOpacity onPress={() => setShowLyrics(!showLyrics)}>
                    <Text style={styles.lyricsToggleText}>
                      {showLyrics ? 'Thu gọn' : 'Xem toàn bộ'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text
                  style={styles.lyricsContent}
                  numberOfLines={showLyrics ? undefined : 4}
                >
                  {currentTrack.lyricsPlain ||
                    (currentTrack.lyricsSynced || '').replace(/\[\d{2}:\d{2}\.\d{2}\]/g, '')}
                </Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c0c10',
    position: 'relative',
  },
  bgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    opacity: 0.35,
  },
  bgOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(12, 12, 16, 0.85)',
  },
  safeArea: {
    flex: 1,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerBtn: {
    padding: 6,
  },
  headerTitleBox: {
    alignItems: 'center',
    flex: 1,
  },
  headerSuperTitle: {
    color: '#9ca3af',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  headerSubTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  artworkContainer: {
    width: width - 48,
    height: width - 48,
    maxHeight: 330,
    borderRadius: 16,
    overflow: 'hidden',
    marginVertical: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
    backgroundColor: '#1f1f2e',
  },
  artwork: {
    width: '100%',
    height: '100%',
  },
  artworkPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1f1f2e',
  },
  trackInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20,
  },
  trackTitleBox: {
    flex: 1,
    marginRight: 16,
  },
  trackTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  trackArtist: {
    color: '#9ca3af',
    fontSize: 15,
    marginTop: 4,
    fontWeight: '600',
  },
  likeBtn: {
    padding: 6,
  },
  progressContainer: {
    width: '100%',
    marginBottom: 24,
  },
  progressBarTouch: {
    paddingVertical: 10,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    position: 'relative',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute',
    top: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    marginLeft: -6,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  timeText: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 30,
  },
  controlIconBtn: {
    padding: 8,
  },
  mainPlayBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  lyricsCard: {
    width: '100%',
    backgroundColor: '#1f1f2e',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#383854',
    marginBottom: 20,
  },
  lyricsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  lyricsTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  lyricsToggleText: {
    color: '#a78bfa',
    fontSize: 13,
    fontWeight: '700',
  },
  lyricsContent: {
    color: '#d1d5db',
    fontSize: 14,
    lineHeight: 24,
    fontWeight: '500',
  },
});
