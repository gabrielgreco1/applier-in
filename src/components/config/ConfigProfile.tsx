'use client';

import { useState } from 'react';

interface Profile {
  firstName: string; lastName: string; phone: string;
  city: string; state: string; country: string;
  linkedinUrl: string; portfolioUrl: string;
  yearsOfExperience: string; currentSalary: string; desiredSalary: string; noticePeriodDays: string;
}

interface Compliance {
  requireVisa: string; usCitizenship: string;
  gender: string; ethnicity: string; disability: string; veteran: string;
}

interface FreeText {
  headline: string; summary: string; coverLetter: string;
}

interface Props {
  profile: Profile;
  compliance: Compliance;
  freeText: FreeText;
  onProfileChange: (field: string, value: string) => void;
  onComplianceChange: (field: string, value: string) => void;
  onFreeTextChange: (field: string, value: string) => void;
}

function Field({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-lg text-white text-sm
                   placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-lg text-white text-sm
                   focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
      >
        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </div>
  );
}

export function ConfigProfile({ profile, compliance, freeText, onProfileChange, onComplianceChange, onFreeTextChange }: Props) {
  const [showEEO, setShowEEO] = useState(false);
  const [showFreeText, setShowFreeText] = useState(false);

  return (
    <section className="rounded-xl bg-gray-900/80 border border-gray-800/60 p-6">
      <h2 className="text-sm font-bold text-white mb-1">Personal Profile</h2>
      <p className="text-[11px] text-gray-600 mb-5">Used to auto-fill common form fields (name, phone, location, etc.)</p>

      <div className="space-y-4">
        {/* Name */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="First Name" value={profile.firstName} onChange={(v) => onProfileChange('firstName', v)} />
          <Field label="Last Name" value={profile.lastName} onChange={(v) => onProfileChange('lastName', v)} />
        </div>

        {/* Contact & Location */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Phone" value={profile.phone} onChange={(v) => onProfileChange('phone', v)} placeholder="+1..." />
          <Field label="City" value={profile.city} onChange={(v) => onProfileChange('city', v)} />
          <Field label="State" value={profile.state} onChange={(v) => onProfileChange('state', v)} />
          <Field label="Country" value={profile.country} onChange={(v) => onProfileChange('country', v)} />
        </div>

        {/* Links */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="LinkedIn URL" value={profile.linkedinUrl} onChange={(v) => onProfileChange('linkedinUrl', v)} placeholder="https://linkedin.com/in/..." />
          <Field label="Portfolio / Website" value={profile.portfolioUrl} onChange={(v) => onProfileChange('portfolioUrl', v)} placeholder="https://..." />
        </div>

        {/* Professional */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Years of Experience" value={profile.yearsOfExperience} onChange={(v) => onProfileChange('yearsOfExperience', v)} />
          <Field label="Current Salary" value={profile.currentSalary} onChange={(v) => onProfileChange('currentSalary', v)} />
          <Field label="Desired Salary" value={profile.desiredSalary} onChange={(v) => onProfileChange('desiredSalary', v)} />
          <Field label="Notice Period (days)" value={profile.noticePeriodDays} onChange={(v) => onProfileChange('noticePeriodDays', v)} />
        </div>

        {/* Visa */}
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Require Visa Sponsorship" value={compliance.requireVisa}
            onChange={(v) => onComplianceChange('requireVisa', v)} options={['No', 'Yes']} />
          <SelectField label="US Citizenship" value={compliance.usCitizenship}
            onChange={(v) => onComplianceChange('usCitizenship', v)}
            options={['U.S. Citizen/Permanent Resident', 'Non-citizen allowed to work for any employer', 'Non-citizen seeking work authorization', 'Canadian Citizen/Permanent Resident', 'Other']} />
        </div>

        {/* EEO Collapsible */}
        <button
          onClick={() => setShowEEO(!showEEO)}
          className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-400 transition-colors"
        >
          <svg className={`w-3 h-3 transition-transform ${showEEO ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          Diversity fields (optional)
        </button>

        {showEEO && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pl-5 border-l-2 border-gray-800">
            <SelectField label="Gender" value={compliance.gender}
              onChange={(v) => onComplianceChange('gender', v)} options={['Decline', 'Male', 'Female', 'Other']} />
            <SelectField label="Ethnicity" value={compliance.ethnicity}
              onChange={(v) => onComplianceChange('ethnicity', v)} options={['Decline', 'Hispanic/Latino', 'White', 'Black', 'Asian', 'Native American', 'Pacific Islander', 'Two or More Races']} />
            <SelectField label="Disability" value={compliance.disability}
              onChange={(v) => onComplianceChange('disability', v)} options={['Decline', 'Yes', 'No']} />
            <SelectField label="Veteran Status" value={compliance.veteran}
              onChange={(v) => onComplianceChange('veteran', v)} options={['Decline', 'Yes', 'No']} />
          </div>
        )}

        {/* Free Text Collapsible */}
        <button
          onClick={() => setShowFreeText(!showFreeText)}
          className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-400 transition-colors"
        >
          <svg className={`w-3 h-3 transition-transform ${showFreeText ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          Headline, Summary &amp; Cover Letter
        </button>

        {showFreeText && (
          <div className="space-y-3 pl-5 border-l-2 border-gray-800">
            <Field label="Headline" value={freeText.headline} onChange={(v) => onFreeTextChange('headline', v)} placeholder="Senior Software Engineer | ..." />
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1">Summary</label>
              <textarea value={freeText.summary} onChange={(e) => onFreeTextChange('summary', e.target.value)} rows={3}
                className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-lg text-white text-sm
                           placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 resize-y" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1">Cover Letter</label>
              <textarea value={freeText.coverLetter} onChange={(e) => onFreeTextChange('coverLetter', e.target.value)} rows={5}
                className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-lg text-white text-sm
                           placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 resize-y" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
