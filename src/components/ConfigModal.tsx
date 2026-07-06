'use client';

import { useState } from 'react';

interface ConfigModalProps {
  isOpen: boolean;
  onSubmit: (searchUrl: string, maxPages: number, easyApplyOnly: boolean) => void;
  onCancel: () => void;
}

export function ConfigModal({ isOpen, onSubmit, onCancel }: ConfigModalProps) {
  const MAX_PAGES_LIMIT = 5;
  const [searchUrl, setSearchUrl] = useState('https://www.linkedin.com/jobs/search/?keywords=');
  const [maxPages, setMaxPages] = useState(3);
  const [easyApplyOnly, setEasyApplyOnly] = useState(true);
  const [error, setError] = useState('');
  const estimatedJobs = maxPages * 25;

  const normalizeSearchUrl = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return trimmed;

    try {
      const url = new URL(trimmed);
      if (url.pathname.includes('/jobs/search-results/')) {
        url.pathname = '/jobs/search/';
      }
      url.searchParams.set('f_AL', 'true');
      url.searchParams.delete('currentJobId');
      url.searchParams.delete('position');
      url.searchParams.delete('pageNum');
      url.searchParams.delete('trackingId');
      url.searchParams.delete('trk');
      return url.toString();
    } catch {
      const joiner = trimmed.includes('?') ? '&' : '?';
      const hasEasyApplyFlag = /[?&]f_AL=true\b/.test(trimmed);
      const withoutDetailState = trimmed
        .replace(/([?&])currentJobId=\d+/g, '$1')
        .replace(/([?&])position=\d+/g, '$1')
        .replace(/([?&])pageNum=\d+/g, '$1')
        .replace(/([?&])trackingId=[^&]+/g, '$1')
        .replace(/([?&])trk=[^&]+/g, '$1')
        .replace(/[?&]$/, '');
      const canonical = withoutDetailState.replace('/jobs/search-results/', '/jobs/search/');
      if (hasEasyApplyFlag) return canonical;
      return `${canonical}${joiner}f_AL=true`;
    }
  };

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

    if (maxPages < 1 || maxPages > MAX_PAGES_LIMIT) {
      setError(`Pages must be between 1 and ${MAX_PAGES_LIMIT}`);
      return;
    }

    onSubmit(normalizeSearchUrl(searchUrl), maxPages, easyApplyOnly);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 p-4 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="panel w-full max-w-xl">
        <div className="panel-header">
          <div>
            <div className="panel-title">Launch Setup</div>
            <div className="panel-kicker">Start with a LinkedIn search URL and page cap.</div>
          </div>
        </div>
        <div className="p-6">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-[var(--text)] mb-1">Configure Search</h2>
          <p className="text-xs text-[var(--text-faint)]">Enter a LinkedIn jobs search URL and cap the fetch depth.</p>
        </div>

        <div className="space-y-4">
          {/* URL Input */}
          <div>
            <label className="field-label">
              LinkedIn Search URL
            </label>
            <input
              type="text"
              value={searchUrl}
              onChange={(e) => setSearchUrl(e.target.value)}
              placeholder="https://www.linkedin.com/jobs/search/?keywords=..."
              className="field"
            />
            <p className="text-[10px] text-[var(--text-faint)] mt-1.5">
              Paste the LinkedIn jobs search URL. The app will add <code>f_AL=true</code> and strip detail-state params like <code>currentJobId</code>.
            </p>
          </div>

          {/* Pages Input */}
          <div>
            <label className="field-label">
              Number of Pages
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="1"
                max={MAX_PAGES_LIMIT}
                value={maxPages}
                onChange={(e) => setMaxPages(Math.max(1, Math.min(MAX_PAGES_LIMIT, parseInt(e.target.value) || 1)))}
                className="field"
              />
              <span className="text-xs text-[var(--text-faint)] font-mono">{maxPages} pages</span>
            </div>
            <p className={`text-[10px] mt-1.5 ${estimatedJobs >= 50 ? 'text-amber-300' : 'text-[var(--text-faint)]'}`}>
              Each page has about 25 jobs. LinkedIn often starts limiting around 50 jobs in a search, and runs above {MAX_PAGES_LIMIT} pages are likely to trigger account limits.
            </p>
            {maxPages === MAX_PAGES_LIMIT && (
              <p className="text-[10px] mt-1 text-amber-300">
                Hard cap reached: {MAX_PAGES_LIMIT} pages maximum.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
            <div>
              <div className="text-xs font-medium text-[var(--text)]">Only Easy Apply</div>
              <div className="text-[10px] text-[var(--text-faint)]">Skip vagas sem botão visível de Easy Apply.</div>
            </div>
            <button
              type="button"
              onClick={() => setEasyApplyOnly((prev) => !prev)}
              className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${easyApplyOnly ? 'bg-[var(--accent)]' : 'bg-white/10'}`}
              aria-pressed={easyApplyOnly}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${easyApplyOnly ? 'left-6' : 'left-0.5'}`} />
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="notice border-red-500/20 bg-red-500/8 text-red-200">
              <p className="text-xs">{error}</p>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            className="btn-ghost flex-1 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="btn-primary flex-1 text-sm font-semibold"
          >
            Start Run
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
