import React from 'react';
import { NewsItem } from '../types';

interface NewsCardProps {
  item: NewsItem;
  onSelect: (item: NewsItem) => void;
}

export const NewsCard: React.FC<NewsCardProps> = ({ item, onSelect }) => {
  return (
    <div 
      className="bg-slate-800 border border-slate-700 rounded-lg p-5 hover:border-red-500 transition-all cursor-pointer group"
      onClick={() => onSelect(item)}
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs font-bold text-red-500 uppercase tracking-wide">Breaking</span>
        <span className="text-xs text-slate-400">{item.publishedTime || 'Just now'}</span>
      </div>
      <h3 className="text-lg font-bold text-white mb-2 group-hover:text-red-400 transition-colors">
        {item.headline}
      </h3>
      <p className="text-slate-400 text-sm line-clamp-3">
        {item.summary}
      </p>
      <div className="mt-4 flex justify-between items-center">
        <span className="text-xs text-slate-500">{item.sourceName || 'Unknown Source'}</span>
        <button className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded transition-colors">
          Produce Video
        </button>
      </div>
    </div>
  );
};
