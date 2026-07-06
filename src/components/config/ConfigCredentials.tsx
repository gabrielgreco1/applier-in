'use client';

interface Props {
  apiKey: string;
  linkedinEmail: string;
  linkedinPassword: string;
  useAI: boolean;
  useScoreMatching: boolean;
  scoreThreshold: number;
  onChange: (field: string, value: string | boolean | number) => void;
}

export function ConfigCredentials({ 
  apiKey, 
  linkedinEmail, 
  linkedinPassword, 
  useAI, 
  useScoreMatching, 
  scoreThreshold, 
  onChange 
}: Props) {
  const needsApiKey = useAI || useScoreMatching;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Credentials</div>
          <div className="panel-kicker">LinkedIn login and OpenAI API settings.</div>
        </div>
      </div>
      <div className="panel-body">

      <div className="space-y-6">
        {/* LinkedIn Section */}
        <div className="space-y-4">
          <h3 className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-widest border-b border-white/5 pb-2">LinkedIn Account</h3>
          
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="field-label">
                LinkedIn Email
              </label>
              <input
                type="email"
                value={linkedinEmail ?? ''}
                onChange={(e) => onChange('linkedinEmail', e.target.value)}
                placeholder="email@example.com"
                className="field"
              />
            </div>
            <div>
              <label className="field-label">
                LinkedIn Password
              </label>
              <input
                type="password"
                value={linkedinPassword ?? ''}
                onChange={(e) => onChange('linkedinPassword', e.target.value)}
                placeholder="••••••••"
                className="field"
              />
            </div>
          </div>
        </div>

        {/* AI Section */}
        <div className="space-y-4">
          <h3 className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-widest border-b border-white/5 pb-2">AI Settings</h3>
          
          {/* Score Matching toggle */}
          <div className="flex items-center justify-between py-1">
            <div>
              <div className="text-xs font-medium text-[var(--text)]">Use Score Matching</div>
              <div className="text-[10px] text-[var(--text-faint)]">Score cada vaga contra seu currículo</div>
            </div>
            <button
              onClick={() => onChange('useScoreMatching', !useScoreMatching)}
              className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ml-3 ${useScoreMatching ? 'bg-[var(--accent)]' : 'bg-white/10'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${useScoreMatching ? 'left-5.5' : 'left-0.5'}`} />
            </button>
          </div>

          {/* Score threshold */}
          {useScoreMatching && (
            <div className="pl-1">
              <label className="field-label">
                Mínimo Score para Aplicar
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={scoreThreshold ?? 60}
                  onChange={(e) => onChange('scoreThreshold', Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                  className="field w-20"
                />
                <span className="text-[10px] text-[var(--text-faint)]">0-100</span>
              </div>
            </div>
          )}

          {/* AI for unknown questions toggle */}
          <div className="flex items-center justify-between py-1">
            <div>
              <div className="text-xs font-medium text-[var(--text)]">Use AI for unknown questions</div>
              <div className="text-[10px] text-[var(--text-faint)]">Perguntar ao GPT quando não souber responder</div>
            </div>
            <button
              onClick={() => onChange('useAI', !useAI)}
              className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ml-3 ${useAI ? 'bg-[var(--accent)]' : 'bg-white/10'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${useAI ? 'left-5.5' : 'left-0.5'}`} />
            </button>
          </div>

          {/* API key */}
          {needsApiKey && (
            <div>
              <label className="field-label">
                OpenAI API Key
              </label>
              <input
                type="password"
                value={apiKey ?? ''}
                onChange={(e) => onChange('openaiApiKey', e.target.value)}
                placeholder="sk-..."
                className="field"
              />
            </div>
          )}

          {!needsApiKey && (
            <div className="notice">
              <p className="text-[10px]">
                ✓ OpenAI API key não é necessária com estas opções desligadas.
              </p>
            </div>
          )}
        </div>
      </div>
      </div>
    </section>
  );
}
