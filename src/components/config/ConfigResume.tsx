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
    <section className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Resume</div>
          <div className="panel-kicker">Plain text input for scoring and autofill.</div>
        </div>
        <button
          onClick={() => setShowPrompt(!showPrompt)}
          className="btn-ghost text-[10px] font-semibold"
        >
          {showPrompt ? 'Hide prompt' : 'How to format?'}
        </button>
      </div>
      <div className="panel-body">
      <div className="flex items-center justify-between mb-1">
        <h2 className="sr-only">Resume</h2>
      </div>
      <p className="text-[11px] text-[var(--text-faint)] mb-5">Paste your resume in plain text. Used for AI scoring and form filling context.</p>

      {showPrompt && (
        <div className="mb-4 p-4 bg-white/[0.03] border border-white/5 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-[var(--text-faint)] uppercase tracking-widest">
              Prompt for ChatGPT
            </span>
            <button
              onClick={() => navigator.clipboard.writeText(PROMPT_TEXT)}
              className="text-[10px] font-semibold text-[var(--accent)] hover:opacity-80 transition-colors"
            >
              Copy
            </button>
          </div>
          <pre className="text-[11px] text-[var(--text)]/80 font-mono whitespace-pre-wrap leading-relaxed">{PROMPT_TEXT}</pre>
        </div>
      )}

      <textarea
        value={resume}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste your plain-text resume here..."
        rows={12}
        className="field-textarea font-mono resize-y min-h-[200px]"
      />
      <p className="text-[10px] text-[var(--text-faint)] mt-1.5">
        {resume.length > 0 ? `${resume.length} characters` : 'Empty'}
      </p>
      </div>
    </section>
  );
}
