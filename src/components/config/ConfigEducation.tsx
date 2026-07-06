'use client';

interface Education {
  school: string;
  city: string;
  degree: string;
  major: string;
  startMonth: string;
  startYear: string;
  endMonth: string;
  endYear: string;
  currentlyAttending: boolean;
}

interface Props {
  education: Education;
  onChange: (field: keyof Education, value: string | boolean) => void;
}

function Field({ label, value, onChange, placeholder = '' }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="field"
      />
    </div>
  );
}

export function ConfigEducation({ education, onChange }: Props) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Education</div>
          <div className="panel-kicker">Used for LinkedIn education steps. Leave blank to skip those jobs.</div>
        </div>
      </div>
      <div className="panel-body space-y-4">
        <Field label="University / School" value={education.school} onChange={(v) => onChange('school', v)} placeholder="University name" />
        <Field label="City" value={education.city} onChange={(v) => onChange('city', v)} placeholder="School city" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Degree" value={education.degree} onChange={(v) => onChange('degree', v)} placeholder="Bachelor's, Master's..." />
          <Field label="Major / Field of study" value={education.major} onChange={(v) => onChange('major', v)} placeholder="Computer Science" />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
          <div>
            <div className="text-xs font-medium text-[var(--text)]">Currently attending</div>
            <div className="text-[10px] text-[var(--text-faint)]">If on, the end date is ignored.</div>
          </div>
          <button
            type="button"
            onClick={() => onChange('currentlyAttending', !education.currentlyAttending)}
            className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${education.currentlyAttending ? 'bg-[var(--accent)]' : 'bg-white/10'}`}
            aria-pressed={education.currentlyAttending}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${education.currentlyAttending ? 'left-6' : 'left-0.5'}`} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Start month</label>
            <input className="field" value={education.startMonth} onChange={(e) => onChange('startMonth', e.target.value)} placeholder="Jan" />
          </div>
          <div>
            <label className="field-label">Start year</label>
            <input className="field" value={education.startYear} onChange={(e) => onChange('startYear', e.target.value)} placeholder="2020" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">End month</label>
            <input className="field" value={education.endMonth} onChange={(e) => onChange('endMonth', e.target.value)} placeholder="Dec" disabled={education.currentlyAttending} />
          </div>
          <div>
            <label className="field-label">End year</label>
            <input className="field" value={education.endYear} onChange={(e) => onChange('endYear', e.target.value)} placeholder="2024" disabled={education.currentlyAttending} />
          </div>
        </div>
      </div>
    </section>
  );
}
