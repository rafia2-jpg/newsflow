import React, { useState, useEffect } from 'react';

interface ChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (clientId: string) => void;
}

export const ChannelModal: React.FC<ChannelModalProps> = ({ isOpen, onClose, onLogin }) => {
  const [clientId, setClientId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const storedId = localStorage.getItem('google_client_id');
    if (storedId) setClientId(storedId);
  }, []);

  if (!isOpen) return null;

  const handleSignIn = () => {
    if (!clientId.trim()) {
      alert("Please enter a valid Google Client ID.");
      return;
    }
    setLoading(true);
    localStorage.setItem('google_client_id', clientId.trim());
    
    // Trigger the parent login flow
    try {
      onLogin(clientId.trim());
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
    // We don't close immediately; we wait for the parent to handle the auth flow steps
    // or we can close if the popup opens.
    onClose();
    setLoading(false);
  };

  const handleDemoMode = () => {
    onClose();
    // In a real app this would set a 'demo' flag, but for now closing is enough to proceed with downloading video manually
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full shadow-2xl relative animate-in zoom-in-95 duration-200">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-red-600/10 border border-red-500/50 rounded-full flex items-center justify-center mx-auto mb-4">
             <svg className="w-8 h-8 text-red-600" fill="currentColor" viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>
          </div>
          <h2 className="text-2xl font-bold text-white">YouTube Upload</h2>
          <p className="text-slate-400 mt-2 text-sm">To upload videos, we need a Client ID.</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Google Client ID</label>
            <input 
              type="text" 
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-red-500 outline-none placeholder-slate-600 text-sm"
              placeholder="e.g. 123456-abcde.apps.googleusercontent.com"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Required for real uploads. Create one in <a href="https://console.cloud.google.com/apis/credentials" target="_blank" className="text-red-400 hover:underline">Google Cloud Console</a>.
            </p>
          </div>
          
          <button 
            onClick={handleSignIn}
            disabled={loading || !clientId.trim()}
            className="w-full bg-white hover:bg-gray-100 text-slate-900 font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
             <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z"/><path fill="#EA4335" d="M12 4.66c1.6 0 3.02.55 4.15 1.64l3.1-3.1C17.45 1.41 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
             Sign in with Google
          </button>
          
          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-slate-700"></div>
            <span className="flex-shrink-0 mx-4 text-slate-500 text-xs">OR</span>
            <div className="flex-grow border-t border-slate-700"></div>
          </div>
          
          <button 
            onClick={handleDemoMode}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-lg transition-all"
          >
            I'll just download the video
          </button>
        </div>
      </div>
    </div>
  );
};