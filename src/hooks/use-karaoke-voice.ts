// Voice chat mediasoup cho phòng Karaoke — port từ use-mediasoup-room.ts của web
// Giao thức giữ nguyên: voice-ticket → WSS auth → RPC produce/consume.
// Khác web: dùng react-native-webrtc (registerGlobals cung cấp RTCPeerConnection/
// getUserMedia/MediaStream), mediasoup-client tự chọn ReactNative106 handler,
// không có chọn thiết bị input/output (dùng mic/loa mặc định của máy).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Device, types as MediaTypes } from 'mediasoup-client';
import { KaraokeApi } from '../services/api';

// Cung cấp RTCPeerConnection / getUserMedia / MediaStream toàn cục cho mediasoup-client.
// Chỉ chạy trên native — build web không có native module của react-native-webrtc.
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { registerGlobals } = require('react-native-webrtc');
  registerGlobals();
}

export type RemoteVoice = { userId: string; stream: MediaStream };

type MediaProducer = MediaTypes.Producer;
type MediaConsumer = MediaTypes.Consumer;
type MediaTransport = MediaTypes.Transport;
type PendingRequest = { resolve: (payload: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

type RpcResponse = {
  id?: string;
  ok?: boolean;
  payload?: Record<string, unknown>;
  error?: { message?: string };
  type?: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Không thể kết nối âm thanh phòng.';
}

function isUsableId(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && value !== 'undefined' && value !== 'null';
}

function isMissingProducerError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes('producer_not_found') ||
    message.includes('invalid_producer_id') ||
    (message.includes('producer with id') && message.includes('not found'))
  );
}

