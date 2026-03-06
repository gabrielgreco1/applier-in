'use client';

import { useState } from 'react';

interface CustomAnswer {
  keywords: string[];
  answer: string;
}

interface Props {
  answers: CustomAnswer[];
  onChange: (answers: CustomAnswer[]) => void;
}

export function ConfigAnswers({ answers, onChange }: Props) {
  const [newKeywords, setNewKeywords] = useState('');
  const [newAnswer, setNewAnswer] = useState('');

  const handleAdd = () => {
    const kws = newKeywords.split(',').map(k => k.trim()).filter(Boolean);
    if (kws.length === 0 || !newAnswer.trim()) return;

    onChange([...answers, { keywords: kws, answer: newAnswer.trim() }]);
    setNewKeywords('');
    setNewAnswer('');
  };

  const handleDelete = (index: number) => {
    onChange(answers.filter((_, i) => i !== index));
  };

  return (
    <section className="rounded-xl bg-gray-900/80 border border-gray-800/60 p-6">
      <h2 className="text-sm font-bold text-white mb-1">Custom Answers</h2>
      <p className="text-[11px] text-gray-600 mb-5">
        When a form question contains any of the keywords, the bot will answer with the configured value.
        Custom rules take priority over built-in matching.
      </p>

      {/* Existing rules */}
      {answers.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {answers.map((rule, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2 bg-gray-800/30 rounded-lg group">
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <div className="flex flex-wrap gap-1">
                  {rule.keywords.map((kw, j) => (
                    <span key={j} className="px-1.5 py-0.5 bg-blue-600/15 text-blue-400 text-[10px] font-mono rounded">
                      {kw}
                    </span>
                  ))}
                </div>
                <svg className="w-3 h-3 text-gray-700 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <span className="text-xs text-gray-300 font-mono truncate">{rule.answer}</span>
              </div>
              <button
                onClick={() => handleDelete(i)}
                className="text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {answers.length === 0 && (
        <div className="mb-4 py-6 text-center text-gray-700 text-xs">
          No custom rules yet. Add one below.
        </div>
      )}

      {/* Add new rule */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newKeywords}
          onChange={(e) => setNewKeywords(e.target.value)}
          placeholder="Keywords (comma-separated)"
          className="flex-1 px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-lg text-white text-sm
                     placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
        />
        <input
          type="text"
          value={newAnswer}
          onChange={(e) => setNewAnswer(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Answer"
          className="w-40 px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-lg text-white text-sm
                     placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
        />
        <button
          onClick={handleAdd}
          disabled={!newKeywords.trim() || !newAnswer.trim()}
          className="px-4 py-2 bg-gray-800/80 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg
                     border border-gray-700/50 disabled:opacity-30 transition-colors"
        >
          Add
        </button>
      </div>
      <p className="text-[10px] text-gray-700 mt-2">
        Example: keywords &quot;amazon athena, athena&quot; with answer &quot;2&quot; will fill in &quot;2&quot; whenever the question mentions &quot;athena&quot;
      </p>
    </section>
  );
}
