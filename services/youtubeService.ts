// Type definitions for Google Identity Services
declare global {
  interface Window {
    google: any;
  }
}

let tokenClient: any;

export const initGoogleAuth = (clientId: string, onTokenReceived: (tokenResponse: any) => void) => {
  if (window.google) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
      callback: onTokenReceived,
    });
  } else {
    console.error("Google Identity Services script not loaded");
  }
};

export const requestAccessToken = () => {
  if (tokenClient) {
    // Force prompt to ensure we get a fresh token if needed, or just standard flow
    tokenClient.requestAccessToken();
  } else {
    console.error("Token client not initialized. Call initGoogleAuth first.");
    throw new Error("Auth not initialized");
  }
};

export const fetchChannelProfile = async (accessToken: string) => {
  try {
    const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!response.ok) throw new Error('Failed to fetch channel');
    
    const data = await response.json();
    if (data.items && data.items.length > 0) {
      return data.items[0];
    }
    return null;
  } catch (error) {
    console.error("Error fetching channel profile:", error);
    throw error;
  }
};

export const uploadVideoToYouTube = async (
  accessToken: string, 
  videoBlob: Blob, 
  metadata: { title: string, description: string, tags: string[] },
  onProgress?: (percent: number) => void
) => {
  // 1. Initiate Resumable Upload
  const initResponse = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Upload-Content-Length': videoBlob.size.toString(),
      'X-Upload-Content-Type': 'video/webm'
    },
    body: JSON.stringify({
      snippet: {
        title: metadata.title.substring(0, 100), // Max 100 chars
        description: metadata.description.substring(0, 5000), // Max 5000 chars
        tags: metadata.tags.slice(0, 50), // Max 50 tags
        categoryId: '25' // News & Politics
      },
      status: {
        privacyStatus: 'public', 
        selfDeclaredMadeForKids: false
      }
    })
  });

  if (!initResponse.ok) {
    const err = await initResponse.text();
    throw new Error(`Failed to initiate upload: ${err}`);
  }

  const uploadUrl = initResponse.headers.get('Location');
  if (!uploadUrl) throw new Error('No upload location header received from YouTube');

  // 2. Upload Content
  // For simplicity in this environment, we do a single PUT. 
  // For very large files, chunking is recommended, but Blob PUT works for < 1GB reasonably well in modern browsers.
  const xhr = new XMLHttpRequest();
  
  return new Promise((resolve, reject) => {
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', 'video/webm');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        const percentComplete = (e.loaded / e.total) * 100;
        onProgress(percentComplete);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.response));
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    
    xhr.send(videoBlob);
  });
};