export function useKaraokeVoice(roomId: number, enabled: boolean) {
  const socketRef = useRef<WebSocket | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const recvTransportRef = useRef<MediaTransport | null>(null);
  const sendTransportRef = useRef<MediaTransport | null>(null);
  const producerRef = useRef<MediaProducer | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const consumerByProducerRef = useRef(new Map<string, MediaConsumer>());
  const userByProducerRef = useRef(new Map<string, string>());
  const pendingProducersRef = useRef(new Map<string, string>());
  const receivingProducersRef = useRef(new Set<string>());
  const closedProducersRef = useRef(new Set<string>());
  const pendingRequestsRef = useRef(new Map<string, PendingRequest>());
  const requestRef = useRef<((type: string, payload?: Record<string, unknown>) => Promise<unknown>) | null>(null);
  const ensureSendTransportRef = useRef<(() => Promise<MediaTransport>) | null>(null);
  const requestSequenceRef = useRef(0);
  const connectedRef = useRef(false);
  const microphoneBusyRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [microphoneOn, setMicrophoneOn] = useState(false);
  const [microphoneBusy, setMicrophoneBusy] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [remoteVoices, setRemoteVoices] = useState<RemoteVoice[]>([]);
  const [speakingUserIds, setSpeakingUserIds] = useState<string[]>([]);

  const clearRemoteVoice = useCallback((producerId: string) => {
    const consumer = consumerByProducerRef.current.get(producerId);
    consumer?.close();
    consumerByProducerRef.current.delete(producerId);
    closedProducersRef.current.add(producerId);
    const userId = userByProducerRef.current.get(producerId);
    userByProducerRef.current.delete(producerId);
    pendingProducersRef.current.delete(producerId);
    if (userId) setRemoteVoices((voices) => voices.filter((voice) => voice.userId !== userId));
  }, []);

  const disconnectMedia = useCallback(() => {
    connectedRef.current = false;
    producerRef.current?.close();
    producerRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    sendTransportRef.current?.close();
    recvTransportRef.current?.close();
    sendTransportRef.current = null;
    recvTransportRef.current = null;
    deviceRef.current = null;
    requestRef.current = null;
    ensureSendTransportRef.current = null;
    for (const consumer of consumerByProducerRef.current.values()) consumer.close();
    consumerByProducerRef.current.clear();
    userByProducerRef.current.clear();
    pendingProducersRef.current.clear();
    receivingProducersRef.current.clear();
    closedProducersRef.current.clear();
    setConnected(false);
    setReady(false);
    setMicrophoneOn(false);
    setMicrophoneBusy(false);
    microphoneBusyRef.current = false;
    setRemoteVoices([]);
    setSpeakingUserIds([]);
    for (const request of pendingRequestsRef.current.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('Kết nối âm thanh đã đóng.'));
    }
    pendingRequestsRef.current.clear();
  }, []);

  useEffect(() => {
    if (!enabled || !Number.isSafeInteger(roomId) || roomId <= 0) return;
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retries = 0;
    let manuallyLeaving = false;
    let connectionGeneration = 0;

    const request = <T,>(type: string, payload: Record<string, unknown> = {}, generation = connectionGeneration): Promise<T> => {
      if (generation !== connectionGeneration) {
        return Promise.reject(new Error('Phiên âm thanh đã được thay thế.'));
      }
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error('Kết nối âm thanh chưa sẵn sàng.'));
      }
      const id = `${Date.now()}-${++requestSequenceRef.current}`;
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingRequestsRef.current.delete(id);
          reject(new Error('Máy chủ voice không phản hồi kịp thời.'));
        }, 10_000);
        pendingRequestsRef.current.set(id, {
          resolve: (value) => { clearTimeout(timer); resolve(value as T); },
          reject: (error) => { clearTimeout(timer); reject(error); },
          timer,
        });
        socket.send(JSON.stringify({ id, type, payload }));
      });
    };

    const receiveProducer = async (producerId: string, userId: string, generation: number) => {
      if (generation !== connectionGeneration || !isUsableId(producerId) || !isUsableId(userId)
          || closedProducersRef.current.has(producerId) || receivingProducersRef.current.has(producerId)) return;
      const device = deviceRef.current;
      const transport = recvTransportRef.current;
      if (!device || !transport) {
        pendingProducersRef.current.set(producerId, userId);
        return;
      }
      if (consumerByProducerRef.current.has(producerId)) return;
      receivingProducersRef.current.add(producerId);
      pendingProducersRef.current.delete(producerId);
      try {
        const options = await request<{
          id: string;
          producerId: string;
          kind: 'audio';
          rtpParameters: MediaTypes.RtpParameters;
        }>('consume', {
          transportId: transport.id,
          producerId,
          rtpCapabilities: device.recvRtpCapabilities,
        }, generation);
        if (generation !== connectionGeneration || closedProducersRef.current.has(producerId)) {
          void request('close-consumer', { consumerId: options.id }, generation).catch(() => undefined);
          return;
        }
        if (!isUsableId(options.id) || !isUsableId(options.producerId) || options.producerId !== producerId) {
          if (isUsableId(options.id)) {
            void request('close-consumer', { consumerId: options.id }, generation).catch(() => undefined);
          }
          throw new Error('Máy chủ voice trả về producer không hợp lệ.');
        }
        let consumer: MediaConsumer;
        try {
          consumer = await transport.consume(options);
        } catch (error) {
          void request('close-consumer', { consumerId: options.id }, generation).catch(() => undefined);
          throw error;
        }
        if (generation !== connectionGeneration || closedProducersRef.current.has(producerId)) {
          consumer.close();
          void request('close-consumer', { consumerId: options.id }, generation).catch(() => undefined);
          return;
        }
        userByProducerRef.current.set(producerId, userId);
        consumerByProducerRef.current.set(producerId, consumer);
        // react-native-webrtc tự phát audio track remote; audio route mặc định của máy
        setRemoteVoices((voices) => [
          ...voices.filter((voice) => voice.userId !== userId),
          { userId, stream: new MediaStream([consumer.track]) },
        ]);
        await request('resume-consumer', { consumerId: consumer.id }, generation);
      } catch (error) {
        const consumer = consumerByProducerRef.current.get(producerId);
        if (consumer) {
          consumer.close();
          void request('close-consumer', { consumerId: consumer.id }, generation).catch(() => undefined);
          consumerByProducerRef.current.delete(producerId);
          userByProducerRef.current.delete(producerId);
        }
        if (generation === connectionGeneration) setRemoteVoices((voices) => voices.filter((voice) => voice.userId !== userId));
        if (isMissingProducerError(error)) {
          clearRemoteVoice(producerId);
          return;
        }
        throw error;
      } finally {
        receivingProducersRef.current.delete(producerId);
      }
    };

    const makeTransport = async (direction: 'send' | 'recv', iceServers: RTCIceServer[], generation: number) => {
      const device = deviceRef.current;
      if (!device) throw new Error('Thiết bị mediasoup chưa sẵn sàng.');
      const options = await request<MediaTypes.TransportOptions>('create-transport', { direction }, generation);
      if (generation !== connectionGeneration) throw new Error('Phiên âm thanh đã được thay thế.');
      const transport =
        direction === 'send'
          ? device.createSendTransport({ ...options, iceServers })
          : device.createRecvTransport({ ...options, iceServers });
      transport.on('connect', ({ dtlsParameters }, callback, errback) => {
        void request('connect-transport', { transportId: transport.id, dtlsParameters }, generation)
          .then(() => callback())
          .catch((error: unknown) => errback(error instanceof Error ? error : new Error(errorMessage(error))));
      });
      if (direction === 'send') {
        transport.on('produce', ({ kind, rtpParameters }, callback, errback) => {
          void request<{ id: string }>('produce', { transportId: transport.id, kind, rtpParameters }, generation)
            .then(({ id }) => callback({ id }))
            .catch((error: unknown) => errback(error instanceof Error ? error : new Error(errorMessage(error))));
        });
        sendTransportRef.current = transport;
      } else {
        recvTransportRef.current = transport;
      }
      return transport;
    };

    const connect = async () => {
      const generation = ++connectionGeneration;
      try {
        requestRef.current = (type, payload) => request(type, payload, generation);
        setVoiceError('');
        const ticket = await KaraokeApi.createVoiceTicket(roomId);
        if (disposed || generation !== connectionGeneration) return;
        const socket = new WebSocket(ticket.websocketUrl);
        socketRef.current = socket;
        socket.onopen = () => {
          if (generation === connectionGeneration) socket.send(JSON.stringify({ type: 'auth', ticket: ticket.ticket }));
        };
        socket.onmessage = (event) => {
          if (generation !== connectionGeneration) return;
          let message: RpcResponse;
          try {
            message = JSON.parse(String(event.data)) as RpcResponse;
          } catch {
            return;
          }
          if (message.id) {
            const pending = pendingRequestsRef.current.get(message.id);
            if (!pending) return;
            pendingRequestsRef.current.delete(message.id);
            clearTimeout(pending.timer);
            if (message.ok) pending.resolve(message.payload);
            else pending.reject(new Error(message.error?.message || 'Lệnh âm thanh thất bại.'));
            return;
          }
          if (message.type === 'authenticated') {
            setConnected(true);
            connectedRef.current = true;
            retries = 0;
            void (async () => {
              try {
                const capabilities = await request<{
                  routerRtpCapabilities: MediaTypes.RtpCapabilities;
                  iceServers: RTCIceServer[];
                }>('get-rtp-capabilities', {}, generation);
                if (generation !== connectionGeneration) return;
                const device = new Device();
                await device.load({ routerRtpCapabilities: capabilities.routerRtpCapabilities });
                if (generation !== connectionGeneration) return;
                deviceRef.current = device;
                // Transport gửi cần sẵn trước khi bật mic; transport nhận dựng nền sau
                await makeTransport('send', capabilities.iceServers, generation);
                ensureSendTransportRef.current = () =>
                  sendTransportRef.current
                    ? Promise.resolve(sendTransportRef.current)
                    : makeTransport('send', capabilities.iceServers, generation);
                setReady(true);

                const existing = message.payload?.existingProducers;
                if (Array.isArray(existing)) {
                  for (const item of existing) {
                    const producer = item as { producerId?: unknown; userId?: unknown };
                    if (isUsableId(producer.producerId) && isUsableId(producer.userId)) {
                      pendingProducersRef.current.set(producer.producerId, producer.userId);
                    }
                  }
                }
                void makeTransport('recv', capabilities.iceServers, generation)
                  .then(() => {
                    for (const [producerId, userId] of pendingProducersRef.current) {
                      void receiveProducer(producerId, userId, generation).catch((error: unknown) => {
                        if (generation === connectionGeneration) setVoiceError(errorMessage(error));
                      });
                    }
                  })
                  .catch((error: unknown) => {
                    if (generation === connectionGeneration) setVoiceError(errorMessage(error));
                  });
              } catch (error) {
                if (generation !== connectionGeneration) return;
                setVoiceError(errorMessage(error));
                socket.close(1011, 'media initialization failed');
              }
            })();
            return;
          }
          if (message.type === 'new-producer') {
            const producerId = message.payload?.producerId;
            const userId = message.payload?.userId;
            if (isUsableId(producerId) && isUsableId(userId)) {
              void receiveProducer(producerId, userId, generation).catch((error: unknown) => {
                if (generation === connectionGeneration) setVoiceError(errorMessage(error));
              });
            }
          }
          if (message.type === 'producer-closed') {
            const producerId = message.payload?.producerId;
            if (isUsableId(producerId)) clearRemoteVoice(producerId);
          }
          if (message.type === 'voice-speaking') {
            const userIds = message.payload?.userIds;
            setSpeakingUserIds(Array.isArray(userIds) ? userIds.map(String) : []);
          }
          if (message.type === 'voice-silence') setSpeakingUserIds([]);
        };
        socket.onerror = () => {
          if (generation === connectionGeneration) {
            setVoiceError('Không thể kết nối máy chủ voice. Kiểm tra mạng và cấu hình mediasoup.');
          }
        };
        socket.onclose = (event) => {
          if (socketRef.current === socket) socketRef.current = null;
          if (disposed || manuallyLeaving || generation !== connectionGeneration) return;
          disconnectMedia();
          if (event.code === 1008) {
            const authReason = event.reason.toUpperCase();
            if (authReason === 'VOICE_SESSION_NOT_ACTIVE' && retries < 3) {
              retries += 1;
              setVoiceError('Phiên voice đã hết hạn sau lần khởi động lại máy chủ. Đang kết nối lại…');
              retryTimer = setTimeout(() => void connect(), Math.min(1000 * 2 ** (retries - 1), 4000));
              return;
            }
            setVoiceError(
              authReason.includes('USER_ALREADY_CONNECTED')
                ? 'Micro phòng này đang được kết nối từ thiết bị khác. Hãy ngắt voice ở thiết bị đó rồi thử lại.'
                : authReason.includes('ROOM_FULL')
                  ? 'Đường truyền voice của phòng đã đủ người.'
                  : authReason === 'KARAOKE_MEDIA_SERVICE_UNAUTHORIZED'
                    ? 'Backend từ chối khóa kết nối của máy chủ voice.'
                    : authReason.startsWith('BACKEND_CONSUME_FAILED_')
                      ? 'Backend không xác thực được phiên voice. Kiểm tra kết nối giữa hai máy chủ.'
                      : authReason === 'VOICE_TICKET_INVALID'
                        ? 'Vé voice không hợp lệ. Hãy tải lại phòng để nhận vé mới.'
                        : 'Không thể xác thực kết nối voice cho phòng này.'
            );
            return;
          }
          retries += 1;
          if (retries <= 5) {
            retryTimer = setTimeout(() => void connect(), Math.min(1000 * 2 ** (retries - 1), 10_000));
          } else {
            setVoiceError('Mất kết nối âm thanh. Hãy tải lại phòng để kết nối lại.');
          }
        };
      } catch (error) {
        if (generation !== connectionGeneration) return;
        setVoiceError(errorMessage(error));
        if (!disposed && retries < 5) {
          retries += 1;
          retryTimer = setTimeout(() => void connect(), Math.min(1000 * 2 ** (retries - 1), 10_000));
        }
      }
    };

    void connect();
    return () => {
      disposed = true;
      manuallyLeaving = true;
      connectionGeneration += 1;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ id: 'leave', type: 'leave' }));
        socket.close(1000, 'left karaoke room');
      }
      disconnectMedia();
    };
  }, [clearRemoteVoice, disconnectMedia, enabled, roomId]);

  const toggleMicrophone = useCallback(async () => {
    if (microphoneBusyRef.current) return;
    microphoneBusyRef.current = true;
    setMicrophoneBusy(true);
    try {
      if (microphoneOn) {
        const producer = producerRef.current;
        const producerId = producer?.id;
        producer?.close();
        producerRef.current = null;
        micStreamRef.current?.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
        setMicrophoneOn(false);
        setVoiceError('');
        if (producerId) {
          void requestRef.current?.('close-producer', { producerId }).catch(() => undefined);
        }
        return;
      }
      if (!connectedRef.current || !socketRef.current || !deviceRef.current || !ready) {
        throw new Error('Đang kết nối máy chủ âm thanh, vui lòng thử lại sau.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamRef.current = stream;
      const transport = sendTransportRef.current ?? (await ensureSendTransportRef.current?.());
      if (!transport) throw new Error('Không thể khởi tạo đường truyền micro.');
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error('Không tìm thấy micro đang hoạt động.');
      const producer = await transport.produce({ track });
      producerRef.current = producer;
      track.addEventListener('ended', () => {
        if (producerRef.current !== producer || producer.track !== track) return;
        producer.close();
        producerRef.current = null;
        void requestRef.current?.('close-producer', { producerId: producer.id }).catch(() => undefined);
        micStreamRef.current?.getTracks().forEach((activeTrack) => activeTrack.stop());
        micStreamRef.current = null;
        setMicrophoneOn(false);
        setVoiceError('Micro đã ngắt kết nối. Hãy bật lại micro.');
      });
      setMicrophoneOn(true);
      setVoiceError('');
    } catch (error) {
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
      setVoiceError(errorMessage(error));
      setMicrophoneOn(false);
    } finally {
      microphoneBusyRef.current = false;
      setMicrophoneBusy(false);
    }
  }, [microphoneOn, ready]);

  // Mute/bật tiếng voice của một thành viên (chỉ ảnh hưởng máy mình)
  const setRemoteVoiceMuted = useCallback((userId: string, muted: boolean) => {
    for (const [producerId, voiceUserId] of userByProducerRef.current) {
      if (voiceUserId !== userId) continue;
      const consumer = consumerByProducerRef.current.get(producerId);
      const track = consumer?.track as (MediaStreamTrack & { _setVolume?: (volume: number) => void }) | undefined;
      if (track && typeof track._setVolume === 'function') {
        track._setVolume(muted ? 0 : 1);
      }
    }
  }, []);

  return {
    connected,
    ready,
    microphoneOn,
    microphoneBusy,
    remoteVoices,
    speakingUserIds,
    voiceError,
    toggleMicrophone,
    setRemoteVoiceMuted,
  };
}
