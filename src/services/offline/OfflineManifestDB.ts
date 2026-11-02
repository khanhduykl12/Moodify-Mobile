import { Storage } from '../storage';
import { OfflineTrack } from '../../types';

const MANIFEST_KEY = 'moodify_offline_manifest';
const KEY_PREFIX = 'moodify_key_';

class OfflineManifestDBManager {
  private cache: Map<string, OfflineTrack> = new Map();
  private loaded: boolean = false;

  async load(): Promise<void> {
    try {
      const raw = await Storage.getItem(MANIFEST_KEY);
      if (raw) {
        const parsed: Record<string, OfflineTrack> = JSON.parse(raw);
        this.cache = new Map(Object.entries(parsed));
      }
      this.loaded = true;
    } catch (e) {
      console.warn('[OfflineManifestDB] Lỗi nạp manifest:', e);
      this.cache = new Map();
      this.loaded = true;
    }
  }

  private async persist(): Promise<void> {
    try {
      const obj: Record<string, OfflineTrack> = {};
      for (const [k, v] of this.cache.entries()) {
        obj[k] = v;
      }
      await Storage.setItem(MANIFEST_KEY, JSON.stringify(obj));
    } catch (e) {
      console.warn('[OfflineManifestDB] Lỗi lưu manifest:', e);
    }
  }

  async getAll(): Promise<OfflineTrack[]> {
    if (!this.loaded) await this.load();
    return Array.from(this.cache.values()).filter(
      (t) => t.status === 'DOWNLOADED' || t.status === 'DOWNLOADING' || t.status === 'QUEUED'
    );
  }

  async get(trackId: string): Promise<OfflineTrack | null> {
    if (!this.loaded) await this.load();
    return this.cache.get(trackId) || null;
  }

  async set(trackId: string, track: OfflineTrack): Promise<void> {
    if (!this.loaded) await this.load();
    this.cache.set(trackId, track);
    await this.persist();
  }

  async remove(trackId: string): Promise<void> {
    if (!this.loaded) await this.load();
    this.cache.delete(trackId);
    await this.persist();
    // Xóa khóa bảo mật khỏi SecureStore
    await Storage.removeItem(`${KEY_PREFIX}${trackId}`);
  }

  // Quản lý khóa mã hóa riêng biệt qua Storage / SecureStore
  async saveEncryptionKey(trackId: string, hexKey: string): Promise<void> {
    await Storage.setItem(`${KEY_PREFIX}${trackId}`, hexKey);
  }

  async getEncryptionKey(trackId: string): Promise<string | null> {
    return await Storage.getItem(`${KEY_PREFIX}${trackId}`);
  }

  async clear(): Promise<void> {
    if (!this.loaded) await this.load();
    for (const trackId of this.cache.keys()) {
      await Storage.removeItem(`${KEY_PREFIX}${trackId}`);
    }
    this.cache.clear();
    await Storage.removeItem(MANIFEST_KEY);
  }
}

export const OfflineManifestDB = new OfflineManifestDBManager();
