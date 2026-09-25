import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Track } from '@/types';
import { API_BASE_URL } from '@/constants/config';

// Bọc an toàn: Không làm crash app nếu Expo Go chưa nạp native audio module
let AudioModule: any = null;
try {
  AudioModule = require('expo-av')?.Audio;
} catch {
  console.warn('[Player] Audio native module chưa sẵn sàng trong bản Expo Go này');
}

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
  const soundRef = useRef<any>(null);

  useEffect(() => {
    if (AudioModule) {
      AudioModule.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      }).catch(() => {});
    }

    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync?.().catch(() => {});
      }
    };
  }, []);

  const playTrack = async (track: Track) => {
    try {
      setIsLoadingAudio(true);
      setCurrentTrack(track);
      setIsPlaying(true);

      if (!AudioModule) {
        // Vẫn cập nhật UI MiniPlayer mượt mà
        setIsLoadingAudio(false);
        return;
      }

      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      let audioUri = track.previewUrl;
      if (!audioUri && track.id) {
        audioUri = `${API_BASE_URL}/tracks/${track.id}/stream`;
      }

      if (!audioUri) {
        setIsLoadingAudio(false);
        return;
      }

      const { sound } = await AudioModule.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true, progressUpdateIntervalMillis: 500 },
        (status: any) => {
          if (status.isLoaded) {
            setIsPlaying(status.isPlaying);
            if (status.didJustFinish) {
              setIsPlaying(false);
            }
          }
        }
      );

      soundRef.current = sound;
    } catch (error) {
      console.warn('[Player] Lỗi phát âm thanh:', error);
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const togglePlayPause = async () => {
    if (!soundRef.current) {
      setIsPlaying(!isPlaying);
      return;
    }
    try {
      if (isPlaying) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
      } else {
        await soundRef.current.playAsync();
        setIsPlaying(true);
      }
    } catch {
      setIsPlaying(!isPlaying);
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
