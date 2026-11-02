import * as FileSystem from 'expo-file-system/legacy';
import { Track, OfflineTrack } from '../../types';
import { OfflineApi } from '../api';
import { getDeviceUuid, getDeviceName, getPlatform } from './device';
import { OfflineEncryption, base64ToUint8Array } from './OfflineEncryption';
import { OfflineStorage } from './OfflineStorage';
import { OfflineManifestDB } from './OfflineManifestDB';

export const OfflineDownloadManager = {
  /**
   * Tiến hành tải xuống, mã hóa và lưu trữ bài hát ngoại tuyến
   */
  async downloadTrack(
    track: Track,
    onProgress?: (progress: number) => void
  ): Promise<OfflineTrack> {
    const trackId = track.id;

    // 1. Kiểm tra dung lượng bộ nhớ
    const freeSpace = await OfflineStorage.getFreeSpace();
    if (freeSpace < 50 * 1024 * 1024) {
      throw new Error('Dung lượng thiết bị còn quá ít (dưới 50MB). Vui lòng dọn dẹp bộ nhớ!');
    }

    // 2. Lấy thông tin thiết bị
    const deviceUuid = await getDeviceUuid();
    const deviceName = getDeviceName();
    const platform = getPlatform();

    // 3. Khởi tạo trạng thái ban đầu trong Manifest
    const initialOfflineTrack: OfflineTrack = {
      trackId,
      track,
      status: 'QUEUED',
      localPath: '',
      expiresAt: '',
      downloadProgress: 0,
    };
    await OfflineManifestDB.set(trackId, initialOfflineTrack);

    // 4. Yêu cầu cấp phép tải từ Backend API
    const license = await OfflineApi.requestDownload({
      trackId,
      deviceUuid,
      deviceName,
      platform,
    });

    initialOfflineTrack.status = 'DOWNLOADING';
    initialOfflineTrack.expiresAt = license.expiresAt;
    await OfflineManifestDB.set(trackId, initialOfflineTrack);
    await OfflineManifestDB.saveEncryptionKey(trackId, license.encryptionKey);

    if (onProgress) onProgress(30);

    // 5. Tải file âm thanh thô về thư mục tạm
    const tempRawPath = `${FileSystem.cacheDirectory || ''}temp_raw_${trackId}.tmp`;
    try {
      const downloadResult = await FileSystem.downloadAsync(license.downloadUrl, tempRawPath);
      if (onProgress) onProgress(60);

      // 6. Đọc trực tiếp binary byte array từ file đã tải (qua Base64)
      const rawB64 = await FileSystem.readAsStringAsync(downloadResult.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const rawBytes = base64ToUint8Array(rawB64);

      // Xóa file thô tạm thời ngay lập tức để bảo vệ bản quyền
      await FileSystem.deleteAsync(downloadResult.uri, { idempotent: true });

      if (onProgress) onProgress(80);

      // 7. Mã hóa file với AES-256 CTR kèm Header bảo mật
      const expiryMs = new Date(license.expiresAt).getTime();
      const encryptedBytes = await OfflineEncryption.encryptAudio(
        rawBytes,
        license.encryptionKey,
        expiryMs
      );

      // 8. Lưu file .mfy vào App Sandbox
      const savedPath = await OfflineStorage.saveEncryptedFile(trackId, encryptedBytes);

      // 9. Cập nhật Manifest hoàn tất
      const completedTrack: OfflineTrack = {
        trackId,
        track,
        status: 'DOWNLOADED',
        localPath: savedPath,
        downloadedAt: new Date().toISOString(),
        expiresAt: license.expiresAt,
        fileSize: encryptedBytes.length,
        downloadProgress: 100,
      };
      await OfflineManifestDB.set(trackId, completedTrack);

      // 10. Gửi xác nhận về Backend
      try {
        await OfflineApi.confirmDownload({
          downloadToken: license.downloadToken,
          fileSize: encryptedBytes.length,
          localPath: savedPath,
        });
      } catch (err) {
        console.warn('[OfflineDownloadManager] Gửi xác nhận server chậm:', err);
      }

      if (onProgress) onProgress(100);
      return completedTrack;
    } catch (error: any) {
      try {
        await FileSystem.deleteAsync(tempRawPath, { idempotent: true });
      } catch {}
      await OfflineStorage.deleteEncryptedFile(trackId);
      await OfflineManifestDB.remove(trackId);
      throw error;
    }
  },

  /**
   * Xóa một bài hát khỏi danh sách ngoại tuyến
   */
  async deleteTrack(trackId: string): Promise<void> {
    const deviceUuid = await getDeviceUuid();
    await OfflineStorage.deleteEncryptedFile(trackId);
    await OfflineManifestDB.remove(trackId);

    try {
      await OfflineApi.removeDownload(deviceUuid, trackId);
    } catch (err) {
      console.warn('[OfflineDownloadManager] Xóa trên server gặp lỗi mạng:', err);
    }
  },
};
