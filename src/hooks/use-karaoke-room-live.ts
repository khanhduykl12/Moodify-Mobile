// Realtime WebSocket cho Karaoke — port từ use-karaoke-room-live.ts của web
// RN có WebSocket toàn cục nên giao thức giữ nguyên: auth bằng accessToken
// trong frame đầu, heartbeat 20s, reconnect backoff theo mũ.

import { useEffect, useRef, useState } from 'react';
import { KaraokeApi } from '../services/api';
import { Storage } from '../services/storage';
import { STORAGE_KEYS } from '../constants/config';

type LiveScope = 'rooms' | 'room';

export type KaraokeLiveEvent = {
  type: string;
  roomId?: number;
  code?: string;
};

type UseKaraokeRoomLiveOptions = {
  scope: LiveScope;
  roomId?: number;
  enabled: boolean;
  beforeConnect?: () => Promise<void>;
  onEvent?: (event: KaraokeLiveEvent) => boolean | void;
  onSubscribed?: () => void;
  onError?: (error: Error) => void;
};

export function useKaraokeRoomLive({
  scope,
  roomId,
  enabled,
  beforeConnect,
  onEvent,
  onSubscribed,
  onError,
}: UseKaraokeRoomLiveOptions) {
  const [connected, setConnected] = useState(false);
  const callbacks = useRef({ beforeConnect, onEvent, onSubscribed, onError });

  useEffect(() => {
    callbacks.current = { beforeConnect, onEvent, onSubscribed, onError };
  }, [beforeConnect, onEvent, onSubscribed, onError]);

  useEffect(() => {
    if (!enabled || (scope === 'room' && !roomId)) {
      return;
    }

    let stopped = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    let connectionTimeout: ReturnType<typeof setTimeout> | undefined;
    let subscriptionTimeout: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const scheduleReconnect = () => {
      attempts += 1;
      const delay = Math.min(10_000, 700 * 2 ** Math.min(attempts, 4));
      reconnectTimer = setTimeout(connect, delay);
    };

    const connect = async () => {
      try {
        await callbacks.current.beforeConnect?.();
        // beforeConnect (join qua apiClient) vừa refresh token nếu hết hạn
        const accessToken = await Storage.getAccessToken();
        if (!accessToken) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        if (stopped) return;

        const deviceUuid = (await Storage.getItem(STORAGE_KEYS.DEVICE_UUID)) || '';
        const currentSocket = new WebSocket(KaraokeApi.getRoomSocketUrl());
        socket = currentSocket;
        connectionTimeout = setTimeout(() => {
          if (currentSocket.readyState === WebSocket.CONNECTING) {
            currentSocket.close(4000, 'connection timeout');
          }
        }, 5000);

        currentSocket.onopen = () => {
          if (connectionTimeout !== undefined) clearTimeout(connectionTimeout);
          connectionTimeout = undefined;
          currentSocket.send(
            JSON.stringify({
              type: scope === 'rooms' ? 'subscribeRooms' : 'subscribeRoom',
              ...(scope === 'room' ? { roomId } : {}),
              accessToken,
              deviceUuid,
            })
          );
          subscriptionTimeout = setTimeout(() => {
            if (currentSocket.readyState === WebSocket.OPEN) {
              currentSocket.close(4000, 'subscription timeout');
            }
          }, 5000);
        };

        currentSocket.onmessage = (message) => {
          let event: KaraokeLiveEvent;
          try {
            event = JSON.parse(String(message.data)) as KaraokeLiveEvent;
          } catch {
            return;
          }
          if (event.type === 'subscribed') {
            if (subscriptionTimeout !== undefined) clearTimeout(subscriptionTimeout);
            subscriptionTimeout = undefined;
            attempts = 0;
            setConnected(true);
            callbacks.current.onSubscribed?.();
            if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer);
            heartbeatTimer = setInterval(() => {
              if (currentSocket.readyState === WebSocket.OPEN) {
                currentSocket.send(JSON.stringify({ type: 'heartbeat' }));
              }
            }, 20_000);
            return;
          }
          if (event.type === 'heartbeat.ack') return;
          if (event.type === 'error') {
            callbacks.current.onError?.(new Error(event.code || 'Không thể kết nối phòng.'));
            currentSocket.close(1008, event.code || 'subscription rejected');
            return;
          }
          const stopListening = callbacks.current.onEvent?.(event) === true;
          if (stopListening) {
            stopped = true;
            setConnected(false);
            if (heartbeatTimer !== undefined) {
              clearInterval(heartbeatTimer);
              heartbeatTimer = undefined;
            }
            currentSocket.close(1000, 'room closed');
          }
        };

        currentSocket.onerror = () => {
          callbacks.current.onError?.(new Error('Kết nối realtime bị gián đoạn.'));
          currentSocket.close();
        };

        currentSocket.onclose = () => {
          if (connectionTimeout !== undefined) clearTimeout(connectionTimeout);
          if (subscriptionTimeout !== undefined) clearTimeout(subscriptionTimeout);
          connectionTimeout = undefined;
          subscriptionTimeout = undefined;
          setConnected(false);
          if (heartbeatTimer !== undefined) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = undefined;
          }
          if (stopped) return;
          scheduleReconnect();
        };
      } catch (error) {
        if (stopped) return;
        setConnected(false);
        callbacks.current.onError?.(error instanceof Error ? error : new Error('Không thể kết nối phòng.'));
        scheduleReconnect();
      }
    };

    void connect();
    return () => {
      stopped = true;
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer);
      if (connectionTimeout !== undefined) clearTimeout(connectionTimeout);
      if (subscriptionTimeout !== undefined) clearTimeout(subscriptionTimeout);
      socket?.close(1000, 'page closed');
    };
  }, [enabled, roomId, scope]);

  return { connected: connected && enabled && (scope !== 'room' || Boolean(roomId)) };
}
