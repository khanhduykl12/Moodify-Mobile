// ============================================================================
// Types sao chép và chuẩn hóa từ hệ thống Moodify Backend & Web
// ============================================================================

export type UserRole = 'USER' | 'ARTIST' | 'ADMIN' | 'MODERATOR';

export type UserProfile = {
  id: number;
  fullname: string;
  phone?: string;
  email: string;
  username: string;
  avatarUrl?: string | null;
  role: UserRole;
  status: string;
  createdAt?: string;
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: UserProfile;
};

export type Track = {
  id: string;
  spotifyId?: string;
  name: string;
  artistName: string;
  artistSpotifyId?: string;
  albumName?: string;
  durationMs: number;
  popularity?: number;
  previewUrl: string | null;
  imageUrl: string | null;
  genres?: string[];
  lyricsPlain?: string | null;
  lyricsSynced?: string | null;
  localPath?: string | null;
};

export type TrackPageResponse = {
  content: Track[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export type Playlist = {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string | null;
  userId?: number;
  isPublic?: boolean;
  trackCount?: number;
  tracks?: Track[];
};

export type Artist = {
  id: string;
  spotifyId?: string;
  name: string;
  genres?: string[];
  followers?: number;
  popularity?: number;
  imageUrl?: string | null;
  bio?: string;
  isFollowed?: boolean;
};

export type Album = {
  id: number;
  title: string;
  description?: string;
  coverUrl?: string | null;
  authorName?: string;
  artistName?: string;
  authorAvatar?: string | null;
  releaseDate?: string;
  trackCount?: number;
  isFavorited?: boolean;
  tracks?: Track[];
};

export type SubscriptionPackage = {
  id: number;
  name: string;
  description?: string;
  priceVnd: number;
  durationDays: number;
  badge?: string;
  features?: string[];
  tierCode?: string;
};

export type CheckoutResult = {
  orderCode: string;
  qrUrl: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  amount: number;
  transferContent: string;
  packageId?: number;
  packageName?: string;
};

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  type?: 'SYSTEM' | 'PROMO' | 'BILLING' | 'MODERATION' | 'ANNOUNCEMENT';
  linkUrl?: string;
  createdAt: string;
  readAt?: string | null;
  isRead?: boolean;
};

