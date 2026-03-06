'use client';

import { useState, useEffect } from 'react';
import { ConfigCredentials } from '@/components/config/ConfigCredentials';
import { ConfigResume } from '@/components/config/ConfigResume';
import { ConfigProfile } from '@/components/config/ConfigProfile';
import { ConfigAnswers } from '@/components/config/ConfigAnswers';

interface AppConfig {
  openaiApiKey: string;
  linkedinEmail: string;
  linkedinPassword: string;
  useAI: boolean;
  useScoreMatching: boolean;
  scoreThreshold: number;
  resume: string;
  profile: {
    firstName: string; lastName: string; phone: string;
    city: string; state: string; country: string;
    linkedinUrl: string; portfolioUrl: string;
    yearsOfExperience: string; currentSalary: string; desiredSalary: string; noticePeriodDays: string;
  };
  compliance: {
    requireVisa: string; usCitizenship: string;
    gender: string; ethnicity: string; disability: string; veteran: string;
  };
  freeText: {
    headline: string; summary: string; coverLetter: string;
  };
  customAnswers: Array<{ keywords: string[]; answer: string }>;
}

const EMPTY_CONFIG: AppConfig = {
  openaiApiKey: '', linkedinEmail: '', linkedinPassword: '', useAI: true, useScoreMatching: true, scoreThreshold: 60, resume: '',
  profile: { firstName: '', lastName: '', phone: '', city: '', state: '', country: '', linkedinUrl: '', portfolioUrl: '', yearsOfExperience: '', currentSalary: '', desiredSalary: '', noticePeriodDays: '' },
  compliance: { requireVisa: 'No', usCitizenship: 'Other', gender: 'Decline', ethnicity: 'Decline', disability: 'Decline', veteran: 'Decline' },
  freeText: { headline: '', summary: '', coverLetter: '' },
  customAnswers: [],
};

export default function ConfigPage() {
  const [config, setConfig] = useState<AppConfig>(EMPTY_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(data => { setConfig({ ...EMPTY_CONFIG, ...data }); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch { /* ignore */ }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-600 text-sm">Loading config...</div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-3">
          <a href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-600/20">
              <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white">AutoApply</h1>
              <p className="text-[11px] text-gray-600 -mt-0.5">Configuration</p>
            </div>
          </a>
        </div>
        <div className="flex items-center gap-3">
          <a href="/" className="h-8 px-4 rounded-lg bg-gray-800/80 hover:bg-gray-700 text-gray-300 text-xs
                                  font-medium transition-all border border-gray-700/50 flex items-center">
            Dashboard
          </a>
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-8 px-5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold
                       transition-all disabled:opacity-30 shadow-md shadow-blue-600/25 flex items-center gap-1.5"
          >
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Config'}
          </button>
        </div>
      </div>

      {/* Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <ConfigCredentials
            apiKey={config.openaiApiKey}
            linkedinEmail={config.linkedinEmail}
            linkedinPassword={config.linkedinPassword}
            useAI={config.useAI}
            useScoreMatching={config.useScoreMatching}
            scoreThreshold={config.scoreThreshold}
            onChange={(field, value) => setConfig(prev => ({ ...prev, [field]: value }))}
          />
          <ConfigResume
            resume={config.resume}
            onChange={(value) => setConfig(prev => ({ ...prev, resume: value }))}
          />
        </div>
        <div className="space-y-4">
          <ConfigProfile
            profile={config.profile}
            compliance={config.compliance}
            freeText={config.freeText}
            onProfileChange={(field, value) => setConfig(prev => ({
              ...prev, profile: { ...prev.profile, [field]: value }
            }))}
            onComplianceChange={(field, value) => setConfig(prev => ({
              ...prev, compliance: { ...prev.compliance, [field]: value }
            }))}
            onFreeTextChange={(field, value) => setConfig(prev => ({
              ...prev, freeText: { ...prev.freeText, [field]: value }
            }))}
          />
          <ConfigAnswers
            answers={config.customAnswers}
            onChange={(answers) => setConfig(prev => ({ ...prev, customAnswers: answers }))}
          />
        </div>
      </div>
    </div>
  );
}
