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
    <section className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Custom Answers</div>
          <div className="panel-kicker">Rules that match keywords in a question.</div>
        </div>
      </div>
      <div className="panel-body">
      <p className="text-[11px] text-[var(--text-faint)] mb-5">
        When a form question contains any of the keywords, the bot will answer with the configured value.
        Custom rules take priority over built-in matching.
      </p>

      {/* Existing rules */}
      {answers.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {answers.map((rule, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2 bg-white/[0.03] rounded-xl group">
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <div className="flex flex-wrap gap-1">
                  {rule.keywords.map((kw, j) => (
                    <span key={j} className="px-1.5 py-0.5 bg-[rgba(87,230,255,0.12)] text-[var(--accent)] text-[10px] font-mono rounded">
                      {kw}
                    </span>
                  ))}
                </div>
                <svg className="w-3 h-3 text-[var(--text-faint)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <span className="text-xs text-[var(--text)]/85 font-mono truncate">{rule.answer}</span>
              </div>
              <button
                onClick={() => handleDelete(i)}
                className="text-[var(--text-faint)] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
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
        <div className="mb-4 py-6 text-center text-[var(--text-faint)] text-xs">
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
          className="field flex-1"
        />
        <input
          type="text"
          value={newAnswer}
          onChange={(e) => setNewAnswer(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Answer"
          className="field w-40"
        />
        <button
          onClick={handleAdd}
          disabled={!newKeywords.trim() || !newAnswer.trim()}
          className="btn-soft text-sm font-medium disabled:opacity-30"
        >
          Add
        </button>
      </div>
      <p className="text-[10px] text-[var(--text-faint)] mt-2">
        Example: keywords &quot;amazon athena, athena&quot; with answer &quot;2&quot; will fill in &quot;2&quot; whenever the question mentions &quot;athena&quot;
      </p>
      </div>
    </section>
  );
}
