import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Audio } from 'expo-av';
import { Track } from '@/types';
import { API_BASE_URL } from '@/constants/config';

type PlayerContextType = {
  currentTrack: Track | null;
  isPlaying: boolean;
  playTrack: (track: Track) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  isLoadingAudio: boolean;
};

const PlayerContext = createContext<PlayerContextType>({
  currentTrack: null,
  isPlaying: false,
  playTrack: async () => {},
  togglePlayPause: async () => {},
  isLoadingAudio: false,
});

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState<boolean>(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    // Cấu hình âm thanh cho phép phát trong nền/im lặng
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    }).catch((err) => console.warn('AudioMode error:', err));

    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  const playTrack = async (track: Track) => {
    try {
      setIsLoadingAudio(true);
      setCurrentTrack(track);

      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      // Xác định audio URL: ưu tiên link stream của Spring Boot, nếu không có thì dùng previewUrl
      let audioUri = track.previewUrl;
      if (!audioUri && track.id) {
        audioUri = `${API_BASE_URL}/tracks/${track.id}/stream`;
      }

      if (!audioUri) {
        console.warn('Bài hát không có URL âm thanh');
        setIsLoadingAudio(false);
        setIsPlaying(false);
        return;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true, progressUpdateIntervalMillis: 500 },
        (status) => {
          if (status.isLoaded) {
            setIsPlaying(status.isPlaying);
            if (status.didJustFinish) {
              setIsPlaying(false);
            }
          } else if (status.error) {
            console.warn('Lỗi phát âm thanh:', status.error);
            setIsPlaying(false);
          }
        }
      );

      soundRef.current = sound;
      setIsPlaying(true);
    } catch (error) {
      console.warn('Lỗi khi phát bài hát:', error);
      setIsPlaying(false);
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const togglePlayPause = async () => {
    if (!soundRef.current) return;
    try {
      if (isPlaying) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
      } else {
        await soundRef.current.playAsync();
        setIsPlaying(true);
      }
    } catch (err) {
      console.warn('Toggle play error:', err);
    }
  };

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        playTrack,
        togglePlayPause,
        isLoadingAudio,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => useContext(PlayerContext);
