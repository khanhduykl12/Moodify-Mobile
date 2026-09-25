import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { usePlayer } from '@/context/PlayerContext';
import { Ionicons } from '@expo/vector-icons';

export const MiniPlayer: React.FC = () => {
  const { currentTrack, isPlaying, togglePlayPause, isLoadingAudio } = usePlayer();
  const [isLiked, setIsLiked] = useState(false);

  if (!currentTrack) return null;

  return (
    <View style={styles.container}>
      {/* Background card with subtle glassmorphism */}
      <View style={styles.card}>
        {/* Cover Art */}
        {currentTrack.imageUrl ? (
          <Image source={{ uri: currentTrack.imageUrl }} style={styles.cover} />
        ) : (
          <View style={styles.coverPlaceholder}>
            <Text style={{ fontSize: 18 }}>🎵</Text>
          </View>
        )}

        {/* Track Title and Artist */}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {currentTrack.name}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {currentTrack.artistName}
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={() => setIsLiked(!isLiked)}
            style={styles.actionBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={isLiked ? 'heart' : 'heart-outline'}
              size={22}
              color={isLiked ? '#ec4899' : '#9ca3af'}
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={togglePlayPause}
            style={styles.playBtn}
            disabled={isLoadingAudio}
            activeOpacity={0.8}
          >
            {isLoadingAudio ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={22}
                color="#ffffff"
                style={{ marginLeft: isPlaying ? 0 : 2 }}
              />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress Bar Accent Line */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: isPlaying ? '60%' : '20%' }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 54, // ngay trên thanh tab bar
    left: 8,
    right: 8,
    zIndex: 99,
  },
  card: {
    backgroundColor: '#1f1f2e',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#383854',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  cover: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#262638',
  },
  coverPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#262638',
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  title: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  artist: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    padding: 6,
  },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressBar: {
    height: 2.5,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    overflow: 'hidden',
    marginTop: -2.5,
    marginHorizontal: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#a78bfa',
  },
});
