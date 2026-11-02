import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { API_BASE_URL, STORAGE_KEYS } from '../constants/config';
import { Storage } from './storage';
import {
  AuthResponse,
  Track,
  TrackPageResponse,
  Playlist,
  UserProfile,
  RegisterPayload,
  Album,
  Artist,
  SubscriptionPackage,
  CheckoutResult,
  PaymentStatusResult,
  ActiveAd,
  NotificationItem,
  MoodRecommendationResponse,
} from '../types';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Bypass-Tunnel-Reminder': 'true',
  },
});

// Interceptor: Tự động đính kèm Bearer token vào mỗi request
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await Storage.getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor: Bắt lỗi 401 Unauthorized để refresh token
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = await Storage.getRefreshToken();
        if (refreshToken) {
          const res = await axios.post<AuthResponse>(`${API_BASE_URL}/auth/refresh`, {
            refreshToken,
          });
          if (res.data?.accessToken) {
            await Storage.saveTokens(res.data.accessToken, res.data.refreshToken);
            originalRequest.headers.Authorization = `Bearer ${res.data.accessToken}`;
            return apiClient(originalRequest);
          }
        }
      } catch (refreshErr) {
        // Refresh thất bại -> xóa token để người dùng đăng nhập lại
        await Storage.clearTokens();
      }
    }
    return Promise.reject(error);
  }
);

// ============================================================================
// API Methods
// ============================================================================

// Map AuthResponse của backend (flat fields) sang UserProfile để lưu Storage
const mapAuthResponseToUser = (data: AuthResponse): UserProfile => ({
  id: data.userId,
  fullName: data.fullName || data.username || '',
  email: data.email || '',
  username: data.username || '',
  role: (data.role as UserProfile['role']) || 'USER',
  status: data.status || 'ACTIVE',
});

// UUID cố định cho thiết bị này — backend dùng để quản lý đăng nhập theo thiết bị
const getDeviceUuid = async (): Promise<string> => {
  let uuid = await Storage.getItem(STORAGE_KEYS.DEVICE_UUID);
  if (!uuid) {
    uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    await Storage.setItem(STORAGE_KEYS.DEVICE_UUID, uuid);
  }
  return uuid;
};

const getDeviceInfo = async () => ({
  deviceUuid: await getDeviceUuid(),
  deviceName: Device.deviceName || Device.modelName || 'Moodify Mobile',
  platform: Platform.OS,
});

export const AuthApi = {
  login: async (credentials: { identifier: string; password: string }): Promise<AuthResponse> => {
    const res = await apiClient.post<AuthResponse>('/auth/login', {
      identifier: credentials.identifier,
      password: credentials.password,
      ...(await getDeviceInfo()),
    });
    if (res.data.accessToken) {
      await Storage.saveTokens(res.data.accessToken, res.data.refreshToken);
      await Storage.setItem('moodify_user_info', JSON.stringify(mapAuthResponseToUser(res.data)));
    }
    return res.data;
  },

  register: async (payload: RegisterPayload): Promise<AuthResponse> => {
    const res = await apiClient.post<AuthResponse>('/auth/register', payload);
    if (res.data.accessToken) {
      await Storage.saveTokens(res.data.accessToken, res.data.refreshToken);
      await Storage.setItem('moodify_user_info', JSON.stringify(mapAuthResponseToUser(res.data)));
    }
    return res.data;
  },

  // Đăng nhập Google: gửi id_token (JWT) hoặc access_token — backend tự nhận diện cả hai
  loginWithGoogle: async (idToken: string): Promise<AuthResponse> => {
    const res = await apiClient.post<AuthResponse>('/auth/google', {
      idToken,
      ...(await getDeviceInfo()),
    });
    if (res.data.accessToken) {
      await Storage.saveTokens(res.data.accessToken, res.data.refreshToken);
      await Storage.setItem('moodify_user_info', JSON.stringify(mapAuthResponseToUser(res.data)));
    }
    return res.data;
  },

  // Google Authorization Code + PKCE: backend tự đổi code lấy access token.
  // clientId: client web (đổi kèm secret ở backend) hoặc client native Android/iOS
  // (Google không phát hành secret — backend exchange theo dạng installed app).
  loginWithGoogleCode: async (
    code: string,
    codeVerifier: string,
    redirectUri: string,
    clientId?: string
  ): Promise<AuthResponse> => {
    const res = await apiClient.post<AuthResponse>('/auth/google/code', {
      code,
      codeVerifier,
      redirectUri,
      clientId: clientId || undefined,
      ...(await getDeviceInfo()),
    });
    if (res.data.accessToken) {
      await Storage.saveTokens(res.data.accessToken, res.data.refreshToken);
      await Storage.setItem('moodify_user_info', JSON.stringify(mapAuthResponseToUser(res.data)));
    }
    return res.data;
  },

  // Đăng nhập Facebook: gửi access_token — backend xác minh qua Graph API
  loginWithFacebook: async (accessToken: string): Promise<AuthResponse> => {
    const res = await apiClient.post<AuthResponse>('/auth/facebook', {
      accessToken,
      ...(await getDeviceInfo()),
    });
    if (res.data.accessToken) {
      await Storage.saveTokens(res.data.accessToken, res.data.refreshToken);
      await Storage.setItem('moodify_user_info', JSON.stringify(mapAuthResponseToUser(res.data)));
    }
    return res.data;
  },

  getProfile: async (): Promise<UserProfile> => {
    const res = await apiClient.get<UserProfile>('/auth/me');
    return res.data;
  },

  logout: async (): Promise<void> => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // bỏ qua lỗi nếu token đã hết hạn
    } finally {
      await Storage.clearTokens();
    }
  },
};

