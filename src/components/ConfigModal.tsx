'use client';

import { useState } from 'react';

interface ConfigModalProps {
  isOpen: boolean;
  onSubmit: (searchUrl: string, maxPages: number) => void;
  onCancel: () => void;
}

export function ConfigModal({ isOpen, onSubmit, onCancel }: ConfigModalProps) {
  const [searchUrl, setSearchUrl] = useState('https://www.linkedin.com/jobs/search/?keywords=');
  const [maxPages, setMaxPages] = useState(3);
  const [error, setError] = useState('');

  const handleSubmit = () => {
    setError('');

    if (!searchUrl.trim()) {
      setError('Please enter a LinkedIn search URL');
      return;
    }

    if (!searchUrl.includes('linkedin.com')) {
      setError('URL must be from linkedin.com');
      return;
    }

    if (maxPages < 1 || maxPages > 20) {
      setError('Pages must be between 1 and 20');
      return;
    }

    onSubmit(searchUrl, maxPages);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-800/60 p-6 w-full max-w-md shadow-xl">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white mb-1">Configure Search</h2>
          <p className="text-xs text-gray-500">Enter LinkedIn job search URL and number of pages to extract</p>
        </div>

        <div className="space-y-4">
          {/* URL Input */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-2 uppercase tracking-widest">
              LinkedIn Search URL
            </label>
            <input
              type="text"
              value={searchUrl}
              onChange={(e) => setSearchUrl(e.target.value)}
              placeholder="https://www.linkedin.com/jobs/search/?keywords=..."
              className="w-full px-3 py-2.5 bg-gray-800/50 border border-gray-700/50 rounded-lg text-white text-sm
                         placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
            />
            <p className="text-[10px] text-gray-600 mt-1.5">
              Get this from LinkedIn jobs page after filtering
            </p>
          </div>

          {/* Pages Input */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-2 uppercase tracking-widest">
              Number of Pages
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="1"
                max="20"
                value={maxPages}
                onChange={(e) => setMaxPages(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                className="flex-1 px-3 py-2.5 bg-gray-800/50 border border-gray-700/50 rounded-lg text-white text-sm
                           focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
              />
              <span className="text-xs text-gray-600 font-mono">{maxPages} pages</span>
            </div>
            <p className="text-[10px] text-gray-600 mt-1.5">
              Each page has ~25 jobs (max 20 pages)
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-lg bg-gray-800/50 hover:bg-gray-800 text-gray-300 text-sm
                       font-medium transition-colors border border-gray-700/50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm
                       font-semibold transition-all shadow-md shadow-blue-600/25"
          >
            Start Run
          </button>
        </div>
      </div>
    </div>
  );
}
