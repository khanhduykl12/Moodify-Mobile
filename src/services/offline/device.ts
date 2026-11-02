import * as Device from 'expo-device';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { Storage } from '../storage';

const DEVICE_UUID_KEY = 'moodify_device_uuid';

export async function getDeviceUuid(): Promise<string> {
  let uuid = await Storage.getItem(DEVICE_UUID_KEY);
  if (!uuid) {
    uuid = Crypto.randomUUID();
    await Storage.setItem(DEVICE_UUID_KEY, uuid);
  }
  return uuid;
}

export function getDeviceName(): string {
  return Device.modelName || Device.deviceName || 'Thiết bị Moodify';
}

export function getPlatform(): string {
  if (Platform.OS === 'ios') return 'IOS';
  if (Platform.OS === 'android') return 'ANDROID';
  return 'OTHER';
}
