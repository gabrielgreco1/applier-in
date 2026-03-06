'use client';

import { useState } from 'react';

interface Props {
  resume: string;
  onChange: (value: string) => void;
}

const PROMPT_TEXT = `Converta meu currículo para texto puro estruturado para ser usado por um sistema de auto-aplicação.

Formato:
- Nome completo
- Email e telefone
- Resumo profissional (3-4 linhas)
- Habilidades técnicas separadas por vírgula
- Experiências (cargo | empresa | período | bullet points)
- Educação (curso | instituição | ano)
- Certificações (se houver)

Mantenha em inglês. Sem formatação markdown.
Cole seu currículo abaixo:
[COLE SEU CURRÍCULO AQUI]`;

export function ConfigResume({ resume, onChange }: Props) {
  const [showPrompt, setShowPrompt] = useState(false);

  return (
    <section className="rounded-xl bg-gray-900/80 border border-gray-800/60 p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-bold text-white">Resume</h2>
        <button
          onClick={() => setShowPrompt(!showPrompt)}
          className="text-[10px] font-semibold text-blue-500 hover:text-blue-400 transition-colors"
        >
          {showPrompt ? 'Hide prompt' : 'How to format?'}
        </button>
      </div>
      <p className="text-[11px] text-gray-600 mb-5">Paste your resume in plain text. Used for AI scoring and form filling context.</p>

      {showPrompt && (
        <div className="mb-4 p-4 bg-gray-800/50 border border-gray-700/50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
              Prompt for ChatGPT
            </span>
            <button
              onClick={() => navigator.clipboard.writeText(PROMPT_TEXT)}
              className="text-[10px] font-semibold text-blue-500 hover:text-blue-400 transition-colors"
            >
              Copy
            </button>
          </div>
          <pre className="text-[11px] text-gray-400 font-mono whitespace-pre-wrap leading-relaxed">{PROMPT_TEXT}</pre>
        </div>
      )}

      <textarea
        value={resume}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste your plain-text resume here..."
        rows={12}
        className="w-full px-3 py-3 bg-gray-800/50 border border-gray-700/50 rounded-lg text-white text-sm font-mono
                   placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20
                   resize-y min-h-[200px]"
      />
      <p className="text-[10px] text-gray-600 mt-1.5">
        {resume.length > 0 ? `${resume.length} characters` : 'Empty'}
      </p>
    </section>
  );
}
