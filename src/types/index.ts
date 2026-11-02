// ============================================================================
// Types sao chép và chuẩn hóa từ hệ thống Moodify Backend & Web
// ============================================================================

export type UserRole = 'USER' | 'ARTIST' | 'ADMIN' | 'MODERATOR';

export type UserProfile = {
  id: number;
  fullName: string;
  phone?: string;
  email: string;
  username: string;
  avatarUrl?: string | null;
  role: UserRole;
  artistSpotifyId?: string | null;
  status: string;
  createdAt?: string;
  updatedAt?: string;
};

// Khớp với AuthResponse của backend (không có field "user" — tự map sang UserProfile)
export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  refreshExpiresIn: number;
  userId: number;
  fullName: string;
  email: string;
  username: string;
  role: string;
  status: string;
};

export type RegisterPayload = {
  fullName: string;
  phone: string;
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  genres?: string[];
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

// Khớp với MoodRecommendationResponse của backend (/emotions/recommend)
export type MusicRecommendationInfo = {
  strategy?: string;
  mood_analysis?: string;
  target_valence?: number;
  target_energy?: number;
  target_danceability?: number;
  target_acousticness?: number;
  target_tempo?: string;
  target_mode?: string;
  seed_genres?: string[];
};

export type EmotionInfo = {
  text?: string;
  label: string;
  emoji?: string;
  confidence?: number;
  probabilities?: Record<string, number>;
  music_recommendation?: MusicRecommendationInfo;
};

export type MoodRecommendationResponse = {
  emotion: EmotionInfo;
  tracks: Track[];
  totalMatched: number;
  candidateCount?: number;
  matchStatus?: 'MATCHED' | 'LIMITED' | 'NO_CANDIDATES' | string;
  rankingVersion?: string;
  maxMatchDistance?: number;
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
  success: boolean;
  orderCode: string;
  qrUrl: string;
  bankName: string;
  bankAccount: string;
  accountName: string;
  amount: number;
  transferContent: string;
  packageId?: number;
  packageName?: string;
};

// Khớp GET /subscriptions/payment-status/{orderCode} của backend
export type PaymentStatusResult = {
  orderCode: string;
  status: 'PENDING' | 'SUCCESS' | 'EXPIRED' | 'CANCELLED' | 'FAILED' | string;
  amount?: number;
  packageName?: string;
  paidAt?: string | null;
  startAt?: string | null;
  expiresAt?: string | null;
  isEffectiveNow?: boolean;
  isPremium?: boolean;
};

// Khớp GET /subscriptions/me của backend
export type SubscriptionInfo = {
  isPremium: boolean;
  tier?: string;
  tierId?: string;
  tierName?: string;
  packageName?: string;
  startAt?: string | null;
  expiresAt?: string | null;
  daysRemaining?: number;
  entitlements?: Partial<Entitlements>;
  [key: string]: unknown;
};

// Quyền hạn theo gói — khớp mapTierToEntitlements của backend
export type Entitlements = {
  tier: string;
  tierName?: string;
  adPolicy: 'NO_ADS' | 'DAILY_QUOTA' | 'FULL_ADS' | string;
  adFreeDailyLimit: number;
  adIntervalAfterLimit: number;
  skipPolicy: 'UNLIMITED' | 'LIMITED' | string;
  skipDailyLimit: number;
  offlineAllowed?: boolean;
  offlineMaxTracks?: number;
  maxDevices?: number;
  syncedLyrics?: boolean;
  vipBadge?: boolean;
  familySharing?: boolean;
  familyMembers?: number;
};

// Lý do chèn quảng cáo — khớp AdReason của web
export type AdReason = 'FREE_REGULAR' | 'BASIC_DAILY_LIMIT_EXCEEDED' | 'SKIP_PENALTY' | null;

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



// ============================================================================
// OFFLINE DOWNLOAD TYPES
// ============================================================================

export type OfflineStatus = 'QUEUED' | 'DOWNLOADING' | 'DOWNLOADED' | 'FAILED' | 'EXPIRED' | 'REMOVED';

export type OfflineTrack = {
  trackId: string;
  track: Track;
  status: OfflineStatus;
  localPath: string;
  downloadedAt?: string;
  expiresAt: string;
  fileSize?: number;
  downloadProgress?: number;
};

export type OfflineQuota = {
  used: number;
  max: number;
};

export type OfflineVerifyResult = {
  success: boolean;
  deviceActive: boolean;
  isPremium?: boolean;
  validTrackIds: string[];
  expiredTrackIds: string[];
  revokedTrackIds: string[];
  serverTime?: string;
};

// ============================================================================
// KARAOKE TYPES — đồng bộ với lib/api-client.ts của web Moodify
// ============================================================================

export type KaraokeLyricWord = {
  text: string;
  startMs: number;
  endMs: number;
  lineIndex: number;
  confidence: number;
};

export type KaraokeLyricLine = {
  text: string;
  startMs: number;
  endMs: number;
  firstWordIndex: number;
  wordCount: number;
};

export type KaraokeLyricTimeline = {
  version: number;
  status: 'ready' | 'needs_review' | string;
  language: string;
  method: string;
  model: string;
  sampleRate: number;
  coverage: number;
  meanConfidence: number;
  words: KaraokeLyricWord[];
  lines: KaraokeLyricLine[];
};

export type KaraokeTrackSummary = {
  songId: string;
  title: string;
  artist: string;
  imageUrl: string | null;
  durationMs: number | null;
  assetVersion: string | null;
  instrumentalUrl: string;
  lyricsPlain: string | null;
  lyricsSynced: string | null;
  lyricTimeline: KaraokeLyricTimeline | null;
  scoringAvailable: boolean;
  scoringReferenceStatus: string;
};

export type KaraokeTrackPageResponse = {
  content: KaraokeTrackSummary[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export type KaraokeSessionResponse = {
  sessionId: string;
  songId: string;
  assetVersion: string;
  referenceVersion: string;
  expiresAt: string;
};

// Pitch features client gửi lên để server chấm — grid 22050Hz / hop 512 (~43 frame/giây)
export type KaraokePitchFeatures = {
  duration_seconds: number;
  f0_hz: (number | null)[];
  voiced_probability: number[];
  rms_dbfs: number;
  clipped_fraction: number;
  recording_start_offset_ms: number;
  capture_latency_ms: number;
  allow_octave_shift: boolean;
};

export type KaraokeScoreResponse = {
  status: string;
  score: { overall: number } | null;
};

export type KaraokeRoomVisibility = 'PUBLIC' | 'PRIVATE';

export type KaraokeRoomSummary = {
  id: number;
  name: string;
  hostName: string;
  hostAvatarUrl: string | null;
  memberCount: number;
  maxMembers: number;
  visibility: KaraokeRoomVisibility;
  createdAt: string;
};

export type KaraokeRoomCreated = {
  id: number;
  name: string;
  visibility: KaraokeRoomVisibility;
  maxMembers: number;
  inviteCode: string | null;
};

export type KaraokeRoomMember = {
  userId: number;
  name: string;
  avatarUrl: string | null;
  host: boolean;
};

export type KaraokeRoomQueueItem = {
  id: number;
  trackId: string;
  title: string;
  artist: string;
  imageUrl: string | null;
  durationMs: number | null;
  requestedBy: string;
  requestedByMe: boolean;
};

export type KaraokePlaybackStatus = 'IDLE' | 'PLAYING' | 'PAUSED';

export type KaraokeRoomPlaybackTrack = {
  trackId: string;
  title: string;
  artist: string;
  imageUrl: string | null;
  durationMs: number | null;
  instrumentalUrl: string | null;
  lyricsPlain: string | null;
  lyricsSynced: string | null;
  lyricTimeline: KaraokeLyricTimeline | null;
};

export type KaraokeRoomPlayback = {
  status: KaraokePlaybackStatus;
  track: KaraokeRoomPlaybackTrack | null;
  positionMs: number;
  startedAt: string | null;
  version: number;
  serverTimeMs: number;
  playbackRunId: string | null;
};

export type KaraokeVoiceTicket = {
  ticket: string;
  websocketUrl: string;
  expiresAt: string;
};

export type KaraokeRoomDetail = {
  id: number;
  name: string;
  hostUserId: number;
  hostName: string;
  hostAvatarUrl: string | null;
  maxMembers: number;
  visibility: KaraokeRoomVisibility;
  inviteCode: string | null;
  createdAt: string;
  memberCount: number;
  canManage: boolean;
  members: KaraokeRoomMember[];
  queue: KaraokeRoomQueueItem[];
  playback: KaraokeRoomPlayback;
};

export type KaraokeRoomScoreSession = {
  sessionId: string;
  playbackRunId: string;
  songId: string;
  status: 'collecting' | 'scoring' | 'completed' | 'failed';
  ended: boolean;
  participantCount: number;
  score: { status?: string; score?: { overall: number } | null } | null;
};

export type KaraokeRoomPitchSegment = {
  offset_ms: number;
  features: KaraokePitchFeatures;
};
