import React, { useRef, useState, useEffect } from 'react';
import { GeneratedContent, AppState, YouTubeChannel, Asset } from '../types';

interface ProductionMonitorProps {
  state: AppState;
  content: GeneratedContent;
  channel: YouTubeChannel | null;
  onPublish: (videoBlob: Blob) => void;
  onReset: () => void;
  onGenerateMore: () => void;
  onGenerateVeo: () => void;
  onRegenerateThumbnail: () => void;
  onSaveProject: () => void;
  logs: string[];
}

const loadAsset = (asset: Asset): Promise<HTMLImageElement | HTMLVideoElement> => {
  return new Promise((resolve, reject) => {
    if (asset.type === 'video') {
       const vid = document.createElement('video');
       vid.src = asset.url;
       vid.crossOrigin = "anonymous";
       vid.onloadedmetadata = () => resolve(vid);
       vid.onerror = reject;
       vid.load();
    } else {
       const img = new Image();
       img.crossOrigin = "anonymous";
       img.onload = () => resolve(img);
       img.onerror = reject;
       img.src = asset.url;
    }
  });
};

export const ProductionMonitor: React.FC<ProductionMonitorProps> = ({ state, content, channel, onPublish, onReset, onGenerateMore, onGenerateVeo, onRegenerateThumbnail, onSaveProject, logs }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentAssetIndex, setCurrentAssetIndex] = useState(0);
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');

  // Auto-scroll logs
  const logsEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Handle out-of-bounds currentAssetIndex when assets change
  useEffect(() => {
    if (currentAssetIndex >= content.assets.length && content.assets.length > 0) {
      setCurrentAssetIndex(0);
    }
  }, [content.assets]);

  // Slideshow / Playback Logic
  useEffect(() => {
    let interval: any;
    if (isPlaying && content.assets.length > 0) {
      const currentAsset = content.assets[currentAssetIndex];
      
      // Safety check to prevent "Cannot read properties of undefined (reading 'type')"
      if (currentAsset && currentAsset.type === 'image') {
          interval = setInterval(() => {
            setCurrentAssetIndex(prev => (prev + 1) % content.assets.length);
          }, 5000);
      } else {
         // Video assets handle their own timing via onEnded in the JSX
      }
    }
    return () => clearInterval(interval);
  }, [isPlaying, currentAssetIndex, content.assets]);

  const togglePreview = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        if (videoPreviewRef.current) videoPreviewRef.current.pause();
      } else {
        audioRef.current.play();
        if (videoPreviewRef.current) videoPreviewRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setCurrentAssetIndex(0);
  };
  
  const handleVideoAssetEnded = () => {
     if (isPlaying) {
        setCurrentAssetIndex(prev => (prev + 1) % content.assets.length);
     }
  };

  // Complex Rendering Logic for Mixed Media
  const renderVideoBlob = async (): Promise<Blob> => {
    if (!content.audioUrl || content.assets.length === 0) throw new Error("Missing content");

    // Determine resolution based on AR
    const isPortrait = content.aspectRatio === '9:16';
    const width = isPortrait ? 1080 : 1920;
    const height = isPortrait ? 1920 : 1080;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("No canvas context");

    // Pre-load all assets
    const loadedAssets = await Promise.all(content.assets.map(loadAsset));

    // Audio Setup
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    const audioResp = await fetch(content.audioUrl);
    const audioData = await audioResp.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(audioData);
    
    const dest = audioCtx.createMediaStreamDestination();
    const sourceNode = audioCtx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(dest);

    // Canvas Stream
    const canvasStream = canvas.captureStream(30); 
    const audioTrack = dest.stream.getAudioTracks()[0];
    const combinedStream = new MediaStream([canvasStream.getVideoTracks()[0], audioTrack]);
    
    const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    
    return new Promise((resolve, reject) => {
        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };
        
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            audioCtx.close();
            resolve(blob);
        };

        recorder.onerror = (e) => {
            audioCtx.close();
            reject(e);
        };

        recorder.start();
        sourceNode.start(0);
        
        const startTime = audioCtx.currentTime;
        const totalDuration = audioBuffer.duration;
        
        // Define timeline
        // Default image duration = 5s
        // Video duration = actual duration
        let timeline: { assetIndex: number, start: number, end: number, type: 'image'|'video', element: any, duration: number }[] = [];
        let cursor = 0;
        let assetIdx = 0;
        
        while (cursor < totalDuration) {
           const asset = content.assets[assetIdx % content.assets.length];
           const element = loadedAssets[assetIdx % loadedAssets.length];
           let duration = 5; // Default image
           if (asset.type === 'video') {
              duration = (element as HTMLVideoElement).duration || 5; 
           }
           
           timeline.push({
             assetIndex: assetIdx,
             start: cursor,
             end: cursor + duration,
             type: asset.type,
             element: element,
             duration: duration
           });
           
           cursor += duration;
           assetIdx++;
        }

        const renderLoop = () => {
            const elapsed = audioCtx.currentTime - startTime;
            if (elapsed >= totalDuration) {
                recorder.stop();
                return;
            }
            
            // Find active asset
            const activeItem = timeline.find(t => elapsed >= t.start && elapsed < t.end) || timeline[timeline.length-1];
            
            if (activeItem) {
               // Draw background black
               ctx.fillStyle = '#000000';
               ctx.fillRect(0, 0, canvas.width, canvas.height);

               if (activeItem.type === 'image') {
                  const img = activeItem.element as HTMLImageElement;
                  drawImageContain(ctx, img, canvas.width, canvas.height);
               } else {
                  const vid = activeItem.element as HTMLVideoElement;
                  // Sync video time
                  const vidTime = (elapsed - activeItem.start) % activeItem.duration;
                  vid.currentTime = vidTime;
                  drawImageContain(ctx, vid, canvas.width, canvas.height);
               }
            }
            
            requestAnimationFrame(renderLoop);
        };
        renderLoop();
    });
  };

  // Helper to draw image/video contained within canvas while preserving aspect ratio
  const drawImageContain = (ctx: CanvasRenderingContext2D, img: HTMLImageElement | HTMLVideoElement, cw: number, ch: number) => {
      // Calculate aspect ratios
      const imgWidth = img instanceof HTMLVideoElement ? img.videoWidth : img.width;
      const imgHeight = img instanceof HTMLVideoElement ? img.videoHeight : img.height;
      if (!imgWidth || !imgHeight) return;

      const imgAspect = imgWidth / imgHeight;
      const canvasAspect = cw / ch;
      
      let renderW, renderH, offsetX, offsetY;

      if (imgAspect > canvasAspect) {
          // Image is wider than canvas
          renderW = cw;
          renderH = cw / imgAspect;
          offsetX = 0;
          offsetY = (ch - renderH) / 2;
      } else {
          // Image is taller than canvas
          renderH = ch;
          renderW = ch * imgAspect;
          offsetY = 0;
          offsetX = (cw - renderW) / 2;
      }
      
      ctx.drawImage(img, offsetX, offsetY, renderW, renderH);
  };

  const handleDownloadVideo = async () => {
    setIsProcessingVideo(true);
    setProcessingStatus('Rendering for download...');
    try {
      const blob = await renderVideoBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const filename = (content.metadata.title || 'news_video').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      a.download = `${filename}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Download failed", e);
      alert("Render failed");
    } finally {
      setIsProcessingVideo(false);
    }
  };

  const handlePublishClick = async () => {
    setIsProcessingVideo(true);
    setProcessingStatus('Rendering final video for upload...');
    try {
      const blob = await renderVideoBlob();
      onPublish(blob);
    } catch (e) {
      console.error("Render failed", e);
      alert("Could not render video for upload.");
      setIsProcessingVideo(false);
    }
  };

  const downloadThumbnail = () => {
    if (content.thumbnailUrl) {
      const link = document.createElement('a');
      link.href = content.thumbnailUrl;
      link.download = `thumbnail_${(content.metadata.title || 'news').replace(/[^a-z0-9]/gi, '_').substring(0, 20)}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const isProcessing = [
    AppState.GENERATING_SCRIPT,
    AppState.GENERATING_AUDIO,
    AppState.GENERATING_ASSETS,
    AppState.GENERATING_VEO,
    AppState.GENERATING_METADATA,
    AppState.GENERATING_THUMBNAIL
  ].includes(state);

  const isGeneratingThumbnail = state === AppState.GENERATING_THUMBNAIL;
  const currentAsset = content.assets[currentAssetIndex];
  const isPortrait = content.aspectRatio === '9:16';

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-2xl">
      <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
        <h2 className="font-bold text-white flex items-center gap-2 font-grotesk">
          <span className={`h-2.5 w-2.5 rounded-full ${isProcessing ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}></span>
          Production Studio <span className="text-xs text-slate-500 font-normal ml-2">({content.aspectRatio} • {content.duration || '3m'})</span>
        </h2>
        <div className="flex items-center gap-3">
             <button 
                onClick={onSaveProject}
                className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded transition-colors flex items-center gap-1"
                title="Save current state to Archive"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                Save Project
             </button>
            <span className="text-xs font-mono text-slate-400">{state}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
        {/* Main Preview Area */}
        <div className="lg:col-span-2 flex flex-col">
          <div className="p-6 bg-black relative min-h-[500px] flex items-center justify-center border-b border-slate-800">
            {content.assets.length > 0 && currentAsset ? (
              <div 
                className={`relative bg-black rounded-lg overflow-hidden border border-slate-800 group transition-all duration-300 ${isPortrait ? 'aspect-[9/16] h-[600px]' : 'aspect-video w-full'}`}
              >
                {/* Media Display */}
                {currentAsset.type === 'video' ? (
                   <video
                     ref={videoPreviewRef}
                     src={currentAsset.url}
                     className="w-full h-full object-contain"
                     autoPlay={isPlaying}
                     onEnded={handleVideoAssetEnded}
                     muted // Muted because main audio is separate
                   />
                ) : (
                   <img 
                     src={currentAsset.url} 
                     alt="News Scene" 
                     className="w-full h-full object-contain transition-opacity duration-1000"
                   />
                )}
                
                <audio 
                  ref={audioRef} 
                  src={content.audioUrl} 
                  onEnded={handleAudioEnded}
                />
                
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isProcessingVideo ? (
                     <div className="bg-black/80 text-white px-6 py-4 rounded-lg flex flex-col items-center">
                       <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mb-2"></div>
                       <span>{processingStatus}</span>
                     </div>
                  ) : (
                    <button 
                      onClick={togglePreview}
                      className="h-16 w-16 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-red-600 hover:scale-110 transition-all"
                    >
                      {isPlaying ? (
                        <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                      ) : (
                        <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      )}
                    </button>
                  )}
                </div>

                {/* Progress Indicator */}
                <div className="absolute top-4 right-4 flex gap-1 z-10">
                  {content.assets.map((_, idx) => (
                    <div 
                      key={idx} 
                      className={`h-1 w-6 rounded-full shadow-sm ${idx === currentAssetIndex ? 'bg-red-500' : 'bg-white/30'}`}
                    />
                  ))}
                </div>

                 {/* Asset Count Badge */}
                <div className="absolute top-4 left-4 z-10 bg-black/60 backdrop-blur text-white text-xs px-2 py-1 rounded border border-white/10 font-mono">
                  Assets: {content.assets.length}
                  {state === AppState.GENERATING_ASSETS && <span className="animate-pulse ml-1 text-red-400">...</span>}
                </div>

                {/* Lower Third Overlay Mockup */}
                <div className="absolute bottom-8 left-8 right-8 pointer-events-none">
                  <div className="bg-red-600 text-white text-xs font-bold px-2 py-1 inline-block uppercase mb-1">
                    Breaking News
                  </div>
                  <div className="bg-white/90 backdrop-blur text-slate-900 px-4 py-2 font-bold text-lg shadow-lg font-grotesk">
                    {content.metadata.title || "Generating Title..."}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-500 gap-4">
                <div className="w-16 h-16 border-4 border-slate-700 border-t-red-600 rounded-full animate-spin"></div>
                <p className="animate-pulse">Generating Assets...</p>
              </div>
            )}
          </div>
          
          {/* Asset Timeline / Grid */}
          {content.assets.length > 0 && (
            <div className="p-4 bg-slate-900 overflow-x-auto">
              <div className="flex items-center justify-between mb-3">
                 <h3 className="text-xs font-bold text-slate-400 uppercase">Timeline ({content.assets.length})</h3>
                 <a 
                   href="https://whiskunlimited.com/" 
                   target="_blank" 
                   rel="noopener noreferrer"
                   className="text-[10px] text-slate-500 hover:text-red-400 transition-colors flex items-center gap-1"
                 >
                    Generations by WhiskUnlimited
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                 </a>
              </div>
              <div className="flex gap-3">
                {content.assets.map((asset, idx) => (
                  <div 
                    key={asset.id} 
                    onClick={() => setCurrentAssetIndex(idx)}
                    className={`relative w-24 h-24 bg-slate-800 rounded overflow-hidden cursor-pointer border-2 transition-all flex-shrink-0 ${idx === currentAssetIndex ? 'border-red-500' : 'border-transparent hover:border-slate-600'}`}
                  >
                     {asset.type === 'video' ? (
                       <>
                         <video src={asset.url} className="w-full h-full object-cover" />
                         <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                            <div className="bg-red-600 rounded-full p-1">
                              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            </div>
                         </div>
                         <div className="absolute top-1 right-1 bg-black/80 text-[8px] text-white px-1 rounded font-bold uppercase">VEO</div>
                       </>
                     ) : (
                       <img src={asset.url} className="w-full h-full object-cover" loading="lazy" />
                     )}
                  </div>
                ))}
                
                {/* Generate More Button */}
                {state === AppState.GENERATING_ASSETS ? (
                   <div className="w-24 h-24 bg-slate-800/50 rounded border border-slate-700 border-dashed flex items-center justify-center flex-shrink-0">
                     <div className="w-5 h-5 border-2 border-slate-600 border-t-slate-400 rounded-full animate-spin"></div>
                   </div>
                ) : (
                   <button 
                     onClick={onGenerateMore}
                     className="w-24 h-24 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-white transition-all flex-shrink-0 group"
                   >
                     <div className="bg-slate-700 group-hover:bg-slate-600 p-2 rounded-full">
                       <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                     </div>
                     <span className="text-[10px] font-bold uppercase tracking-wider">Image</span>
                   </button>
                )}

                 {/* Generate VEO Button */}
                 {state === AppState.GENERATING_VEO ? (
                   <div className="w-24 h-24 bg-slate-800/50 rounded border border-red-900 border-dashed flex items-center justify-center flex-shrink-0">
                     <div className="w-5 h-5 border-2 border-red-600 border-t-red-400 rounded-full animate-spin"></div>
                   </div>
                ) : (
                   <button 
                     onClick={onGenerateVeo}
                     className="w-24 h-24 bg-slate-900 hover:bg-red-900/20 rounded border border-red-900/50 hover:border-red-500 flex flex-col items-center justify-center gap-1 text-red-500 hover:text-red-400 transition-all flex-shrink-0 group"
                   >
                     <div className="bg-red-900/30 group-hover:bg-red-600 p-2 rounded-full transition-colors">
                       <svg className="w-4 h-4 text-red-500 group-hover:text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
                     </div>
                     <span className="text-[10px] font-bold uppercase tracking-wider">Veo</span>
                   </button>
                )}

              </div>
            </div>
          )}
        </div>

        {/* Sidebar Controls & Info */}
        <div className="bg-slate-900 border-l border-slate-700 flex flex-col h-full max-h-[800px]">
          {/* Metadata Form */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div>
              <label className="text-xs text-slate-400 uppercase font-bold mb-2 block">Script</label>
              <textarea 
                readOnly 
                value={content.script}
                className="w-full h-32 bg-slate-800 border border-slate-700 rounded p-3 text-sm text-slate-300 focus:outline-none resize-none font-inter"
              />
            </div>
            
            {(content.thumbnailUrl || isGeneratingThumbnail) && (
               <div>
                <div className="flex justify-between items-center mb-2">
                    <label className="text-xs text-slate-400 uppercase font-bold block">Generated Thumbnail</label>
                    <div className="flex gap-2">
                        <button 
                            onClick={onRegenerateThumbnail}
                            disabled={isGeneratingThumbnail}
                            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded border border-slate-600 flex items-center gap-1 transition-colors disabled:opacity-50"
                        >
                            <svg className={`w-3 h-3 ${isGeneratingThumbnail ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            {isGeneratingThumbnail ? 'Generating...' : 'Regenerate'}
                        </button>
                        <button 
                            onClick={downloadThumbnail}
                            disabled={!content.thumbnailUrl}
                            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded border border-slate-600 flex items-center gap-1 transition-colors disabled:opacity-50"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                            Download
                        </button>
                    </div>
                </div>
                <div className="relative group cursor-pointer border border-slate-700 rounded overflow-hidden" onClick={content.thumbnailUrl ? downloadThumbnail : undefined}>
                    {content.thumbnailUrl ? (
                         <>
                             <img src={content.thumbnailUrl} alt="Thumbnail" className={`w-full transition-opacity ${isGeneratingThumbnail ? 'opacity-50' : ''}`} />
                             <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                <div className="bg-black/50 p-2 rounded-full text-white">
                                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                                </div>
                             </div>
                         </>
                    ) : (
                        <div className="w-full aspect-video bg-slate-800 flex items-center justify-center">
                            {isGeneratingThumbnail ? (
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                            ) : (
                                <span className="text-xs text-slate-500">No Thumbnail</span>
                            )}
                        </div>
                    )}
                </div>
               </div>
            )}

            <div>
              <label className="text-xs text-slate-400 uppercase font-bold mb-2 block">YouTube Tags</label>
              <div className="flex flex-wrap gap-2">
                {content.metadata.tags.map(tag => (
                  <span key={tag} className="text-xs bg-slate-800 text-slate-400 px-2 py-1 rounded border border-slate-700">#{tag}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="p-4 border-t border-slate-800 bg-slate-900">
             {state === AppState.READY_TO_PUBLISH || state === AppState.GENERATING_THUMBNAIL ? (
               <div className="space-y-2">
                 <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={handleDownloadVideo}
                      disabled={isProcessingVideo}
                      className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                      {isProcessingVideo ? 'Wait...' : 'Download'}
                    </button>
                    <button 
                      onClick={handlePublishClick}
                      disabled={isProcessingVideo}
                      className={`bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 ${!channel ? 'opacity-90' : ''}`}
                      title={channel ? `Upload to ${channel.name}` : "Connect channel to upload"}
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>
                      {channel ? 'Upload' : 'Connect & Upload'}
                    </button>
                 </div>
               </div>
             ) : (
                <div className="text-xs font-mono text-slate-500 h-10 overflow-hidden">
                  {logs.map((log, i) => <div key={i}>{log}</div>)}
                  <div ref={logsEndRef} />
                </div>
             )}
             
             <button onClick={onReset} className="w-full mt-2 text-slate-500 hover:text-white text-xs py-2">
               Cancel / Start Over
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};