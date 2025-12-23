import React from 'react';
import { ArchiveItem } from '../services/storageService';

interface ArchiveViewProps {
  projects: ArchiveItem[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export const ArchiveView: React.FC<ArchiveViewProps> = ({ projects, onOpen, onDelete, onClose }) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-8 pt-6">
        <div>
           <h2 className="text-3xl font-bold text-white font-grotesk">Previous Projects</h2>
           <p className="text-slate-400">Access your saved stories and generated videos.</p>
        </div>
        <button 
          onClick={onClose}
          className="text-slate-400 hover:text-white flex items-center gap-2 px-4 py-2 hover:bg-slate-800 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Back to Dashboard
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-20 bg-slate-800/50 rounded-xl border border-slate-700 border-dashed">
          <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-500">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" /></svg>
          </div>
          <h3 className="text-xl font-bold text-slate-300">No archived projects</h3>
          <p className="text-slate-500 mt-2">Projects you save will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div key={project.id} className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden group hover:border-slate-600 transition-all shadow-lg hover:shadow-xl flex flex-col">
              <div className="aspect-video bg-slate-900 relative overflow-hidden">
                {project.thumbnailUrl ? (
                  <img src={project.thumbnailUrl} alt={project.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600">
                    <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M4 4h16v16H4V4zm2 2v12h12V6H6zm2 2h8v8H8V8z"/></svg>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button 
                      onClick={() => onOpen(project.id)}
                      className="bg-white text-slate-900 px-4 py-2 rounded-full font-bold text-sm hover:bg-slate-200 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300"
                    >
                      Open Project
                    </button>
                </div>
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <h3 className="text-lg font-bold text-white mb-1 line-clamp-1" title={project.title}>
                  {project.title}
                </h3>
                <p className="text-xs text-slate-400 mb-4 font-mono">
                  {new Date(project.date).toLocaleDateString()} • {new Date(project.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </p>
                <div className="mt-auto flex justify-between items-center pt-3 border-t border-slate-700/50">
                   <button 
                     onClick={() => onOpen(project.id)}
                     className="text-sm text-slate-300 hover:text-white font-medium"
                   >
                     Edit
                   </button>
                   <button 
                     onClick={() => {
                        if(window.confirm('Are you sure you want to delete this project?')) {
                            onDelete(project.id);
                        }
                     }}
                     className="text-sm text-red-500 hover:text-red-400 font-medium"
                   >
                     Delete
                   </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};