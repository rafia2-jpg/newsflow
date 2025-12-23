import React, { useState, useEffect } from 'react';
import { YouTubeChannel } from '../types';

interface HeaderProps {
  channel: YouTubeChannel | null;
  currentView: 'dashboard' | 'archive';
  onViewChange: (view: 'dashboard' | 'archive') => void;
  onConnectClick: () => void;
  onLogoutClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ channel, currentView, onViewChange, onConnectClick, onLogoutClick }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);

  useEffect(() => {
    // 1. Check if PWA is already installed
    const matchMedia = window.matchMedia('(display-mode: standalone)');
    setIsStandalone(matchMedia.matches);
    matchMedia.addEventListener('change', (e) => setIsStandalone(e.matches));

    // 2. Check for global prompt captured in index.html (fixes race condition)
    if ((window as any).deferredPrompt) {
      console.log("Found global deferredPrompt in Header mount");
      setDeferredPrompt((window as any).deferredPrompt);
    }

    // 3. Listen for future events (if not fired yet)
    const handler = (e: any) => {
      e.preventDefault();
      (window as any).deferredPrompt = e; // Sync global
      setDeferredPrompt(e);
      console.log("Install prompt captured in Header event listener");
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
        setIsStandalone(true);
        setDeferredPrompt(null);
        (window as any).deferredPrompt = null;
        setShowInstallHelp(false);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    const promptEvent = deferredPrompt || (window as any).deferredPrompt;
    
    if (promptEvent) {
      promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      setDeferredPrompt(null);
      (window as any).deferredPrompt = null;
    } else {
      // Fallback if browser didn't fire the event (e.g. Safari, Firefox, or heuristic not met)
      setShowInstallHelp(true);
    }
  };

  return (
    <>
    <header className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => onViewChange('dashboard')}>
          <div className="bg-red-600 text-white font-bold px-3 py-1 rounded-sm tracking-tighter">
            LIVE
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white hidden sm:block">
            NewsFlow<span className="text-red-500">.ai</span>
          </h1>
          <h1 className="text-xl font-bold tracking-tight text-white sm:hidden">
            NewsFlow
          </h1>
        </div>
        
        <div className="flex items-center gap-4">
          <nav className="hidden md:flex gap-2 text-sm font-medium bg-slate-800/50 p-1 rounded-lg">
            <button 
                onClick={() => onViewChange('dashboard')}
                className={`px-4 py-1.5 rounded-md transition-all ${currentView === 'dashboard' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
            >
                Dashboard
            </button>
            <button 
                onClick={() => onViewChange('archive')}
                className={`px-4 py-1.5 rounded-md transition-all ${currentView === 'archive' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
            >
                Archive
            </button>
          </nav>
          
          <div className="h-6 w-px bg-slate-700 hidden md:block"></div>

          {!isStandalone && (
            <button
              onClick={handleInstallClick}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shadow-lg shadow-blue-900/20"
              title="Install Desktop App"
            >
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
               <span className="hidden sm:inline">Install App</span>
               <span className="sm:hidden">Install</span>
            </button>
          )}

          {channel ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-3 bg-slate-800 py-1.5 px-3 rounded-full border border-slate-700 hidden sm:flex">
                 <img src={channel.avatarUrl} alt={channel.name} className="w-6 h-6 rounded-full bg-slate-600" />
                 <div className="flex flex-col">
                   <span className="text-xs font-bold text-white leading-none">{channel.name}</span>
                   <span className="text-[10px] text-slate-400 leading-none mt-0.5">{channel.handle}</span>
                 </div>
                 <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse ml-1"></div>
              </div>
              <button 
                onClick={onLogoutClick}
                className="text-slate-400 hover:text-white text-xs font-medium px-2 py-1.5 hover:bg-slate-800 rounded transition-colors"
              >
                Logout
              </button>
            </div>
          ) : (
            <button 
              onClick={onConnectClick}
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors border border-white/10"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>
              <span className="hidden sm:inline">Connect Channel</span>
              <span className="sm:hidden">Connect</span>
            </button>
          )}
        </div>
      </div>
    </header>

    {/* Install Help Modal */}
    {showInstallHelp && (
       <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
         <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button onClick={() => setShowInstallHelp(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            
            <div className="flex flex-col items-center text-center mb-6">
               <div className="w-16 h-16 bg-blue-600/10 border border-blue-500/50 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
               </div>
               <h2 className="text-xl font-bold text-white">How to Install NewsFlow</h2>
               <p className="text-slate-400 mt-2 text-sm">
                 The automated install is unavailable in this browser context. Please install manually:
               </p>
            </div>

            <div className="space-y-4 bg-slate-950/50 p-4 rounded-lg border border-slate-800 text-left">
               <div className="flex gap-3 items-start">
                  <div className="bg-slate-800 p-2 rounded text-slate-300">
                     <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                  </div>
                  <div>
                     <h3 className="text-white font-medium text-sm">Chrome / Edge</h3>
                     <p className="text-xs text-slate-400 mt-1">
                        Click the <strong>Install Icon</strong> <span className="inline-block border border-slate-600 rounded px-1 bg-slate-800 scale-90 align-middle"><svg className="w-3 h-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg></span> located in the right side of the address bar.
                     </p>
                  </div>
               </div>

               <div className="flex gap-3 items-start border-t border-slate-800 pt-3">
                  <div className="bg-slate-800 p-2 rounded text-slate-300">
                     <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.21-1.96 1.08-3.11-.95.05-2.13.63-2.82 1.47-.63.76-1.18 2-1.03 3.12 1.05.08 2.12-.67 2.77-1.48z"/></svg>
                  </div>
                  <div>
                     <h3 className="text-white font-medium text-sm">Safari (Mac/iOS)</h3>
                     <p className="text-xs text-slate-400 mt-1">
                        Tap <strong>Share</strong>, then select <strong>Add to Home Screen</strong> or <strong>Add to Dock</strong>.
                     </p>
                  </div>
               </div>
            </div>

            <button 
               onClick={() => setShowInstallHelp(false)}
               className="w-full mt-6 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-lg transition-colors text-sm"
            >
               I understand
            </button>
         </div>
       </div>
    )}
    </>
  );
};