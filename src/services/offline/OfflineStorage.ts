import * as FileSystem from 'expo-file-system/legacy';
import { uint8ArrayToBase64, base64ToUint8Array } from './OfflineEncryption';

const OFFLINE_DIR = `${FileSystem.documentDirectory || ''}moodify_offline/`;
const PLAYBACK_CACHE_DIR = `${FileSystem.cacheDirectory || ''}moodify_playback/`;

export const OfflineStorage = {
  /**
   * Khởi tạo các thư mục lưu trữ nếu chưa có
   */
  async init(): Promise<void> {
    try {
      if (FileSystem.documentDirectory) {
        const offInfo = await FileSystem.getInfoAsync(OFFLINE_DIR);
        if (!offInfo.exists) {
          await FileSystem.makeDirectoryAsync(OFFLINE_DIR, { intermediates: true });
        }
      }
      if (FileSystem.cacheDirectory) {
        const cacheInfo = await FileSystem.getInfoAsync(PLAYBACK_CACHE_DIR);
        if (!cacheInfo.exists) {
          await FileSystem.makeDirectoryAsync(PLAYBACK_CACHE_DIR, { intermediates: true });
        } else {
          await this.cleanupTempPlaybackFiles();
        }
      }
    } catch (err) {
      console.warn('[OfflineStorage] Lỗi khởi tạo thư mục:', err);
    }
  },

  getEncryptedFilePath(trackId: string): string {
    return `${OFFLINE_DIR}${trackId}.mfy`;
  },

  getTempPlaybackFilePath(trackId: string): string {
    return `${PLAYBACK_CACHE_DIR}playback_${trackId}.mp3`;
  },

  /**
   * Lưu file .mfy đã mã hóa vào App Document Sandbox
   */
  async saveEncryptedFile(trackId: string, encryptedBytes: Uint8Array): Promise<string> {
    await this.init();
    const filePath = this.getEncryptedFilePath(trackId);
    const b64 = uint8ArrayToBase64(encryptedBytes);
    await FileSystem.writeAsStringAsync(filePath, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return filePath;
  },

  /**
   * Đọc file .mfy từ App Document Sandbox
   */
  async readEncryptedFile(trackId: string): Promise<Uint8Array | null> {
    const filePath = this.getEncryptedFilePath(trackId);
    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists) {
      return null;
    }
    const b64 = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return base64ToUint8Array(b64);
  },

  /**
   * Tạo file audio giải mã tạm thời trong cache để Webview/Audio Player phát
   */
  async createTempDecryptedFile(trackId: string, audioBytes: Uint8Array): Promise<string> {
    await this.init();
    const tempPath = this.getTempPlaybackFilePath(trackId);
    const b64 = uint8ArrayToBase64(audioBytes);
    await FileSystem.writeAsStringAsync(tempPath, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return tempPath;
  },

  /**
   * Xóa file audio giải mã tạm trong cache để bảo vệ dữ liệu
   */
  async cleanupTempPlaybackFiles(): Promise<void> {
    try {
      const info = await FileSystem.getInfoAsync(PLAYBACK_CACHE_DIR);
      if (info.exists) {
        await FileSystem.deleteAsync(PLAYBACK_CACHE_DIR, { idempotent: true });
      }
      await FileSystem.makeDirectoryAsync(PLAYBACK_CACHE_DIR, { intermediates: true });
    } catch (err) {
      console.warn('[OfflineStorage] Lỗi xóa temp playback cache:', err);
    }
  },

  /**
   * Xóa file mã hóa của bài hát khi người dùng xóa khỏi offline
   */
  async deleteEncryptedFile(trackId: string): Promise<void> {
    try {
      const filePath = this.getEncryptedFilePath(trackId);
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(filePath, { idempotent: true });
      }
      const tempPath = this.getTempPlaybackFilePath(trackId);
      const tempInfo = await FileSystem.getInfoAsync(tempPath);
      if (tempInfo.exists) {
        await FileSystem.deleteAsync(tempPath, { idempotent: true });
      }
    } catch (err) {
      console.warn('[OfflineStorage] Lỗi khi xóa file:', err);
    }
  },

  /**
   * Kiểm tra xem file .mfy có thực sự tồn tại trên ổ đĩa không
   */
  async hasEncryptedFile(trackId: string): Promise<boolean> {
    const filePath = this.getEncryptedFilePath(trackId);
    const info = await FileSystem.getInfoAsync(filePath);
    return info.exists;
  },

  /**
   * Lấy dung lượng còn trống trên thiết bị (bytes)
   */
  async getFreeSpace(): Promise<number> {
    try {
      const free = await FileSystem.getFreeDiskStorageAsync();
      return free || 1024 * 1024 * 1024;
    } catch {
      return 1024 * 1024 * 1024; // Mặc định 1GB nếu không đọc được
    }
  },
};
