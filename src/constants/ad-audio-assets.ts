export type AdAudioAsset = {
  id: string;
  title: string;
  assetModule: number;
};

// Khai báo require tĩnh để Metro/Expo đóng gói MP3 cùng ứng dụng.
export const AD_AUDIO_ASSETS: AdAudioAsset[] = [
  {
    id: 'ad_mix_1',
    title: 'Quảng cáo Moodify',
    assetModule: require('../../assets/audio/ads/ad_mix_1.mp3'),
  },
  {
    id: 'ad_mix_2',
    title: 'Quảng cáo Moodify',
    assetModule: require('../../assets/audio/ads/ad_mix_2.mp3'),
  },
  {
    id: 'ad_mix_3',
    title: 'Quảng cáo Moodify',
    assetModule: require('../../assets/audio/ads/ad_mix_3.mp3'),
  },
  {
    id: 'ad_mix_4',
    title: 'Quảng cáo Moodify',
    assetModule: require('../../assets/audio/ads/ad_mix_4.mp3'),
  },
  {
    id: 'ad_mix_5',
    title: 'Quảng cáo Moodify',
    assetModule: require('../../assets/audio/ads/ad_mix_5.mp3'),
  },
  {
    id: 'ad_mix_6',
    title: 'Quảng cáo Moodify',
    assetModule: require('../../assets/audio/ads/ad_mix_6.mp3'),
  },
  {
    id: 'ad_mix_7',
    title: 'Quảng cáo Moodify',
    assetModule: require('../../assets/audio/ads/ad_mix_7.mp3'),
  },
  {
    id: 'ad_mix_8',
    title: 'Quảng cáo Moodify',
    assetModule: require('../../assets/audio/ads/ad_mix_8.mp3'),
  },
  {
    id: 'ad_mix_9',
    title: 'Quảng cáo Moodify',
    assetModule: require('../../assets/audio/ads/ad_mix_9.mp3'),
  },
];

export const chooseAdAudioAsset = (previousId: string | null): AdAudioAsset | undefined => {
  if (AD_AUDIO_ASSETS.length === 0) return undefined;

  let picked = AD_AUDIO_ASSETS[Math.floor(Math.random() * AD_AUDIO_ASSETS.length)];
  if (!picked) return undefined;

  if (AD_AUDIO_ASSETS.length > 1) {
    let guard = 0;
    while (picked.id === previousId && guard < 10) {
      const next = AD_AUDIO_ASSETS[Math.floor(Math.random() * AD_AUDIO_ASSETS.length)];
      if (!next) break;
      picked = next;
      guard += 1;
    }
  }

  return picked;
};
