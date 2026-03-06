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
    <section className="rounded-xl bg-gray-900/80 border border-gray-800/60 p-6">
      <h2 className="text-sm font-bold text-white mb-1">Credentials</h2>
      <p className="text-[11px] text-gray-600 mb-5">LinkedIn login and OpenAI API settings</p>

      <div className="space-y-6">
        {/* LinkedIn Section */}
        <div className="space-y-4">
          <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-800/50 pb-2">LinkedIn Account</h3>
          
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                LinkedIn Email
              </label>
              <input
                type="email"
                value={linkedinEmail ?? ''}
                onChange={(e) => onChange('linkedinEmail', e.target.value)}
                placeholder="email@example.com"
                className="w-full px-3 py-2.5 bg-gray-800/50 border border-gray-700/50 rounded-lg text-white text-sm
                           placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                LinkedIn Password
              </label>
              <input
                type="password"
                value={linkedinPassword ?? ''}
                onChange={(e) => onChange('linkedinPassword', e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2.5 bg-gray-800/50 border border-gray-700/50 rounded-lg text-white text-sm
                           placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
              />
            </div>
          </div>
        </div>

        {/* AI Section */}
        <div className="space-y-4">
          <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-800/50 pb-2">AI Settings</h3>
          
          {/* Score Matching toggle */}
          <div className="flex items-center justify-between py-1">
            <div>
              <div className="text-xs font-medium text-gray-300">Use Score Matching</div>
              <div className="text-[10px] text-gray-600">Score cada vaga contra seu currículo</div>
            </div>
            <button
              onClick={() => onChange('useScoreMatching', !useScoreMatching)}
              className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ml-3 ${useScoreMatching ? 'bg-blue-600' : 'bg-gray-700'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${useScoreMatching ? 'left-5.5' : 'left-0.5'}`} />
            </button>
          </div>

          {/* Score threshold */}
          {useScoreMatching && (
            <div className="pl-1">
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                Mínimo Score para Aplicar
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={scoreThreshold ?? 60}
                  onChange={(e) => onChange('scoreThreshold', Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                  className="w-20 px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-lg text-white text-sm
                             focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
                />
                <span className="text-[10px] text-gray-600">0-100</span>
              </div>
            </div>
          )}

          {/* AI for unknown questions toggle */}
          <div className="flex items-center justify-between py-1">
            <div>
              <div className="text-xs font-medium text-gray-300">Use AI for unknown questions</div>
              <div className="text-[10px] text-gray-600">Perguntar ao GPT quando não souber responder</div>
            </div>
            <button
              onClick={() => onChange('useAI', !useAI)}
              className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ml-3 ${useAI ? 'bg-blue-600' : 'bg-gray-700'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${useAI ? 'left-5.5' : 'left-0.5'}`} />
            </button>
          </div>

          {/* API key */}
          {needsApiKey && (
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                OpenAI API Key
              </label>
              <input
                type="password"
                value={apiKey ?? ''}
                onChange={(e) => onChange('openaiApiKey', e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2.5 bg-gray-800/50 border border-gray-700/50 rounded-lg text-white text-sm
                           placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
              />
            </div>
          )}

          {!needsApiKey && (
            <div className="py-2 px-3 bg-gray-800/30 rounded-lg border border-gray-700/30">
              <p className="text-[10px] text-gray-500">
                ✓ OpenAI API key não é necessária com estas opções desligadas.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
