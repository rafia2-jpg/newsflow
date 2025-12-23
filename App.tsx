import React, { useState, useEffect, useMemo } from 'react';
import { Header } from './components/Header';
import { NewsCard } from './components/NewsCard';
import { ProductionMonitor } from './components/ProductionMonitor';
import { ChannelModal } from './components/ChannelModal';
import { ArchiveView } from './components/ArchiveView';
import { 
  fetchBreakingNews, 
  fetchTrends,
  fetchNewsByTopic,
  generateScript, 
  generateVoiceover, 
  generateNewsImages, 
  generateThumbnail, 
  generateYouTubeMetadata,
  generateVeoVideo
} from './services/geminiService';
import { 
  initGoogleAuth, 
  requestAccessToken, 
  fetchChannelProfile, 
  uploadVideoToYouTube 
} from './services/youtubeService';
import { 
  saveNews, loadNewsData, 
  saveNewsType, loadNewsTypeData, 
  saveGeneratedContent, loadGeneratedContent, 
  saveLogs, loadLogsData, 
  clearProductionData,
  saveToArchive, loadArchiveIndex, loadArchivedProject, deleteArchivedProject,
  ArchiveItem
} from './services/storageService';
import { NewsItem, GeneratedContent, AppState, YouTubeChannel, Asset, AspectRatio, VideoDuration } from './types';