export const TrackApi = {
  getTracks: async (page = 0, size = 20): Promise<TrackPageResponse> => {
    const res = await apiClient.get<TrackPageResponse>('/tracks', {
      params: { page, size },
    });
    return res.data;
  },

  getTrackById: async (id: string): Promise<Track> => {
    const res = await apiClient.get<Track>(`/tracks/${id}`);
    return res.data;
  },

  searchTracks: async (query: string, page = 0, size = 20): Promise<TrackPageResponse> => {
    const res = await apiClient.get<TrackPageResponse>('/tracks', {
      params: { query, page, size },
    });
    return res.data;
  },

  getTracksByGenre: async (genre: string, page = 0, size = 20): Promise<TrackPageResponse> => {
    const res = await apiClient.get<TrackPageResponse>('/tracks', {
      params: { genre, page, size },
    });
    return res.data;
  },
};

// Gợi ý nhạc theo tâm trạng: backend gọi mô hình AI phân tích cảm xúc từ văn bản
// (Text -> Emotion -> Track playlist), cùng endpoint với web.
export const EmotionApi = {
  recommend: async (text: string, strategy = 'empathy', limit = 50): Promise<MoodRecommendationResponse> => {
    const res = await apiClient.post<MoodRecommendationResponse>('/emotions/recommend', {
      text,
      strategy,
      limit,
    });
    return res.data;
  },
};

export const PlaylistApi = {
  getMyPlaylists: async (): Promise<Playlist[]> => {
    const res = await apiClient.get<Playlist[]>('/playlists/me');
    return res.data;
  },

  getPlaylistById: async (id: string): Promise<Playlist> => {
    const res = await apiClient.get<Playlist>(`/playlists/${id}`);
    return res.data;
  },

  createPlaylist: async (payload: {
    name: string;
    description?: string;
    coverUrl?: string;
    isPublic?: boolean;
  }): Promise<Playlist> => {
    const res = await apiClient.post<Playlist>('/playlists', {
      name: payload.name,
      description: payload.description || '',
      coverUrl: payload.coverUrl || null,
      isPublic: payload.isPublic ?? true,
    });
    return res.data;
  },

  addTrackToPlaylist: async (playlistId: string, trackSpotifyId: string): Promise<Playlist> => {
    const res = await apiClient.post<Playlist>(`/playlists/${playlistId}/tracks`, {
      trackSpotifyId,
    });
    return res.data;
  },

  removeTrackFromPlaylist: async (playlistId: string, trackSpotifyId: string): Promise<Playlist> => {
    const res = await apiClient.delete<Playlist>(`/playlists/${playlistId}/tracks/${trackSpotifyId}`);
    return res.data;
  },

  deletePlaylist: async (playlistId: string): Promise<void> => {
    await apiClient.delete(`/playlists/${playlistId}`);
  },
};

