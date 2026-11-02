import { OfflineManifestDB } from './OfflineManifestDB';
import { OfflineStorage } from './OfflineStorage';
import { OfflineEncryption } from './OfflineEncryption';

export const OfflineLicenseValidator = {
  /**
   * Kiểm tra tính hợp lệ của bản quyền bài hát trước khi phát
   */
  async validate(trackId: string): Promise<{
    isValid: boolean;
    reason?: 'NOT_FOUND' | 'EXPIRED' | 'FILE_MISSING' | 'KEY_MISSING' | 'DECRYPT_FAILED';
    tempPlaybackUri?: string;
  }> {
    const entry = await OfflineManifestDB.get(trackId);
    if (!entry || entry.status !== 'DOWNLOADED') {
      return { isValid: false, reason: 'NOT_FOUND' };
    }

    // 1. Kiểm tra hạn thời gian bản quyền
    const expiryMs = new Date(entry.expiresAt).getTime();
    if (Date.now() > expiryMs) {
      return { isValid: false, reason: 'EXPIRED' };
    }

    // 2. Kiểm tra file mã hóa có tồn tại trên máy không
    const hasFile = await OfflineStorage.hasEncryptedFile(trackId);
    if (!hasFile) {
      return { isValid: false, reason: 'FILE_MISSING' };
    }

    // 3. Lấy khóa mã hóa từ SecureStore
    const key = await OfflineManifestDB.getEncryptionKey(trackId);
    if (!key) {
      return { isValid: false, reason: 'KEY_MISSING' };
    }

    // 4. Đọc và giải mã dữ liệu âm thanh
    try {
      const encryptedBytes = await OfflineStorage.readEncryptedFile(trackId);
      if (!encryptedBytes) {
        return { isValid: false, reason: 'FILE_MISSING' };
      }

      const { audioBytes } = await OfflineEncryption.decryptAudio(encryptedBytes, key);
      const tempUri = await OfflineStorage.createTempDecryptedFile(trackId, audioBytes);

      return {
        isValid: true,
        tempPlaybackUri: tempUri,
      };
    } catch (e) {
      console.warn('[OfflineLicenseValidator] Lỗi giải mã audio:', e);
      return { isValid: false, reason: 'DECRYPT_FAILED' };
    }
  },
};
