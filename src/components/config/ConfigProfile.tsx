'use client';

import { useState } from 'react';

interface Profile {
  firstName: string; lastName: string; phone: string;
  city: string; state: string; country: string;
  linkedinUrl: string; portfolioUrl: string;
  yearsOfExperience: string; currentSalary: string; desiredSalary: string; acceptOnSite: string; noticePeriodDays: string;
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
      <label className="field-label">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="field"
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field"
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
    <section className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Personal Profile</div>
          <div className="panel-kicker">Used to auto-fill common form fields.</div>
        </div>
      </div>
      <div className="panel-body">

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
          <SelectField label="Accept On-site Roles" value={profile.acceptOnSite}
            onChange={(v) => onProfileChange('acceptOnSite', v)} options={['Yes', 'No']} />
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
          className="flex items-center gap-2 text-xs text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
        >
          <svg className={`w-3 h-3 transition-transform ${showEEO ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          Diversity fields (optional)
        </button>

        {showEEO && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pl-5 border-l-2 border-white/5">
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
          className="flex items-center gap-2 text-xs text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
        >
          <svg className={`w-3 h-3 transition-transform ${showFreeText ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          Headline, Summary &amp; Cover Letter
        </button>

        {showFreeText && (
          <div className="space-y-3 pl-5 border-l-2 border-white/5">
            <Field label="Headline" value={freeText.headline} onChange={(v) => onFreeTextChange('headline', v)} placeholder="Senior Software Engineer | ..." />
            <div>
              <label className="field-label">Summary</label>
              <textarea value={freeText.summary} onChange={(e) => onFreeTextChange('summary', e.target.value)} rows={3}
                className="field-textarea resize-y" />
            </div>
            <div>
              <label className="field-label">Cover Letter</label>
              <textarea value={freeText.coverLetter} onChange={(e) => onFreeTextChange('coverLetter', e.target.value)} rows={5}
                className="field-textarea resize-y" />
            </div>
          </div>
        )}
      </div>
      </div>
    </section>
  );
}
