export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  sourceUrl?: string;
  sourceName?: string;
  publishedTime?: string;
}

export type AssetType = 'image' | 'video';
export type AspectRatio = '16:9' | '9:16';
export type VideoDuration = '30s' | '1m' | '2m' | '3m' | '5m';

export interface Asset {
  id: string;
  type: AssetType;
  url: string;
  thumbnailUrl?: string; // For video preview
}

export interface GeneratedContent {
  script: string;
  audioUrl?: string; // Blob URL
  assets: Asset[]; // Mixed timeline of images and videos
  imagePrompt?: string; // Saved for generating more
  thumbnailUrl?: string; // Video Thumbnail output URL
  aspectRatio: AspectRatio;
  duration?: VideoDuration;
  metadata: {
    title: string;
    description: string;
    tags: string[];
  };
}

export interface YouTubeChannel {
  name: string;
  handle: string;
  avatarUrl: string;
  accessToken: string;
}

export enum AppState {
  IDLE = 'IDLE',
  FETCHING_NEWS = 'FETCHING_NEWS',
  GENERATING_SCRIPT = 'GENERATING_SCRIPT',
  GENERATING_AUDIO = 'GENERATING_AUDIO',
  GENERATING_ASSETS = 'GENERATING_ASSETS',
  GENERATING_VEO = 'GENERATING_VEO',
  GENERATING_METADATA = 'GENERATING_METADATA',
  GENERATING_THUMBNAIL = 'GENERATING_THUMBNAIL',
  READY_TO_PUBLISH = 'READY_TO_PUBLISH',
  PUBLISHING = 'PUBLISHING',
  PUBLISHED = 'PUBLISHED',
}