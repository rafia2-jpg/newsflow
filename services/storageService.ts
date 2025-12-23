import { NewsItem, GeneratedContent } from '../types';

const DB_NAME = 'NewsFlowDB';
const DB_VERSION = 2; // Incremented for schema changes if needed
const STORE_NAME = 'appData';
const ARCHIVE_INDEX_KEY = 'archive_index';

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
};

const put = async (key: string, value: any) => {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

const get = async (key: string) => {
  const db = await openDB();
  return new Promise<any>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

const del = async (key: string) => {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};

// --- Helper Functions for Blob Serialization ---

const prepareContentForStorage = async (content: GeneratedContent) => {
    // Deep clone basic structure
    const clone: any = { 
        ...content, 
        assets: content.assets ? [...content.assets] : [], 
        metadata: {...content.metadata} 
    };
    
    // Handle Audio Blob
    if (clone.audioUrl && clone.audioUrl.startsWith('blob:')) {
        try {
            const response = await fetch(clone.audioUrl);
            const blob = await response.blob();
            clone.audioBlob = blob;
            delete clone.audioUrl; // Remove URL, we store blob
        } catch (e) {
            console.warn("Failed to save audio blob", e);
        }
    }

    // Handle Asset Blobs (Video from Veo)
    if (clone.assets) {
        clone.assets = await Promise.all(clone.assets.map(async (asset: any) => {
            if (asset.type === 'video' && asset.url && asset.url.startsWith('blob:')) {
                try {
                     const response = await fetch(asset.url);
                     const blob = await response.blob();
                     return { ...asset, url: null, videoBlob: blob };
                } catch (e) {
                    console.warn("Failed to save video blob", e);
                    return asset;
                }
            }
            return asset;
        }));
    }

    // Handle Thumbnail Blob (if exists as blob url)
    if (clone.thumbnailUrl && clone.thumbnailUrl.startsWith('blob:')) {
        try {
            const response = await fetch(clone.thumbnailUrl);
            const blob = await response.blob();
            clone.thumbnailBlob = blob;
            delete clone.thumbnailUrl;
        } catch (e) {
             console.warn("Failed to save thumbnail blob", e);
        }
    }
    
    return clone;
};

const restoreContentFromStorage = (content: any): GeneratedContent => {
    if (!content) return content;

    const restored = { ...content };

    // Restore Audio URL
    if (restored.audioBlob) {
        restored.audioUrl = URL.createObjectURL(restored.audioBlob);
        // keep blob? no need
        delete restored.audioBlob;
    }

    // Restore Thumbnail URL
    if (restored.thumbnailBlob) {
        restored.thumbnailUrl = URL.createObjectURL(restored.thumbnailBlob);
        delete restored.thumbnailBlob;
    }

    // Restore Asset URLs
    if (restored.assets) {
        restored.assets = restored.assets.map((asset: any) => {
            if (asset.videoBlob) {
                const url = URL.createObjectURL(asset.videoBlob);
                const { videoBlob, ...rest } = asset;
                return { ...rest, url };
            }
            return asset;
        });
    }
    
    return restored as GeneratedContent;
};

// --- Active Session Persistence ---

export const saveNews = (news: NewsItem[]) => put('news', news);
export const loadNewsData = () => get('news');

export const saveNewsType = (type: string) => put('newsType', type);
export const loadNewsTypeData = () => get('newsType');

export const saveLogs = (logs: string[]) => put('logs', logs);
export const loadLogsData = () => get('logs');

export const saveGeneratedContent = async (content: GeneratedContent) => {
    // For active session, we might want to skip blob conversion to avoid overhead on every keystroke/change,
    // but here we do it to ensure persistence works across refreshes.
    // However, repeatedly saving blobs can be heavy. 
    // Optimization: Only save if necessary or debounced. For now, we assume simple save.
    try {
        const stored = await prepareContentForStorage(content);
        await put('generatedContent', stored);
    } catch (e) {
        console.warn("Failed to auto-save generated content", e);
    }
};

export const loadGeneratedContent = async (): Promise<GeneratedContent | null> => {
    const content = await get('generatedContent');
    return restoreContentFromStorage(content);
};

export const clearProductionData = async () => {
    await del('generatedContent');
    await del('logs');
};

// --- Archive / Previous Projects ---

export interface ArchiveItem {
    id: string;
    title: string;
    date: number;
    thumbnailUrl?: string; // Display URL
    thumbnailBlob?: Blob;  // Stored blob
}

export const saveToArchive = async (content: GeneratedContent) => {
    try {
        const id = `project_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const storedContent = await prepareContentForStorage(content);
        
        // Save full project data
        await put(id, storedContent);

        // Update Index
        const index = (await get(ARCHIVE_INDEX_KEY)) || [];
        
        // Prepare thumbnail for index (Small preview)
        let thumbnailBlob = storedContent.thumbnailBlob;
        
        // If not a blob in storage (e.g. data URI), convert to blob for index efficiency/consistency
        if (!thumbnailBlob && content.thumbnailUrl && content.thumbnailUrl.startsWith('data:')) {
            try {
                const res = await fetch(content.thumbnailUrl);
                thumbnailBlob = await res.blob();
            } catch(e) {
                console.warn("Failed to create thumbnail blob for index", e);
            }
        }

        const indexItem: ArchiveItem = {
            id,
            title: content.metadata.title || 'Untitled Project',
            date: Date.now(),
            thumbnailBlob
        };

        // Add to top of list
        index.unshift(indexItem);
        await put(ARCHIVE_INDEX_KEY, index);
        
        return id;
    } catch (e) {
        console.error("Storage Error in saveToArchive:", e);
        throw new Error("Failed to save project to storage. Quota might be exceeded.");
    }
};

export const loadArchiveIndex = async (): Promise<ArchiveItem[]> => {
    try {
        const index = (await get(ARCHIVE_INDEX_KEY)) || [];
        // Convert blobs to object URLs for display
        return index.map((item: any) => {
            if (item.thumbnailBlob) {
                const url = URL.createObjectURL(item.thumbnailBlob);
                return { ...item, thumbnailUrl: url }; 
            }
            return item;
        });
    } catch (e) {
        console.error("Failed to load archive index", e);
        return [];
    }
};

export const loadArchivedProject = async (id: string): Promise<GeneratedContent | null> => {
    try {
        const data = await get(id);
        if (!data) return null;
        return restoreContentFromStorage(data);
    } catch (e) {
        console.error("Failed to load project", id, e);
        return null;
    }
};

export const deleteArchivedProject = async (id: string) => {
    try {
        await del(id); // Delete project data
        
        const index = (await get(ARCHIVE_INDEX_KEY)) || [];
        const newIndex = index.filter((i: any) => i.id !== id);
        await put(ARCHIVE_INDEX_KEY, newIndex); // Update index
    } catch (e) {
        console.error("Failed to delete project", id, e);
        throw e;
    }
};