'use client';

import { useState, useEffect } from 'react';
import { ConfigCredentials } from '@/components/config/ConfigCredentials';
import { ConfigResume } from '@/components/config/ConfigResume';
import { ConfigProfile } from '@/components/config/ConfigProfile';
import { ConfigEducation } from '@/components/config/ConfigEducation';
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
    yearsOfExperience: string; currentSalary: string; desiredSalary: string; acceptOnSite: string; noticePeriodDays: string;
  };
  education: {
    school: string; city: string; degree: string; major: string;
    startMonth: string; startYear: string; endMonth: string; endYear: string;
    currentlyAttending: boolean;
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
  profile: { firstName: '', lastName: '', phone: '', city: '', state: '', country: '', linkedinUrl: '', portfolioUrl: '', yearsOfExperience: '', currentSalary: '', desiredSalary: '', acceptOnSite: 'Yes', noticePeriodDays: '' },
  education: { school: '', city: '', degree: '', major: '', startMonth: '', startYear: '', endMonth: '', endYear: '', currentlyAttending: false },
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
      <div className="flex items-center justify-center h-64 text-[var(--text-faint)] text-sm">Loading config...</div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="studio-hero">
        <div className="studio-hero-inner">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="eyebrow">AutoApply Local</div>
              <h1 className="hero-title">Configuration control room.</h1>
              <p className="hero-copy">
                Fill this once, keep the data local, and reuse it across every run.
              </p>
              <div className="chip-row">
                <div className="chip"><strong>{config.useAI ? 'AI on' : 'AI off'}</strong></div>
                <div className="chip"><strong>{config.useScoreMatching ? 'scoring on' : 'scoring off'}</strong></div>
                <div className="chip">Resume + profile + custom answers</div>
              </div>
            </div>
            <div className="button-row">
              <a href="/dashboard" className="btn-soft text-sm font-semibold">Run Agent</a>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary text-sm font-semibold disabled:opacity-35"
              >
                {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Config'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="notice">
        <p className="text-[11px] leading-5">
          This workspace stays local. The app opens here by default so the next step is always configuration.
        </p>
      </div>

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
          <ConfigEducation
            education={config.education}
            onChange={(field, value) => setConfig(prev => ({
              ...prev,
              education: { ...prev.education, [field]: value },
            }))}
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
