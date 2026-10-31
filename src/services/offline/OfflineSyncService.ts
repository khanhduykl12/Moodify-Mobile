import { OfflineApi } from '../api';
import { getDeviceUuid } from './device';
import { OfflineManifestDB } from './OfflineManifestDB';
import { OfflineStorage } from './OfflineStorage';

export const OfflineSyncService = {
  /**
   * Đồng bộ trạng thái bản quyền ngoại tuyến với server khi có kết nối mạng
   */
  async syncLicenses(): Promise<void> {
    try {
      const deviceUuid = await getDeviceUuid();
      const allDownloaded = await OfflineManifestDB.getAll();
      if (allDownloaded.length === 0) return;

      const trackIds = allDownloaded.map((t) => t.trackId);
      const res = await OfflineApi.verifyLicenses({ deviceUuid, trackIds });

      // Nếu thiết bị bị thu hồi quyền (REVOKED)
      if (!res.deviceActive) {
        for (const track of allDownloaded) {
          track.status = 'EXPIRED';
          await OfflineManifestDB.set(track.trackId, track);
        }
        return;
      }

      // Xử lý các bài bị hết hạn (EXPIRED)
      if (res.expiredTrackIds && res.expiredTrackIds.length > 0) {
        for (const trackId of res.expiredTrackIds) {
          const entry = await OfflineManifestDB.get(trackId);
          if (entry) {
            entry.status = 'EXPIRED';
            await OfflineManifestDB.set(trackId, entry);
          }
        }
      }

      // Xử lý các bài bị thu hồi hoàn toàn (REVOKED)
      if (res.revokedTrackIds && res.revokedTrackIds.length > 0) {
        for (const trackId of res.revokedTrackIds) {
          await OfflineStorage.deleteEncryptedFile(trackId);
          await OfflineManifestDB.remove(trackId);
        }
      }
    } catch (e) {
      console.warn('[OfflineSyncService] Không thể đồng bộ bản quyền với server (có thể đang offline):', e);
    }
  },
};