export const UserLibraryApi = {
  // Trả về nguyên trang dữ liệu (kèm totalElements) — không nuốt lỗi để màn hình phân biệt "rỗng" với "lỗi mạng"
  getLikedTracksPage: async (page = 0, size = 50): Promise<{ tracks: Track[]; totalElements: number }> => {
    const res = await apiClient.get<{ tracks: Track[]; totalElements?: number }>('/users/me/library/tracks', {
      params: { page, size },
    });
    return { tracks: res.data?.tracks || [], totalElements: res.data?.totalElements || 0 };
  },

  getLikedTracks: async (page = 0, size = 50): Promise<Track[]> => {
    try {
      const res = await apiClient.get<{ tracks: Track[] }>('/users/me/library/tracks', {
        params: { page, size },
      });
      return res.data?.tracks || [];
    } catch {
      return [];
    }
  },

  getLikedTrackIds: async (): Promise<string[]> => {
    try {
      const res = await apiClient.get<string[]>('/users/me/library/track-ids');
      return res.data || [];
    } catch {
      return [];
    }
  },

  likeTrack: async (trackSpotifyId: string): Promise<void> => {
    await apiClient.post(`/users/me/library/tracks/${trackSpotifyId}`);
  },

  unlikeTrack: async (trackSpotifyId: string): Promise<void> => {
    await apiClient.delete(`/users/me/library/tracks/${trackSpotifyId}`);
  },

  checkTrackLiked: async (trackSpotifyId: string): Promise<boolean> => {
    try {
      const res = await apiClient.get<{ exists: boolean }>(`/users/me/library/tracks/${trackSpotifyId}/exists`);
      return !!res.data?.exists;
    } catch {
      return false;
    }
  },
};

export const AlbumApi = {
  getPublicAlbums: async (q = '', page = 0, size = 20): Promise<{ content: Album[]; totalPages: number }> => {
    try {
      const res = await apiClient.get<any>('/albums', {
        params: { q: q || undefined, page, size },
      });
      return {
        content: res.data?.content || [],
        totalPages: res.data?.totalPages || 1,
      };
    } catch {
      return { content: [], totalPages: 1 };
    }
  },

  getAlbumDetail: async (id: number): Promise<Album | null> => {
    try {
      const res = await apiClient.get<Album>(`/albums/${id}`);
      return res.data;
    } catch {
      return null;
    }
  },

  toggleFavorite: async (albumId: number | string): Promise<boolean> => {
    const res = await apiClient.post<{ favorited: boolean }>(`/albums/${albumId}/favorite`);
    return !!res.data?.favorited;
  },

  getFavoriteStatus: async (albumId: number | string): Promise<boolean> => {
    try {
      const res = await apiClient.get<{ favorited: boolean }>(`/albums/${albumId}/favorite/status`);
      return !!res.data?.favorited;
    } catch {
      return false;
    }
  },

  getUserFavoriteAlbums: async (): Promise<Album[]> => {
    try {
      const res = await apiClient.get<Album[]>('/albums/favorites/me');
      return res.data || [];
    } catch {
      return [];
    }
  },
};

export const ArtistApi = {
  getArtistProfile: async (artistId: string): Promise<Artist | null> => {
    try {
      const res = await apiClient.get<any>(`/artists/${artistId}`);
      return res.data;
    } catch {
      return null;
    }
  },

  getArtistTracks: async (artistId: string, page = 0, size = 20): Promise<Track[]> => {
    try {
      const res = await apiClient.get<TrackPageResponse>(`/artists/${artistId}/tracks`, {
        params: { page, size },
      });
      return res.data?.content || [];
    } catch {
      return [];
    }
  },

  followArtist: async (artistId: string): Promise<void> => {
    await apiClient.post(`/artists/${artistId}/follow`);
  },

  unfollowArtist: async (artistId: string): Promise<void> => {
    await apiClient.delete(`/artists/${artistId}/follow`);
  },
};

