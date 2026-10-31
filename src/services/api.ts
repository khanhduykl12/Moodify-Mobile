import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '../constants/config';
import { Storage } from './storage';
import {
  AuthResponse,
  Track,
  TrackPageResponse,
  Playlist,
  UserProfile,
  Album,
  Artist,
  SubscriptionPackage,
  CheckoutResult,
  NotificationItem,
  OfflineVerifyResult,
  OfflineStatus,
  OfflineQuota,
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

export const AuthApi = {
  login: async (credentials: { usernameOrEmail: string; password: string }): Promise<AuthResponse> => {
    const res = await apiClient.post<AuthResponse>('/auth/login', credentials);
    if (res.data.accessToken) {
      await Storage.saveTokens(res.data.accessToken, res.data.refreshToken);
      if (res.data.user) {
        await Storage.setItem('moodify_user_info', JSON.stringify(res.data.user));
      }
    }
    return res.data;
  },

  register: async (payload: {
    username: string;
    email: string;
    password: string;
    fullname: string;
    phone?: string;
  }): Promise<AuthResponse> => {
    const res = await apiClient.post<AuthResponse>('/auth/register', payload);
    if (res.data.accessToken) {
      await Storage.saveTokens(res.data.accessToken, res.data.refreshToken);
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
    const res = await apiClient.get<TrackPageResponse>('/tracks/search', {
      params: { q: query, page, size },
    });
    return res.data;
  },

  getTracksByMood: async (moodQuery: string, size = 20): Promise<Track[]> => {
    try {
      const res = await apiClient.get<TrackPageResponse>('/tracks', {
        params: { mode: 'mood', query: moodQuery, size },
      });
      return res.data?.content || [];
    } catch {
      return [];
    }
  },

  getTracksByGenre: async (genre: string, page = 0, size = 20): Promise<TrackPageResponse> => {
    const res = await apiClient.get<TrackPageResponse>('/tracks', {
      params: { genre, page, size },
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
    try {
      const res = await apiClient.get<any[]>('/packages');
      return (res.data || []).map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        priceVnd: p.priceVnd || p.price || 0,
        durationDays: p.durationDays || 30,
        badge: p.badge || 'VIP',
        features: p.features || [
          'Âm thanh chuẩn Lossless 320kbps',
          'Không quảng cáo ngắt quãng',
          'Tải nhạc nghe ngoại tuyến không giới hạn',
          'Huy hiệu thành viên VIP độc quyền',
        ],
        tierCode: p.tierCode,
      }));
    } catch {
      return [
        {
          id: 1,
          name: 'Gói Cá Nhân (1 Tháng)',
          description: 'Trải nghiệm toàn bộ kho nhạc không quảng cáo',
          priceVnd: 59000,
          durationDays: 30,
          badge: 'PHỔ BIẾN',
          features: [
            'Âm thanh chuẩn Lossless 320kbps',
            'Không quảng cáo ngắt quãng',
            'Mở khóa toàn bộ album VIP',
            'Tự do chuyển bài không giới hạn',
          ],
        },
        {
          id: 2,
          name: 'Gói Sinh Viên',
          description: 'Ưu đãi đặc biệt cho sinh viên',
          priceVnd: 29000,
          durationDays: 30,
          badge: 'TIẾT KIỆM',
          features: [
            'Âm thanh chất lượng cao HD',
            'Không quảng cáo làm phiền',
            'Hỗ trợ toàn bộ tính năng nghe nhạc',
          ],
        },
        {
          id: 3,
          name: 'Gói 1 Năm (Siêu Tiết Kiệm)',
          description: 'Nghe nhạc thả ga trọn vẹn 365 ngày',
          priceVnd: 499000,
          durationDays: 365,
          badge: 'TIẾT KIỆM 30%',
          features: [
            'Tất cả quyền lợi của gói VIP',
            'Tiết kiệm đến 30% so với gia hạn tháng',
            'Huy hiệu VIP Kim Cương',
            'Ưu tiên hỗ trợ 24/7',
          ],
        },
      ];
    }
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
    const res = await apiClient.post<CheckoutResult>('/subscriptions/checkout', { packageId });
    return res.data;
  },

  getPaymentStatus: async (orderCode: string): Promise<{ status: string; orderCode: string }> => {
    const res = await apiClient.get<{ status: string; orderCode: string }>(
      `/subscriptions/payment-status/${orderCode}`
    );
    return res.data;
  },
};

export const SearchHistoryApi = {
  getHistory: async (page = 0, size = 15): Promise<string[]> => {
    try {
      const res = await apiClient.get<any>('/users/me/search-history', {
        params: { page, size },
      });
      return (res.data?.content || []).map((item: any) => item.query || item.searchQuery || item.q || '').filter(Boolean);
    } catch {
      return [];
    }
  },

  recordSearch: async (query: string): Promise<void> => {
    try {
      await apiClient.post('/users/me/search-history', { query, searchType: 'ALL' });
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




export const OfflineApi = {
  requestDownload: async (payload: {
    trackId: string;
    deviceUuid: string;
    deviceName?: string;
    platform?: string;
  }): Promise<{
    success: boolean;
    downloadToken: string;
    downloadUrl: string;
    encryptionKey: string;
    expiresAt: string;
    track: Track;
    quota: { used: number; max: number };
  }> => {
    const res = await apiClient.post('/offline/request-download', payload);
    return res.data;
  },

  confirmDownload: async (payload: {
    downloadToken: string;
    fileHash?: string;
    fileSize?: number;
    localPath?: string;
  }): Promise<{ success: boolean; message: string; trackId: string }> => {
    const res = await apiClient.post('/offline/confirm-download', payload);
    return res.data;
  },

  verifyLicenses: async (payload: {
    deviceUuid: string;
    trackIds: string[];
  }): Promise<OfflineVerifyResult> => {
    const res = await apiClient.post('/offline/verify-license', payload);
    return res.data;
  },

  removeDownload: async (deviceUuid: string, trackId: string): Promise<void> => {
    await apiClient.delete('/offline/remove', {
      params: { deviceUuid, trackId },
    });
  },

  getMyDownloads: async (deviceUuid: string): Promise<{
    tracks: Array<{
      trackId: string;
      status: OfflineStatus;
      localPath: string;
      downloadedAt: string;
      expiresAt: string;
      track: Track;
    }>;
    quota: OfflineQuota;
    isPremium: boolean;
    subscriptionExpiresAt: string;
  }> => {
    const res = await apiClient.get('/offline/my-downloads', {
      params: { deviceUuid },
    });
    return res.data;
  },

  renewAll: async (deviceUuid: string): Promise<{
    success: boolean;
    renewedCount: number;
    newExpiresAt: string;
    message: string;
  }> => {
    const res = await apiClient.post('/offline/renew-all', null, {
      params: { deviceUuid },
    });
    return res.data;
  },
};