type NewsType = 'breaking' | 'daily' | 'weekly' | 'youtube' | 'celebrity' | 'politics' | 'global' | 'hollywood' | 'topic' | 'spain' | 'germany' | 'pakistan' | 'india' | 'spain_celebrity' | 'spain_politics' | 'spain_politics_fights' | 'spain_movies' | 'spain_youtube' | 'spain_viral' | 'spain_sports' | 'spain_ronaldo_messi' | 'spain_footballers' | 'usa_footballers';
type ViewType = 'dashboard' | 'archive';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  
  const [news, setNews] = useState<NewsItem[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [newsType, setNewsType] = useState<NewsType>('breaking');
  const [topicQuery, setTopicQuery] = useState('');
  const [activeSearch, setActiveSearch] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [videoDuration, setVideoDuration] = useState<VideoDuration>('3m');
  
  // Archive State
  const [archiveItems, setArchiveItems] = useState<ArchiveItem[]>([]);

  // Channel State
  const [connectedChannel, setConnectedChannel] = useState<YouTubeChannel | null>(null);
  const [isChannelModalOpen, setIsChannelModalOpen] = useState(false);
  const [isAuthInitialized, setIsAuthInitialized] = useState(false);

  const [generatedContent, setGeneratedContent] = useState<GeneratedContent>({
    script: '',
    assets: [],
    imagePrompt: '',
    metadata: { title: '', description: '', tags: [] },
    aspectRatio: '16:9',
    duration: '3m'
  });

  const addLog = (msg: string) => setLogs(prev => [...prev, `> ${msg}`]);

  // Initial Load & Restore
  useEffect(() => {
    const restoreSession = async () => {
       try {
         const [savedNews, savedType, savedContent, savedLogs] = await Promise.all([
            loadNewsData(),
            loadNewsTypeData(),
            loadGeneratedContent(),
            loadLogsData()
         ]);
         
         if (savedType) setNewsType(savedType as NewsType);
         if (savedNews && savedNews.length > 0) {
            setNews(savedNews);
         } else {
            loadNews(savedType as NewsType || 'breaking');
         }

         if (savedContent) {
            setGeneratedContent(savedContent);
            setAspectRatio(savedContent.aspectRatio || '16:9');
            setVideoDuration(savedContent.duration || '3m');
            if (savedContent.script) {
               setAppState(AppState.READY_TO_PUBLISH); 
            }
         }
         
         if (savedLogs) setLogs(savedLogs);
       } catch (e) {
         console.error("Failed to restore session", e);
         loadNews('breaking');
       } finally {
         setIsRestoring(false);
       }
    };

    restoreSession();

    const storedClientId = localStorage.getItem('google_client_id');
    if (storedClientId) {
      initAuth(storedClientId);
    }
  }, []);

  // Persistence Effects
  useEffect(() => {
    if (!isRestoring) saveNews(news);
  }, [news, isRestoring]);

  useEffect(() => {
    if (!isRestoring) saveNewsType(newsType);
  }, [newsType, isRestoring]);

  useEffect(() => {
    if (!isRestoring) saveGeneratedContent(generatedContent);
  }, [generatedContent, isRestoring]);

  useEffect(() => {
    if (!isRestoring) saveLogs(logs);
  }, [logs, isRestoring]);

  // Load Archive on View Switch
  useEffect(() => {
    if (currentView === 'archive') {
      loadArchiveIndex().then(setArchiveItems).catch(console.error);
    }
  }, [currentView]);

  const initAuth = (clientId: string) => {
    try {
      initGoogleAuth(clientId, async (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
          addLog("Google Auth Successful. Fetching Channel info...");
          try {
             const profile = await fetchChannelProfile(tokenResponse.access_token);
             if (profile) {
               setConnectedChannel({
                 name: profile.snippet.title,
                 handle: profile.snippet.customUrl || '@' + profile.snippet.title,
                 avatarUrl: profile.snippet.thumbnails.default.url,
                 accessToken: tokenResponse.access_token
               });
               addLog(`Connected to channel: ${profile.snippet.title}`);
             } else {
               addLog("No YouTube channel found for this account.");
             }
          } catch (err) {
            console.error(err);
            addLog("Failed to fetch channel profile.");
          }
        }
      });
      setIsAuthInitialized(true);
    } catch (e) {
      console.error("Failed to init auth", e);
    }
  };

  const loadNews = async (type: NewsType, customTopic?: string) => {
    setAppState(AppState.FETCHING_NEWS);
    setNewsType(type);
    setNews([]);
    
    const displayType = type.replace('spain_', '').replace('usa_', '').toUpperCase();

    if (customTopic) {
        addLog(`Deep Searching "${customTopic}" in ${displayType}...`);
        setActiveSearch(customTopic);
    } else {
        addLog(`Fetching trends for ${displayType}...`);
        setActiveSearch(null);
        setTopicQuery('');
    }

    try {
      let items: NewsItem[] = [];
      if (type === 'breaking') {
        items = await fetchBreakingNews(customTopic);
      } else if (type === 'topic' && customTopic) {
        items = await fetchNewsByTopic(customTopic);
      } else {
        items = await fetchTrends(type as any, customTopic);
      }
      setNews(items);
      setAppState(AppState.IDLE);
    } catch (e: any) {
      console.error(e);
      addLog("API Error. Please retry in 30s.");
      setAppState(AppState.IDLE);
    }
  };

  const handleTopicSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (topicQuery.trim()) {
          loadNews(newsType, topicQuery);
      } else {
          loadNews(newsType);
      }
  };

  const clearSearch = () => {
      setTopicQuery('');
      if (activeSearch) {
          loadNews(newsType);
      }
  };

  const filteredNews = useMemo(() => {
    if (!topicQuery) return news;
    const lower = topicQuery.toLowerCase();
    return news.filter(item => 
      item.headline.toLowerCase().includes(lower) || 
      item.summary.toLowerCase().includes(lower)
    );
  }, [news, topicQuery]);

  const startProduction = async (item: NewsItem) => {
    setAppState(AppState.GENERATING_SCRIPT);
    setLogs([]);
    addLog(`Production: ${item.headline.substring(0, 40)}...`);

    // Any category starting with 'spain' triggers Spanish language production
    const isSpanish = newsType.startsWith('spain');
    const language = isSpanish ? 'es' : 'en';

    if (isSpanish) addLog("Detected Spanish News Category. Production set to ESPAÑOL.");

    try {
      addLog(`Generating script in ${isSpanish ? 'Spanish' : 'English'}...`);
      const script = await generateScript(item, videoDuration, language);
      setGeneratedContent(prev => ({ ...prev, script, aspectRatio, duration: videoDuration }));

      setAppState(AppState.GENERATING_METADATA);
      addLog("Preparing video metadata...");
      const metadata = await generateYouTubeMetadata(script, item.headline, language);
      setGeneratedContent(prev => ({ ...prev, metadata }));

      setAppState(AppState.GENERATING_AUDIO);
      addLog("Creating professional voiceover...");
      const audioUrl = await voiceoverWithRetry(script);
      setGeneratedContent(prev => ({ ...prev, audioUrl }));

      setAppState(AppState.GENERATING_ASSETS);
      addLog("Generating cinematic news visuals (This takes 1-2 mins)...");
      const imagePrompt = `${item.headline}. ${item.summary}`;
      setGeneratedContent(prev => ({ ...prev, assets: [], imagePrompt, aspectRatio }));

      await generateNewsImages(imagePrompt, 4, aspectRatio, (newUrl) => {
        setGeneratedContent(prev => ({
          ...prev,
          assets: [...prev.assets, { id: Date.now().toString() + Math.random(), type: 'image', url: newUrl }]
        }));
        addLog(`Visual generated: [${prev => prev.assets.length + 1}/4]`);
      }); 

      addLog("Finalizing YouTube thumbnail...");
      const thumbnailUrl = await generateThumbnail(item.headline, aspectRatio, language);
      setGeneratedContent(prev => ({ ...prev, thumbnailUrl }));

      setAppState(AppState.READY_TO_PUBLISH);
      addLog("PROJECT READY FOR REVIEW!");

    } catch (error: any) {
      console.error(error);
      const isQuota = error?.message?.includes('429') || error?.message?.includes('quota');
      addLog(isQuota ? "QUOTA LIMIT: Waiting 60s for API reset..." : `ERROR: ${error.message}`);
      if (isQuota) {
         setTimeout(() => addLog("System reset. You may retry now."), 60000);
      }
      setAppState(AppState.IDLE);
    }
  };

  // Internal helper for voiceover retry within App component logic
  const voiceoverWithRetry = async (script: string) => {
      try {
          return await generateVoiceover(script);
      } catch (e) {
          addLog("Voiceover failed, retrying in 5s...");
          await new Promise(r => setTimeout(r, 5000));
          return await generateVoiceover(script);
      }
  }

  const handleGenerateMoreImages = async () => {
    if (!generatedContent.imagePrompt) return;
    setAppState(AppState.GENERATING_ASSETS);
    addLog("Adding more custom visuals...");
    try {
        await generateNewsImages(generatedContent.imagePrompt, 2, generatedContent.aspectRatio, (newUrl) => {
            setGeneratedContent(prev => ({
                ...prev,
                assets: [...prev.assets, { id: Date.now().toString() + Math.random(), type: 'image', url: newUrl }]
            }));
        });
        addLog("Additional visuals ready.");
    } catch (e: any) {
        addLog("Limit reached. Please try later.");
    } finally {
        setAppState(AppState.READY_TO_PUBLISH);
    }
  };

  const handleRegenerateThumbnail = async () => {
      if (!generatedContent.imagePrompt) return;
      setAppState(AppState.GENERATING_THUMBNAIL);
      addLog("Updating thumbnail...");
      const language = newsType.startsWith('spain') ? 'es' : 'en';
      try {
          const url = await generateThumbnail(generatedContent.imagePrompt, generatedContent.aspectRatio, language);
          if (url) {
              setGeneratedContent(prev => ({ ...prev, thumbnailUrl: url }));
              addLog("New thumbnail created.");
          }
      } catch (e) {
          addLog("Failed to update thumbnail.");
      } finally {
          setAppState(AppState.READY_TO_PUBLISH);
      }
  };

  const handleGenerateVeo = async () => {
    if (!generatedContent.imagePrompt) return;
    setAppState(AppState.GENERATING_VEO);
    addLog("VEO: Generating high-quality video B-roll...");
    try {
      const videoUrl = await generateVeoVideo(generatedContent.imagePrompt, generatedContent.aspectRatio);
      setGeneratedContent(prev => ({
        ...prev,
        assets: [...prev.assets, { id: Date.now().toString(), type: 'video', url: videoUrl }]
      }));
      addLog("VEO Clip added successfully!");
    } catch (e: any) {
      addLog(`VEO Failed: ${e.message}`);
    } finally {
      setAppState(AppState.READY_TO_PUBLISH);
    }
  }

  const handleLoginTrigger = (clientId: string) => {
    if (!isAuthInitialized) {
      initAuth(clientId);
      setTimeout(() => requestAccessToken(), 500);
    } else {
      requestAccessToken();
    }
  };

  const handlePublish = async (videoBlob: Blob) => {
    if (!connectedChannel) {
      setIsChannelModalOpen(true);
      return;
    }
    setAppState(AppState.PUBLISHING);
    addLog(`Publishing to ${connectedChannel.name}...`);
    try {
      await uploadVideoToYouTube(
        connectedChannel.accessToken,
        videoBlob,
        generatedContent.metadata,
        (progress) => {
          if (progress % 10 === 0) addLog(`Progress: ${Math.round(progress)}%`);
        }
      );
      setAppState(AppState.PUBLISHED);
      addLog("SUCCESS! Video live on YouTube.");
      await handleSaveProject();
    } catch (e) {
      addLog(`Upload error: ${(e as Error).message}`);
      setAppState(AppState.READY_TO_PUBLISH); 
    }
  };

  const handleSaveProject = async () => {
    try {
        await saveToArchive(generatedContent);
        addLog("Project archived.");
    } catch (e) {
        addLog("Storage limit reached.");
    }
  };

  const handleReset = async () => {
    setAppState(AppState.IDLE);
    setGeneratedContent({
        script: '',
        assets: [],
        imagePrompt: '',
        metadata: { title: '', description: '', tags: [] },
        aspectRatio: '16:9',
        duration: '3m'
    });
    setAspectRatio('16:9');
    setVideoDuration('3m');
    setLogs([]);
    await clearProductionData();
  };

  const handleLogout = () => {
    setConnectedChannel(null);
    addLog("Auth cleared.");
  };

  const handleOpenProject = async (id: string) => {
      try {
          const content = await loadArchivedProject(id);
          if (content) {
              setGeneratedContent(content);
              setAppState(AppState.READY_TO_PUBLISH);
              setCurrentView('dashboard');
              addLog("Project restored.");
          }
      } catch (e) {}
  };

  const handleDeleteProject = async (id: string) => {
      try {
          await deleteArchivedProject(id);
          setArchiveItems(prev => prev.filter(p => p.id !== id));
      } catch (e) {}
  };

  const FilterButton: React.FC<{ 
    active: boolean, 
    onClick: () => void, 
    children: React.ReactNode,
    variant?: 'default' | 'youtube' | 'celebrity' | 'politics' | 'global' | 'hollywood'
  }> = ({ active, onClick, children, variant = 'default' }) => {
    let activeClass = 'bg-white text-slate-900 border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]';
    if (active) {
        if (variant === 'youtube') activeClass = 'bg-red-600 text-white border-red-600 shadow-[0_0_15px_rgba(220,38,38,0.5)]';
        else if (variant === 'celebrity') activeClass = 'bg-purple-600 text-white border-purple-600 shadow-[0_0_15px_rgba(147,51,234,0.5)]';
        else if (variant === 'politics') activeClass = 'bg-blue-600 text-white border-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.5)]';
        else if (variant === 'global') activeClass = 'bg-cyan-600 text-white border-cyan-600 shadow-[0_0_15px_rgba(8,145,178,0.5)]';
        else if (variant === 'hollywood') activeClass = 'bg-amber-500 text-white border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]';
    }

    return (
      <button
        type="button"
        onClick={onClick}
        className={`px-5 py-2 rounded-full font-medium transition-all border text-sm flex items-center gap-2 ${
          active 
            ? activeClass
            : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:bg-slate-800 hover:border-slate-600'
        }`}
      >
        {children}
      </button>
    );
  };

  if (isRestoring) {
     return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mb-4"></div>
            <p className="text-slate-400 font-mono text-sm">Initializing Flow...</p>
        </div>
     );
  }

  const sectionDisplayName = newsType.replace('spain_', '').replace('usa_', '').replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());

  return (
    <div className="min-h-screen bg-slate-950 pb-20 font-inter">
      <Header 
        channel={connectedChannel} 
        currentView={currentView}
        onViewChange={setCurrentView}
        onConnectClick={() => setIsChannelModalOpen(true)}
        onLogoutClick={handleLogout}
      />

      <ChannelModal 
        isOpen={isChannelModalOpen} 
        onClose={() => setIsChannelModalOpen(false)}
        onLogin={handleLoginTrigger}
      />

      <main className="max-w-7xl mx-auto px-4 py-8">
        
        {currentView === 'archive' ? (
           <ArchiveView 
              projects={archiveItems} 
              onOpen={handleOpenProject}
              onDelete={handleDeleteProject}
              onClose={() => setCurrentView('dashboard')}
           />
        ) : (
          <>
            {(appState === AppState.IDLE || appState === AppState.FETCHING_NEWS) ? (
              <div className="space-y-8 animate-in fade-in duration-700">
                <div className="text-center space-y-4 pt-10 pb-6">
                  <h2 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-amber-500 font-grotesk">
                    Veo Unlimited
                  </h2>
                  <p className="text-slate-400 max-w-2xl mx-auto text-lg">
                    AI-Powered Automated Newsroom. Script, narrate, and generate high-fidelity videos for social media instantly.
                  </p>
                </div>

                <div className="max-w-4xl mx-auto mb-10">
                    <form onSubmit={handleTopicSubmit} className="relative mb-6">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                             <svg className={`w-5 h-5 ${activeSearch ? 'text-red-500' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                        </div>
                        <input 
                            type="text" 
                            className={`block w-full pl-12 pr-40 py-4 rounded-xl bg-slate-900 border text-white placeholder-slate-500 focus:ring-2 focus:ring-red-600 outline-none transition-all shadow-xl ${activeSearch ? 'border-red-600' : 'border-slate-700'}`}
                            placeholder={`Search inside ${sectionDisplayName}...`}
                            value={topicQuery}
                            onChange={(e) => setTopicQuery(e.target.value)}
                        />
                        <div className="absolute right-2 top-2 bottom-2 flex gap-1">
                            {topicQuery && (
                                <button type="button" onClick={clearSearch} className="bg-slate-800 hover:bg-slate-700 text-slate-400 px-3 rounded-lg"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
                            )}
                            <button type="submit" className="bg-slate-800 hover:bg-red-600 text-white px-5 rounded-lg font-medium text-sm">AI Search</button>
                        </div>
                    </form>

                    <div className="flex flex-col md:flex-row justify-center items-center gap-4 mb-8">
                       <div className="bg-slate-800 p-1 rounded-lg inline-flex">
                          <button onClick={() => setAspectRatio('16:9')} className={`px-4 py-2 rounded-md text-sm font-medium ${aspectRatio === '16:9' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400'}`}>Landscape</button>
                          <button onClick={() => setAspectRatio('9:16')} className={`px-4 py-2 rounded-md text-sm font-medium ${aspectRatio === '9:16' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400'}`}>Portrait</button>
                       </div>
                       <div className="bg-slate-800 p-1 rounded-lg inline-flex">
                          {(['30s', '1m', '2m', '3m', '5m'] as VideoDuration[]).map(d => (
                            <button key={d} onClick={() => setVideoDuration(d)} className={`px-4 py-2 rounded-md text-sm font-medium ${videoDuration === d ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400'}`}>{d}</button>
                          ))}
                       </div>
                    </div>

                    <div className="flex flex-wrap justify-center gap-3">
                        <FilterButton active={newsType === 'breaking'} onClick={() => loadNews('breaking')}>Breaking News</FilterButton>
                        <FilterButton active={newsType === 'usa_footballers'} onClick={() => loadNews('usa_footballers')} variant="celebrity">Footballers USA</FilterButton>
                        <FilterButton active={newsType === 'daily'} onClick={() => loadNews('daily')}>Daily Trends</FilterButton>
                        <FilterButton active={newsType === 'weekly'} onClick={() => loadNews('weekly')}>Weekly Trends</FilterButton>
                        <FilterButton active={newsType === 'hollywood'} onClick={() => loadNews('hollywood')} variant="hollywood">Hollywood</FilterButton>
                        <FilterButton active={newsType === 'celebrity'} onClick={() => loadNews('celebrity')} variant="celebrity">Celebrity</FilterButton>
                        <FilterButton active={newsType === 'politics'} onClick={() => loadNews('politics')} variant="politics">Politics</FilterButton>
                        <FilterButton active={newsType === 'global'} onClick={() => loadNews('global')} variant="global">Global News</FilterButton>
                        <FilterButton active={newsType === 'youtube'} onClick={() => loadNews('youtube')} variant="youtube">YouTube</FilterButton>
                    </div>

                    <div className="flex flex-wrap justify-center gap-2 mt-4 border-t border-slate-800 pt-4 w-full">
                        <FilterButton active={newsType.startsWith('spain')} onClick={() => loadNews('spain')}>🇪🇸 Spain</FilterButton>
                        <FilterButton active={newsType === 'germany'} onClick={() => loadNews('germany')}>🇩🇪 Germany</FilterButton>
                        <FilterButton active={newsType === 'pakistan'} onClick={() => loadNews('pakistan')}>🇵🇰 Pakistan</FilterButton>
                        <FilterButton active={newsType === 'india'} onClick={() => loadNews('india')}>🇮🇳 India</FilterButton>
                    </div>

                    {newsType.startsWith('spain') && (
                      <div className="flex flex-wrap justify-center gap-2 mt-2 w-full animate-in slide-in-from-top-2">
                          <FilterButton active={newsType === 'spain'} onClick={() => loadNews('spain')}>General</FilterButton>
                          <FilterButton active={newsType === 'spain_politics'} onClick={() => loadNews('spain_politics')}>Politics</FilterButton>
                          <FilterButton active={newsType === 'spain_politics_fights'} onClick={() => loadNews('spain_politics_fights')} variant="politics">
                            Politics Fighting
                            <span className="flex h-2 w-2 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600"></span>
                            </span>
                          </FilterButton>
                          <FilterButton active={newsType === 'spain_celebrity'} onClick={() => loadNews('spain_celebrity')}>Celebrities</FilterButton>
                          <FilterButton active={newsType === 'spain_movies'} onClick={() => loadNews('spain_movies')}>Movies</FilterButton>
                          <FilterButton active={newsType === 'spain_sports'} onClick={() => loadNews('spain_sports')}>Sports</FilterButton>
                          <FilterButton active={newsType === 'spain_footballers'} onClick={() => loadNews('spain_footballers')} variant="celebrity">Footballers</FilterButton>
                          <FilterButton active={newsType === 'spain_ronaldo_messi'} onClick={() => loadNews('spain_ronaldo_messi')} variant="celebrity">CR7 & Messi</FilterButton>
                      </div>
                    )}
                </div>

                {appState === AppState.FETCHING_NEWS && (
                  <div className="flex justify-center py-20 flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
                    <p className="text-slate-500 font-mono text-sm">Accessing Grounded Search...</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredNews.map(item => (
                    <NewsCard key={item.id} item={item} onSelect={startProduction} />
                  ))}
                </div>
                
                {filteredNews.length === 0 && appState === AppState.IDLE && (
                  <div className="text-center text-slate-500 py-10">
                    No matching results found.
                    <button onClick={() => loadNews(newsType)} className="ml-2 text-red-500 underline">Refresh</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="animate-in zoom-in-95 duration-500">
                <ProductionMonitor 
                  state={appState} 
                  content={generatedContent} 
                  channel={connectedChannel}
                  onPublish={handlePublish} 
                  onReset={handleReset}
                  onGenerateMore={handleGenerateMoreImages}
                  onRegenerateThumbnail={handleRegenerateThumbnail}
                  onGenerateVeo={handleGenerateVeo}
                  onSaveProject={handleSaveProject}
                  onLog={(msg) => addLog(msg)}
                  logs={logs}
                />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default App;