export const SubscriptionApi = {
  getPackages: async (): Promise<SubscriptionPackage[]> => {
    const res = await apiClient.get<any[]>('/packages');
    const rows = Array.isArray(res.data) ? res.data : [];

    return rows
      .map((p) => {
        const priceVnd = Number(p.priceVnd ?? p.price);
        const durationDays = Number(p.durationDays ?? p.duration_days);

        return {
          id: Number(p.id),
          name: typeof p.name === 'string' ? p.name : '',
          description: typeof p.description === 'string' ? p.description : '',
          priceVnd,
          durationDays,
          badge: typeof p.badge === 'string' ? p.badge : undefined,
          features: Array.isArray(p.features) ? p.features : undefined,
          tierCode: p.tierCode ?? p.tierId ?? p.tier_id,
        };
      })
      .filter((pkg) =>
        Number.isFinite(pkg.id) &&
        pkg.name.length > 0 &&
        Number.isFinite(pkg.priceVnd) &&
        Number.isFinite(pkg.durationDays) &&
        pkg.durationDays > 0
      );
  },

  getMySubscription: async (): Promise<any> => {
    try {
      const res = await apiClient.get('/subscriptions/me');
      return res.data;
    } catch {
      return null;
    }
  },

  checkout: async (packageId: number): Promise<CheckoutResult> => {
    const res = await apiClient.post<Record<string, unknown>>('/subscriptions/checkout', { packageId });
    const data = res.data;
    const result: CheckoutResult = {
      success: data.success === true,
      orderCode: String(data.orderCode ?? '').trim(),
      qrUrl: String(data.qrUrl ?? '').trim(),
      bankName: String(data.bankName ?? '').trim(),
      bankAccount: String(data.bankAccount ?? '').trim(),
      accountName: String(data.accountName ?? '').trim(),
      amount: Number(data.amount),
      transferContent: String(data.transferContent ?? '').trim(),
      packageId: Number(data.packageId ?? packageId),
      packageName: typeof data.packageName === 'string' ? data.packageName : undefined,
    };

    if (
      !result.success ||
      !result.orderCode ||
      !result.qrUrl ||
      !result.bankName ||
      !result.bankAccount ||
      !result.accountName ||
      !result.transferContent ||
      !Number.isFinite(result.amount) ||
      result.amount <= 0
    ) {
      throw new Error('Backend trả về thông tin thanh toán chưa đầy đủ.');
    }

    return result;
  },

  getPaymentStatus: async (orderCode: string): Promise<PaymentStatusResult> => {
    const res = await apiClient.get<PaymentStatusResult>(
      `/subscriptions/payment-status/${orderCode}`
    );
    return res.data;
  },
};

export const AdsApi = {
  // Danh sách chiến dịch quảng cáo đang hiệu lực (API public của backend)
  getActiveAds: async (): Promise<ActiveAd[]> => {
    try {
      const res = await apiClient.get<ActiveAd[]>('/ads/active');
      const rows = Array.isArray(res.data) ? res.data : [];
      return rows.filter(
        (ad) => ad && typeof ad.id === 'string' && ad.id.length > 0 && typeof ad.audioUrl === 'string' && ad.audioUrl.length > 0
      );
    } catch {
      return [];
    }
  },

  // Ghi nhận lượt nghe quảng cáo — lỗi không ảnh hưởng trải nghiệm nghe
  recordAdImpression: async (adId: string): Promise<void> => {
    try {
      await apiClient.post(`/ads/${adId}/impression`);
    } catch {
      // Bỏ qua
    }
  },
};

export const SearchHistoryApi = {
  getHistory: async (page = 0, size = 15): Promise<string[]> => {
    try {
      const res = await apiClient.get<any>('/users/me/search-history', {
        params: { page, size },
      });
      return (res.data?.content || [])
        .map((item: any) => item.keyword || item.query || item.searchQuery || item.q || '')
        .filter(Boolean);
    } catch {
      return [];
    }
  },

  recordSearch: async (
    query: string,
    options?: { searchType?: string; detectedEmotion?: string; emotionConfidence?: number }
  ): Promise<void> => {
    try {
      await apiClient.post('/users/me/search-history', {
        keyword: query,
        searchType: options?.searchType || 'ALL',
        ...(options?.detectedEmotion ? { detectedEmotion: options.detectedEmotion } : {}),
        ...(typeof options?.emotionConfidence === 'number'
          ? { emotionConfidence: options.emotionConfidence }
          : {}),
      });
    } catch {}
  },
};

export const NotificationApi = {
  getMyNotifications: async (limit = 30): Promise<{ items: NotificationItem[]; unreadCount: number }> => {
    try {
      const res = await apiClient.get<any>('/notifications/me', {
        params: { limit },
      });
      return {
        items: res.data?.items || [],
        unreadCount: res.data?.unreadCount || 0,
      };
    } catch {
      return { items: [], unreadCount: 0 };
    }
  },

  markRead: async (id: string): Promise<void> => {
    try {
      await apiClient.post(`/notifications/${id}/read`);
    } catch {}
  },

  markAllRead: async (): Promise<void> => {
    try {
      await apiClient.post('/notifications/read-all');
    } catch {}
  },
};


