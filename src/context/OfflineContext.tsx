import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { Track, OfflineTrack, OfflineStatus } from '@/types';
import { OfflineManifestDB } from '@/services/offline/OfflineManifestDB';
import { OfflineDownloadManager } from '@/services/offline/OfflineDownloadManager';
import { OfflineSyncService } from '@/services/offline/OfflineSyncService';
import { OfflineStorage } from '@/services/offline/OfflineStorage';

type OfflineContextType = {
  offlineTracks: OfflineTrack[];
  isDownloading: (trackId: string) => boolean;
  isTrackDownloaded: (trackId: string) => boolean;
  getTrackStatus: (trackId: string) => OfflineStatus | null;
  downloadTrack: (track: Track) => Promise<void>;
  deleteOfflineTrack: (trackId: string) => Promise<void>;
  downloadProgressMap: Record<string, number>;
  refreshOfflineTracks: () => Promise<void>;
};

const OfflineContext = createContext<OfflineContextType>({
  offlineTracks: [],
  isDownloading: () => false,
  isTrackDownloaded: () => false,
  getTrackStatus: () => null,
  downloadTrack: async () => {},
  deleteOfflineTrack: async () => {},
  downloadProgressMap: {},
  refreshOfflineTracks: async () => {},
});

export const OfflineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [offlineTracks, setOfflineTracks] = useState<OfflineTrack[]>([]);
  const [downloadProgressMap, setDownloadProgressMap] = useState<Record<string, number>>({});
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());

  const refreshOfflineTracks = useCallback(async () => {
    try {
      await OfflineStorage.init();
      const tracks = await OfflineManifestDB.getAll();
      setOfflineTracks(tracks);
    } catch (e) {
      console.warn('[OfflineProvider] Lỗi nạp danh sách offline:', e);
    }
  }, []);

  useEffect(() => {
    refreshOfflineTracks().then(() => {
      OfflineSyncService.syncLicenses();
    });
  }, [refreshOfflineTracks]);

  const isDownloading = useCallback(
    (trackId: string) => downloadingIds.has(trackId),
    [downloadingIds]
  );

  const isTrackDownloaded = useCallback(
    (trackId: string) =>
      offlineTracks.some((t) => t.trackId === trackId && t.status === 'DOWNLOADED'),
    [offlineTracks]
  );

  const getTrackStatus = useCallback(
    (trackId: string): OfflineStatus | null => {
      const match = offlineTracks.find((t) => t.trackId === trackId);
      return match ? match.status : null;
    },
    [offlineTracks]
  );

  const downloadTrack = useCallback(
    async (track: Track) => {
      if (downloadingIds.has(track.id)) return;

      setDownloadingIds((prev) => new Set(prev).add(track.id));
      setDownloadProgressMap((prev) => ({ ...prev, [track.id]: 0 }));

      try {
        await OfflineDownloadManager.downloadTrack(track, (progress) => {
          setDownloadProgressMap((prev) => ({ ...prev, [track.id]: progress }));
        });
        await refreshOfflineTracks();
        Alert.alert('Thành công! 🎉', `Đã tải "${track.name}" về thiết bị để nghe ngoại tuyến!`);
      } catch (err: any) {
        const errorMsg =
          err?.response?.data?.message || err?.message || 'Có lỗi xảy ra khi tải bài hát.';
        Alert.alert('Không thể tải bài hát', errorMsg);
      } finally {
        setDownloadingIds((prev) => {
          const next = new Set(prev);
          next.delete(track.id);
          return next;
        });
        setDownloadProgressMap((prev) => {
          const next = { ...prev };
          delete next[track.id];
          return next;
        });
      }
    },
    [downloadingIds, refreshOfflineTracks]
  );

  const deleteOfflineTrack = useCallback(
    async (trackId: string) => {
      try {
        await OfflineDownloadManager.deleteTrack(trackId);
        await refreshOfflineTracks();
      } catch (e) {
        console.warn('[OfflineProvider] Lỗi xóa bài hát offline:', e);
      }
    },
    [refreshOfflineTracks]
  );

  return (
    <OfflineContext.Provider
      value={{
        offlineTracks,
        isDownloading,
        isTrackDownloaded,
        getTrackStatus,
        downloadTrack,
        deleteOfflineTrack,
        downloadProgressMap,
        refreshOfflineTracks,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
};

export const useOffline = () => useContext(OfflineContext);
