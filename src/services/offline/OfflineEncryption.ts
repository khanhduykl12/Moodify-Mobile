import aesjs from 'aes-js';
import * as Crypto from 'expo-crypto';

// Magic bytes: "MFY1"
const MAGIC = [0x4d, 0x46, 0x59, 0x31];
const HEADER_SIZE = 32;

// Fast binary base64 encode/decode helpers
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < len ? bytes[i + 1] : 0;
    const b3 = i + 2 < len ? bytes[i + 2] : 0;

    result += B64_CHARS[b1 >> 2];
    result += B64_CHARS[((b1 & 3) << 4) | (b2 >> 4)];
    result += i + 1 < len ? B64_CHARS[((b2 & 15) << 2) | (b3 >> 6)] : '=';
    result += i + 2 < len ? B64_CHARS[b3 & 63] : '=';
  }
  return result;
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const cleanB64 = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = cleanB64.length;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const byteLength = (len * 3) / 4 - padding;
  const bytes = new Uint8Array(byteLength);

  let byteIdx = 0;
  for (let i = 0; i < len; i += 4) {
    const c1 = B64_CHARS.indexOf(cleanB64[i]);
    const c2 = B64_CHARS.indexOf(cleanB64[i + 1]);
    const c3 = i + 2 < len ? B64_CHARS.indexOf(cleanB64[i + 2]) : 0;
    const c4 = i + 3 < len ? B64_CHARS.indexOf(cleanB64[i + 3]) : 0;

    bytes[byteIdx++] = (c1 << 2) | (c2 >> 4);
    if (byteIdx < byteLength) bytes[byteIdx++] = ((c2 & 15) << 4) | (c3 >> 2);
    if (byteIdx < byteLength) bytes[byteIdx++] = ((c3 & 3) << 6) | c4;
  }
  return bytes;
}

export const OfflineEncryption = {
  /**
   * Mã hóa file audio bằng AES-256 CTR kèm header bảo mật Moodify (.mfy)
   * @param rawAudioBytes Binary audio gốc
   * @param hexKey Khóa 256-bit Hex nhận từ server
   * @param expiryTimestamp Thời gian hết hạn (Unix epoch ms)
   */
  async encryptAudio(
    rawAudioBytes: Uint8Array,
    hexKey: string,
    expiryTimestamp: number
  ): Promise<Uint8Array> {
    const key = aesjs.utils.hex.toBytes(hexKey);
    const iv = Crypto.getRandomBytes(16);

    // 1. Tạo Header 32 bytes
    const header = new Uint8Array(HEADER_SIZE);
    // 0..3: Magic "MFY1"
    header.set(MAGIC, 0);
    // 4..19: IV (16 bytes)
    header.set(iv, 4);

    // 20..23: Expiry timestamp (seconds) Big Endian
    const expirySec = Math.floor(expiryTimestamp / 1000);
    header[20] = (expirySec >> 24) & 0xff;
    header[21] = (expirySec >> 16) & 0xff;
    header[22] = (expirySec >> 8) & 0xff;
    header[23] = expirySec & 0xff;

    // 2. Mã hóa dữ liệu audio với AES-CTR
    const aesCtr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(iv));
    const encryptedAudio = aesCtr.encrypt(rawAudioBytes);

    // 3. Ghép Header + Encrypted Payload
    const fullEncrypted = new Uint8Array(HEADER_SIZE + encryptedAudio.length);
    fullEncrypted.set(header, 0);
    fullEncrypted.set(encryptedAudio, HEADER_SIZE);

    return fullEncrypted;
  },

  /**
   * Giải mã file .mfy thành binary audio gốc để phát nhạc
   * @param encryptedBytes File .mfy đã mã hóa
   * @param hexKey Khóa 256-bit Hex từ SecureStore
   */
  async decryptAudio(
    encryptedBytes: Uint8Array,
    hexKey: string
  ): Promise<{ audioBytes: Uint8Array; expiryTimestamp: number }> {
    if (encryptedBytes.length < HEADER_SIZE) {
      throw new Error('File không hợp lệ hoặc kích thước quá nhỏ.');
    }

    // 1. Kiểm tra Magic bytes
    for (let i = 0; i < 4; i++) {
      if (encryptedBytes[i] !== MAGIC[i]) {
        throw new Error('File không đúng định dạng Moodify Encrypted (.mfy).');
      }
    }

    // 2. Đọc IV
    const iv = encryptedBytes.slice(4, 20);

    // 3. Đọc Expiry
    const expirySec =
      (encryptedBytes[20] << 24) |
      (encryptedBytes[21] << 16) |
      (encryptedBytes[22] << 8) |
      encryptedBytes[23];
    const expiryTimestamp = expirySec * 1000;

    // Kiểm tra hết hạn tại thời điểm giải mã
    if (Date.now() > expiryTimestamp) {
      throw new Error('Bản quyền bài hát offline đã hết hạn.');
    }

    // 4. Giải mã payload với AES-CTR
    const key = aesjs.utils.hex.toBytes(hexKey);
    const ciphertext = encryptedBytes.slice(HEADER_SIZE);
    const aesCtr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(iv));
    const audioBytes = aesCtr.decrypt(ciphertext);

    return { audioBytes, expiryTimestamp };
  },
};
