import { chromium, Browser, Locator, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import { scoreJobMatch } from '../lib/scoring';
import type { WorkerMessage, ParentMessage, LogEvent, ExecutionStats } from '../lib/types';
import OpenAI from 'openai';
import { loadConfig, type AppConfig } from '../lib/config';

// ── IPC helpers ──────────────────────────────────────────────────────

function sendLog(event: Omit<LogEvent, 'timestamp'>) {
  const msg: WorkerMessage = {
    type: 'log',
    payload: { ...event, timestamp: new Date().toISOString() },
  };
  process.send!(msg);
}

function sendStats(stats: ExecutionStats) {
  const msg: WorkerMessage = { type: 'stats', payload: stats };
  process.send!(msg);
}

function sendDone(status: 'finished' | 'error', stats: ExecutionStats) {
  const msg: WorkerMessage = { type: 'done', payload: { status, stats } };
  process.send!(msg);
}

// ── State ────────────────────────────────────────────────────────────

let shouldStop = false;
const stats: ExecutionStats = {
  totalJobs: 0,
  appliedJobs: 0,
  needsInfoJobs: 0,
  manualJobs: 0,
  discardedJobs: 0,
};
const dailyCap = parseInt(process.env.DAILY_APPLICATION_CAP || '50', 10);
const effectiveCap = isNaN(dailyCap) || dailyCap <= 0 ? 50 : dailyCap;
const easyApplyOnly = process.env.EASY_APPLY_ONLY === '1';

const EASY_APPLY_SELECTORS = [
  'button[data-live-test-job-apply-button]',
  '#jobs-apply-button-id',
  'button[aria-label*="Easy Apply"]',
  'button[aria-label*="Apply"]',
  'button.jobs-apply-button',
  'a[data-live-test-job-apply-button]',
  'a[aria-label*="Easy Apply"]',
  'a[aria-label*="Apply"]',
  'a.jobs-apply-button',
  'a:has-text("Easy Apply")',
  'button:has-text("Easy Apply")',
];

const COOKIES_FILE = path.join(process.cwd(), 'data', '.linkedin_cookies.json');

process.on('message', (msg: ParentMessage) => {
  if (msg.type === 'stop') {
    shouldStop = true;
    sendLog({ level: 'warn', stage: 'system', message: 'Stop signal received, finishing current job...' });
  }
});

async function saveCookies(context: any) {
  try {
    const cookies = await context.cookies();
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
    sendLog({ level: 'info', stage: 'system', message: `Saved ${cookies.length} cookies for next run`, meta: { count: cookies.length } });
  } catch (err) {
    sendLog({ level: 'warn', stage: 'system', message: `Failed to save cookies: ${err instanceof Error ? err.message : String(err)}` });
  }
}

async function loadCookies(context: any): Promise<boolean> {
  try {
    if (!fs.existsSync(COOKIES_FILE)) {
      sendLog({ level: 'info', stage: 'system', message: 'No saved cookies found, will login fresh' });
      return false;
    }
    const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf-8'));
    await context.addCookies(cookies);
    sendLog({ level: 'info', stage: 'system', message: `Loaded ${cookies.length} saved cookies from previous run` });
    return true;
  } catch (err) {
    sendLog({ level: 'warn', stage: 'system', message: `Failed to load cookies: ${err instanceof Error ? err.message : String(err)}. Will login fresh.` });
    return false;
  }
}

// ── Helper: wait for element with timeout ────────────────────────────

async function waitForSelector(page: Page, selector: string, timeoutMs = 10000): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { state: 'visible', timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

async function waitForJobDetailShell(page: Page, timeoutMs = 15000): Promise<boolean> {
  try {
    await page.waitForFunction(() => {
      const hasHeading = Array.from(document.querySelectorAll('h1')).some((el) => (el.textContent || '').trim().length > 0);
      const hasApplyButton = Array.from(document.querySelectorAll('button, a')).some((el) => {
        const text = `${el.textContent || ''} ${el.getAttribute('aria-label') || ''}`.toLowerCase();
        return text.includes('easy apply') || text === 'apply' || text.includes(' apply');
      });
      return hasHeading || hasApplyButton;
    }, { timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

// ── Config & form filling ────────────────────────────────────────────

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCurrencyLike(value: string): string {
  const cleaned = value.replace(/[^\d,.-]/g, '').trim();
  if (!cleaned) return '';

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  if (hasComma && hasDot) {
    return cleaned.replace(/\./g, '').replace(',', '.');
  }

  if (hasComma) {
    return cleaned.replace(',', '.');
  }

  return cleaned;
}

function anyMatch(label: string, terms: string[]): boolean {
  return terms.some((term) => label.includes(term));
}

function answerQuestion(label: string, config: AppConfig): string | null {
  const l = normalizeText(label);

  // 1. Custom answers first (user has priority)
  for (const rule of config.customAnswers) {
    if (rule.keywords.some(k => l.includes(normalizeText(k)))) return rule.answer;
  }

  // 2. Profile-based keyword matching
  if (anyMatch(l, ['first name', 'given name', 'nome'])) return config.profile.firstName;
  if (anyMatch(l, ['last name', 'surname', 'family name', 'sobrenome'])) return config.profile.lastName;
  if (anyMatch(l, ['phone', 'mobile', 'telefone', 'celular']) && !l.includes('type')) return config.profile.phone;
  if (anyMatch(l, ['city', 'cidade', 'location', 'current location', 'localidade', 'localizacao atual', 'localização atual', 'local atual', 'onde mora', 'where do you live'])) return config.profile.city;
  if (anyMatch(l, ['state', 'province', 'estado']) && !l.includes('united')) return config.profile.state;
  if (anyMatch(l, ['country', 'pais', 'país'])) return config.profile.country;
  if (l.includes('linkedin')) return config.profile.linkedinUrl;
  if (anyMatch(l, ['website', 'portfolio', 'github', 'personal url', 'site', 'portifolio', 'portfólio']) && !l.includes('linkedin')) return config.profile.portfolioUrl;
  if (anyMatch(l, ['experience', 'years', 'anos de experiencia', 'anos de experiência'])) return config.profile.yearsOfExperience;
  if (anyMatch(l, ['on-site', 'onsite', 'on site', 'presencial', 'presential', 'hybrid', 'hibrido', 'híbrido', 'work arrangement', 'work preference', 'work setup', 'office based', 'in office'])) {
    return config.profile.acceptOnSite || 'No';
  }
  if (anyMatch(l, ['current salary', 'current compensation', 'salary expectation', 'desired salary', 'expected salary', 'salario atual', 'salário atual'])) {
    return normalizeCurrencyLike(config.profile.currentSalary || config.profile.desiredSalary);
  }
  if (anyMatch(l, ['salary', 'compensation', 'pay', 'expected', 'desired compensation', 'pretensao salarial', 'pretensão salarial', 'pretensao', 'pretensão', 'salario pretendido', 'salário pretendido', 'clt', 'remuneracao', 'remuneração', 'pretensao salarial clt', 'pretensão salarial clt'])) {
    return normalizeCurrencyLike(config.profile.desiredSalary || config.profile.currentSalary);
  }
  if (anyMatch(l, ['notice', 'start date', 'availability', 'when can you', 'aviso previo', 'aviso prévio', 'data de inicio', 'data de início', 'disponibilidade'])) return config.profile.noticePeriodDays;

  // 3. Compliance/EEO
  if (anyMatch(l, ['visa', 'sponsorship', 'authorization', 'authorisation', 'legally', 'work permit', 'visto'])) return config.compliance.requireVisa;
  if (anyMatch(l, ['gender', 'sex', 'genero', 'gênero'])) return config.compliance.gender;
  if (anyMatch(l, ['race', 'ethnic', 'etnia'])) return config.compliance.ethnicity;
  if (anyMatch(l, ['disability', 'disabled', 'handicap', 'deficiencia', 'deficiência'])) return config.compliance.disability;
  if (anyMatch(l, ['veteran', 'military', 'veterano'])) return config.compliance.veteran;
  if (anyMatch(l, ['citizen', 'cidadania', 'nacionalidade'])) return config.compliance.usCitizenship;

  // 4. Free text
  if (anyMatch(l, ['headline', 'professional title', 'titulo', 'título'])) return config.freeText.headline;
  if (anyMatch(l, ['summary', 'about yourself', 'introduce', 'resumo'])) return config.freeText.summary;
  if (anyMatch(l, ['cover letter', 'why do you want', 'motivation', 'why are you interested', 'carta de apresentacao', 'carta de apresentação'])) return config.freeText.coverLetter;

  return null;
}

function answerEducationQuestion(label: string, config: AppConfig): string | null {
  const l = normalizeText(label);

  if (anyMatch(l, ['school', 'university', 'institution', 'college', 'faculdade', 'universidade', 'instituicao', 'instituição', 'nome da instituicao', 'nome da instituição'])) return config.education.school || null;
  if (anyMatch(l, ['city', 'cidade', 'location'])) return config.education.city || null;
  if (anyMatch(l, ['degree', 'grau', 'formacao', 'formação'])) return config.education.degree || null;
  if (anyMatch(l, ['major', 'field of study', 'study', 'course', 'curso', 'area de estudo', 'área de estudo'])) return config.education.major || null;
  if (anyMatch(l, ['currently attend', 'i currently attend', 'currently studying', 'estudando', 'atualmente estudo'])) return config.education.currentlyAttending ? 'Yes' : 'No';
  return null;
}

function answerEducationSelect(label: string, options: string[], config: AppConfig): string | null {
  const l = normalizeText(label);
  const optionText = normalizeText(options.join(' '));
  const isMonthSelect = optionText.includes('jan') || optionText.includes('feb') || optionText.includes('mar') || optionText.includes('apr') || optionText.includes('may') || optionText.includes('jun') || optionText.includes('jul') || optionText.includes('aug') || optionText.includes('sep') || optionText.includes('oct') || optionText.includes('nov') || optionText.includes('dec');
  const isYearSelect = options.some((opt) => /^\d{4}$/.test(opt.trim()));

  if (anyMatch(l, ['from', 'start', 'inicio', 'início', 'de'])) {
    if (isMonthSelect) return config.education.startMonth || null;
    if (isYearSelect) return config.education.startYear || null;
  }

  if (anyMatch(l, ['to', 'end', 'until', 'ate', 'até', 'a'])) {
    if (config.education.currentlyAttending) return null;
    if (isMonthSelect) return config.education.endMonth || null;
    if (isYearSelect) return config.education.endYear || null;
  }

  if (anyMatch(l, ['month', 'mes', 'mês'])) {
    if (isMonthSelect) {
      if (anyMatch(l, ['from', 'start', 'inicio', 'início', 'de'])) return config.education.startMonth || null;
      if (anyMatch(l, ['to', 'end', 'until', 'ate', 'até', 'a'])) return config.education.endMonth || null;
    }
  }

  if (anyMatch(l, ['year', 'ano'])) {
    if (isYearSelect) {
      if (anyMatch(l, ['from', 'start', 'inicio', 'início', 'de'])) return config.education.startYear || null;
      if (anyMatch(l, ['to', 'end', 'until', 'ate', 'até', 'a'])) return config.education.endYear || null;
    }
  }

  return null;
}

function answerWorkLocationSelect(label: string, options: string[], config: AppConfig): string | null {
  const l = normalizeText(label);
  const o = options.map(normalizeText);
  const acceptsOnSite = normalizeText(config.profile.acceptOnSite || 'No') === 'yes';
  const hasYesNo = o.includes('yes') && o.includes('no');
  const hasRemote = o.some((opt) => opt.includes('remote'));
  const hasHybrid = o.some((opt) => opt.includes('hybrid'));
  const hasOnSite = o.some((opt) => opt.includes('on site') || opt.includes('onsite') || opt.includes('presencial') || opt.includes('presential'));

  if (!anyMatch(l, ['on-site', 'onsite', 'on site', 'presencial', 'presential', 'hybrid', 'hibrido', 'híbrido', 'work arrangement', 'work preference', 'work setup', 'office based', 'in office'])) {
    return null;
  }

  if (hasYesNo) return acceptsOnSite ? 'Yes' : 'No';

  if (acceptsOnSite) {
    if (hasOnSite) return options[o.findIndex((opt) => opt.includes('on site') || opt.includes('onsite') || opt.includes('presencial') || opt.includes('presential'))];
    if (hasHybrid) return options[o.findIndex((opt) => opt.includes('hybrid'))];
    if (hasRemote) return options[o.findIndex((opt) => opt.includes('remote'))];
  } else {
    if (hasRemote) return options[o.findIndex((opt) => opt.includes('remote'))];
    if (hasHybrid) return options[o.findIndex((opt) => opt.includes('hybrid'))];
    if (hasYesNo) return 'No';
  }

  return null;
}

function isEducationFieldLabel(label: string): boolean {
  const l = normalizeText(label);
  return [
    'school',
    'university',
    'institution',
    'college',
    'education',
    'degree',
    'major',
    'field of study',
    'currently attend',
    'dates attended',
    'from',
    'to',
    'month',
    'year',
  ].some((term) => l.includes(term));
}

async function isLikelyAutocompleteField(element: Locator): Promise<boolean> {
  const ariaAutocomplete = await element.getAttribute('aria-autocomplete').catch(() => '');
  const role = await element.getAttribute('role').catch(() => '');
  const list = await element.getAttribute('list').catch(() => '');
  const className = await element.getAttribute('class').catch(() => '');
  return Boolean(
    (ariaAutocomplete && ariaAutocomplete !== 'none')
    || role === 'combobox'
    || list
    || className?.toLowerCase().includes('typeahead')
    || className?.toLowerCase().includes('autocomplete'),
  );
}

async function fillTextField(page: Page, element: Locator, label: string, answer: string, jobId: string, stage: 'apply' | 'system' = 'apply') {
  await element.fill(answer);

  if (await isLikelyAutocompleteField(element)) {
    await page.waitForTimeout(600);
    const option = page.locator('[role="option"]:visible').filter({ hasText: new RegExp(answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).first();
    if (await option.isVisible().catch(() => false)) {
      await option.click({ force: true });
      sendLog({ level: 'info', stage, message: `Selected autocomplete option for "${label}" → "${answer}"`, meta: { jobId } });
      return;
    }
    await element.press('ArrowDown').catch(() => undefined);
    await element.press('Enter').catch(() => undefined);
    sendLog({ level: 'info', stage, message: `Confirmed autocomplete value for "${label}" → "${answer}"`, meta: { jobId } });
    return;
  }

  await element.press('Tab').catch(() => undefined);
}

async function getFieldLabel(page: Page, element: Locator): Promise<string> {
  try {
    // Try aria-label
    const ariaLabel = await element.getAttribute('aria-label');
    if (ariaLabel?.trim()) return ariaLabel.trim();

    // Try associated label via id
    const id = await element.getAttribute('id');
    if (id) {
      const label = page.locator(`label[for="${id}"]`).first();
      const text = await label.textContent().catch(() => '');
      if (text?.trim()) return text.trim();
    }

    // Try parent form element label (LinkedIn-specific)
    const parentLabel = await element.evaluate((el: Element) => {
      let node = el.parentElement;
      while (node && !node.classList.contains('fb-dash-form-element') && !node.classList.contains('jobs-easy-apply-form-element')) {
        node = node.parentElement;
      }
      if (node) {
        const lbl = node.querySelector('.fb-dash-form-element__label, label, .artdeco-text-input--label');
        return lbl?.textContent?.trim() || '';
      }
      return '';
    }).catch(() => '');
    if (parentLabel) return parentLabel;

    // Try placeholder
    const placeholder = await element.getAttribute('placeholder');
    if (placeholder?.trim()) return placeholder.trim();

    return '';
  } catch {
    return '';
  }
}

async function fillFormFields(page: Page, config: AppConfig, jobId: string): Promise<{ filled: number; unanswered: string[]; educationBlocked: boolean }> {
  const modal = page.locator('.jobs-easy-apply-modal, .artdeco-modal').first();
  let filled = 0;
  const unanswered: string[] = [];
  let educationBlocked = false;

  const shouldSkipEducation = await modal.evaluate((modalEl: Element) => {
    const text = (modalEl.textContent || '').toLowerCase();
    return /school|university|college|degree|major|field of study|dates attended|education/.test(text);
  }).catch(() => false);

  if (shouldSkipEducation && !config.education.school.trim()) {
    return { filled, unanswered, educationBlocked: true };
  }

  // 1. Text inputs
  const textInputs = modal.locator('input[type="text"]:not([readonly]):visible, input:not([type]):not([readonly]):visible');
  const textCount = await textInputs.count().catch(() => 0);
  for (let i = 0; i < textCount; i++) {
    const input = textInputs.nth(i);
    if (!await input.isVisible().catch(() => false)) continue;
    const value = await input.inputValue().catch(() => '');
    if (value.trim()) continue;

    const label = await getFieldLabel(page, input);
    if (!label) continue;

    const educationField = isEducationFieldLabel(label);
    let answer = educationField ? answerEducationQuestion(label, config) : answerQuestion(label, config);
    if (!answer && !educationField && config.useAI && config.openaiApiKey) {
      answer = await askAI(label, null, config);
      if (answer) sendLog({ level: 'info', stage: 'apply', message: `AI answered "${label}" → "${answer}"`, meta: { jobId } });
    }
    if (answer) {
      await fillTextField(page, input, label, answer, jobId);
      filled++;
    } else {
      unanswered.push(label);
      if (educationField) educationBlocked = true;
    }
  }

  // 2. Textareas
  const textareas = modal.locator('textarea:visible');
  const taCount = await textareas.count().catch(() => 0);
  for (let i = 0; i < taCount; i++) {
    const ta = textareas.nth(i);
    if (!await ta.isVisible().catch(() => false)) continue;
    const value = await ta.inputValue().catch(() => '');
    if (value.trim()) continue;

    const label = await getFieldLabel(page, ta);
    if (!label) continue;

    const educationField = isEducationFieldLabel(label);
    let answer = educationField ? answerEducationQuestion(label, config) : answerQuestion(label, config);
    if (!answer && !educationField && config.useAI && config.openaiApiKey) {
      answer = await askAI(label, null, config);
      if (answer) sendLog({ level: 'info', stage: 'apply', message: `AI answered "${label}" (textarea)`, meta: { jobId } });
    }
    if (answer) {
      await ta.fill(answer);
      filled++;
      sendLog({ level: 'info', stage: 'apply', message: `Filled "${label}" (textarea)`, meta: { jobId } });
    } else {
      unanswered.push(label);
      if (educationField) educationBlocked = true;
    }
  }

  // 3. Select dropdowns — use page.evaluate() for reliable label extraction
  const selectData = await modal.evaluate((modalEl: Element) => {
    const results: Array<{ index: number; label: string; options: string[]; currentValue: string }> = [];
    const selects = modalEl.querySelectorAll('select');
    selects.forEach((select, idx) => {
      const currentValue = (select as HTMLSelectElement).value;
      const opts = Array.from((select as HTMLSelectElement).options)
        .map(o => o.text.trim())
        .filter(o => o && o.toLowerCase() !== 'select an option' && o !== '');

      let label = '';

      // Strategy 1: label[for]
      if (select.id) {
        const lbl = document.querySelector(`label[for="${select.id}"]`);
        if (lbl) label = lbl.textContent?.trim() || '';
      }

      // Strategy 2: Walk up to form element container and find question text
      if (!label) {
        let parent: Element | null = select.parentElement;
        for (let depth = 0; depth < 10 && parent; depth++) {
          // LinkedIn wraps each question in a div with specific classes
          if (parent.classList.contains('fb-dash-form-element') ||
              parent.classList.contains('jobs-easy-apply-form-element') ||
              parent.querySelector('select') === select) {
            const candidates = parent.querySelectorAll('label, legend, span.fb-dash-form-element__label, span.t-14, span.t-bold, div.fb-dash-form-element__label');
            for (const c of candidates) {
              const text = c.textContent?.trim();
              if (text && text.length > 5 && text.toLowerCase() !== 'select an option') {
                label = text;
                break;
              }
            }
            if (label) break;
          }
          parent = parent.parentElement;
        }
      }

      // Strategy 3: aria-labelledby or aria-label
      if (!label) {
        const ariaLabel = select.getAttribute('aria-label');
        if (ariaLabel?.trim()) label = ariaLabel.trim();
      }
      if (!label) {
        const labelledBy = select.getAttribute('aria-labelledby');
        if (labelledBy) {
          const el = document.getElementById(labelledBy);
          if (el) label = el.textContent?.trim() || '';
        }
      }

      // Strategy 4: Previous sibling text (LinkedIn often puts question as a sibling element)
      if (!label) {
        let prev = select.parentElement?.previousElementSibling || select.previousElementSibling;
        if (prev) {
          const text = prev.textContent?.trim();
          if (text && text.length > 5) label = text;
        }
      }

      results.push({ index: idx, label, options: opts, currentValue });
    });
    return results;
  }).catch(() => [] as Array<{ index: number; label: string; options: string[]; currentValue: string }>);

  for (const selectInfo of selectData) {
    // Skip already-filled selects
    if (selectInfo.currentValue && selectInfo.currentValue !== '') continue;

    if (!selectInfo.label) {
      sendLog({ level: 'warn', stage: 'apply', message: `Select #${selectInfo.index}: no label found, options: [${selectInfo.options.join(', ')}]`, meta: { jobId } });
      continue;
    }

    const select = modal.locator('select').nth(selectInfo.index);
    const educationField = isEducationFieldLabel(selectInfo.label);
    let answer = educationField
      ? answerEducationSelect(selectInfo.label, selectInfo.options, config)
      : answerWorkLocationSelect(selectInfo.label, selectInfo.options, config) || answerQuestion(selectInfo.label, config);

    if (!answer) {
      if (!educationField && config.useAI && config.openaiApiKey) {
        // AI fallback — answers based on resume/profile context
        answer = await askAI(selectInfo.label, selectInfo.options, config);
      } else if (!educationField) {
        // No AI: auto-Yes for Yes/No qualification questions
        const hasYes = selectInfo.options.some(o => o.toLowerCase() === 'yes');
        const hasNo = selectInfo.options.some(o => o.toLowerCase() === 'no');
        if (hasYes && hasNo) {
          answer = 'Yes';
          sendLog({ level: 'info', stage: 'apply', message: `Auto-Yes (AI off): "${selectInfo.label.slice(0, 70)}"`, meta: { jobId } });
        }
      }
    }

    if (answer) {
      let selected = false;
      // Try exact label match
      try { await select.selectOption({ label: answer }); selected = true; } catch { /* try next */ }
      // Try partial match on option text
      if (!selected) {
        const match = selectInfo.options.find(o => o.toLowerCase().trim().includes(answer!.toLowerCase()));
        if (match) {
          try { await select.selectOption({ label: match.trim() }); selected = true; } catch { /* skip */ }
        }
      }
      // Try by value
      if (!selected) {
        try { await select.selectOption(answer); selected = true; } catch { /* skip */ }
      }
      if (selected) {
        filled++;
        sendLog({ level: 'info', stage: 'apply', message: `Selected "${selectInfo.label.slice(0, 50)}" → "${answer}"`, meta: { jobId } });
      } else {
        unanswered.push(selectInfo.label);
        if (educationField) educationBlocked = true;
      }
    } else {
      unanswered.push(selectInfo.label);
      if (educationField) educationBlocked = true;
    }
  }

  // 4. Checkboxes
  const checkboxes = modal.locator('input[type="checkbox"]:visible');
  const cbCount = await checkboxes.count().catch(() => 0);
  for (let i = 0; i < cbCount; i++) {
    const checkbox = checkboxes.nth(i);
    if (!await checkbox.isVisible().catch(() => false)) continue;
    if (await checkbox.isChecked().catch(() => false)) continue;

    const label = await getFieldLabel(page, checkbox);
    if (!label) continue;

    const l = label.toLowerCase();
    if (l.includes('currently attend') || l.includes('i currently attend')) {
      if (config.education.currentlyAttending) {
        await checkbox.check({ force: true });
        filled++;
        sendLog({ level: 'info', stage: 'apply', message: `Checked "${label}"`, meta: { jobId } });
      }
      continue;
    }

    if (isEducationFieldLabel(label) && !label.includes('currently attend')) {
      unanswered.push(label);
      educationBlocked = true;
    }
  }

  // 5. Radio buttons (fieldsets)
  const fieldsets = modal.locator('fieldset:visible');
  const fsCount = await fieldsets.count().catch(() => 0);
  for (let i = 0; i < fsCount; i++) {
    const fieldset = fieldsets.nth(i);
    const checked = await fieldset.locator('input[type="radio"]:checked').count().catch(() => 0);
    if (checked > 0) continue;

    const legend = await fieldset.locator('legend, .fb-dash-form-element__label, span[data-test-form-builder-radio-button-form-component__title]').first().textContent().catch(() => '');
    if (!legend?.trim()) continue;

    const radioLabels = fieldset.locator('label');
    const labelTexts = await radioLabels.allTextContents().catch(() => [] as string[]);

    let answer = answerQuestion(legend.trim(), config);
    if (!answer) {
      answer = answerWorkLocationSelect(legend.trim(), labelTexts, config);
    }
    if (!answer && config.useAI && config.openaiApiKey) {
      answer = await askAI(legend.trim(), labelTexts.map(t => t.trim()).filter(Boolean), config);
      if (answer) sendLog({ level: 'info', stage: 'apply', message: `AI answered radio "${legend.trim()}" → "${answer}"`, meta: { jobId } });
    }
    if (answer) {
      let clicked = false;
      const labelCount = await radioLabels.count();
      for (let j = 0; j < labelCount; j++) {
        const labelText = await radioLabels.nth(j).textContent().catch(() => '');
        if (labelText?.toLowerCase().trim().includes(answer.toLowerCase())) {
          await radioLabels.nth(j).click();
          filled++;
          clicked = true;
          sendLog({ level: 'info', stage: 'apply', message: `Selected radio "${legend.trim()}" → "${labelText.trim()}"`, meta: { jobId } });
          break;
        }
      }
      if (!clicked) unanswered.push(legend.trim());
    } else {
      unanswered.push(legend.trim());
    }
  }

  return { filled, unanswered, educationBlocked };
}

async function dismissEducationStep(page: Page): Promise<boolean> {
  const modal = page.locator('.jobs-easy-apply-modal, .artdeco-modal').first();
  const cancelButton = modal.getByRole('button', { name: /^(cancel|cancelar)$/i }).first();

  if (!await cancelButton.isVisible().catch(() => false)) {
    const cancelFallback = modal.locator('button.artdeco-button--tertiary, button.artdeco-button--muted').filter({
      hasText: /cancel|cancelar/i,
    }).first();
    if (await cancelFallback.isVisible().catch(() => false)) {
      await cancelFallback.click({ force: true });
    } else {
      return false;
    }
  } else {
    await cancelButton.click({ force: true });
  }

  await page.waitForTimeout(500);

  const discardButton = page.getByRole('button', { name: /^(discard|descartar)$/i }).first();
  if (await discardButton.isVisible().catch(() => false)) {
    await discardButton.click({ force: true });
    await page.waitForTimeout(750);
  }

  return true;
}

async function askAI(label: string, options: string[] | null, config: AppConfig): Promise<string | null> {
  const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!config.useAI || !apiKey) return null;

  try {
    const ai = new OpenAI({ apiKey });
    const resume = config.resume.slice(0, 3000);

    // Build profile context from config
    const profileContext = [
      config.profile.firstName && `Name: ${config.profile.firstName} ${config.profile.lastName}`,
      config.profile.city && `Location: ${config.profile.city}, ${config.profile.state}, ${config.profile.country}`,
      config.profile.yearsOfExperience && `Years of experience: ${config.profile.yearsOfExperience}`,
      config.education.school && `Education: ${config.education.school}${config.education.degree ? `, ${config.education.degree}` : ''}${config.education.major ? `, ${config.education.major}` : ''}`,
    ].filter(Boolean).join('\n');

    const hasOptions = options && options.length > 0;
    const prompt = `You are filling out a job application form on behalf of a candidate.
Answer this question based on the candidate's resume and profile. Be honest and accurate.

Question: "${label}"
${hasOptions ? `Available options (you MUST pick one of these EXACTLY as written): ${options.join(', ')}` : 'Provide a concise answer (1-5 words max).'}

Candidate profile:
${profileContext}

Candidate resume:
${resume}

${hasOptions ? 'Reply with ONLY the exact option text, nothing else.' : 'Reply with ONLY the answer value, nothing else.'}`;

    sendLog({ level: 'info', stage: 'apply', message: `Asking AI: "${label}"...` });
    const response = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 50,
      messages: [{ role: 'user', content: prompt }],
    });

    const answer = response.choices[0].message.content?.trim() || null;
    if (answer) {
      sendLog({ level: 'info', stage: 'apply', message: `AI Result: "${label}" → "${answer}"` });
    }
    return answer;
  } catch (err) {
    sendLog({ level: 'warn', stage: 'apply', message: `AI fallback failed: ${err instanceof Error ? err.message : String(err)}` });
    return null;
  }
}

// ── Main execution ───────────────────────────────────────────────────

async function main() {
  let browser: Browser | null = null;
  let context: any = null;

  try {
    // Load config
    const config = loadConfig();
    sendLog({ level: 'info', stage: 'system', message: `Config loaded: AI=${config.useAI}, scoring=${config.useScoreMatching}(threshold=${config.scoreThreshold}), customAnswers=${config.customAnswers.length}, profile=${config.profile.firstName ? 'set' : 'empty'}` });

    // 1. Validate LinkedIn Credentials
    const lnEmail = config.linkedinEmail || process.env.LINKEDIN_EMAIL;
    const lnPassword = config.linkedinPassword || process.env.LINKEDIN_PASSWORD;
    if (!lnEmail || !lnPassword) {
      sendLog({ level: 'error', stage: 'system', message: 'CRITICAL ERROR: LinkedIn credentials missing. Set them in the Configuration page.' });
      sendDone('error', stats);
      return;
    }

    // 2. Validate OpenAI API Key (only if AI/Scoring is enabled)
    if (config.useAI || config.useScoreMatching) {
      const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        sendLog({ level: 'error', stage: 'system', message: 'CRITICAL ERROR: OpenAI API Key missing but AI features are enabled. Disable AI features or provide a key.' });
        sendDone('error', stats);
        return;
      }
    }

    // 3. Validate Resume
    let resumeContent = config.resume;
    if (!resumeContent || resumeContent.trim().length < 50) {
      const resumePath = path.resolve(process.env.RESUME_PATH || './data/resume.txt');
      try {
        resumeContent = fs.readFileSync(resumePath, 'utf-8');
      } catch { /* no file */ }
    }

    if (!resumeContent || resumeContent.trim().length < 100) {
      sendLog({ level: 'error', stage: 'system', message: 'CRITICAL ERROR: Resume is missing or too short. Please provide a valid resume in the Configuration page.' });
      sendDone('error', stats);
      return;
    }

    sendLog({ level: 'info', stage: 'system', message: `Validation passed. Resume loaded: ${resumeContent.trim().length} chars` });

    sendLog({ level: 'info', stage: 'system', message: 'Launching browser...' });

    browser = await chromium.launch({
      headless: false,
      args: ['--disable-blink-features=AutomationControlled'],
    });

    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    // Step 1: Try to load saved cookies first
    let cookiesLoaded = await loadCookies(context);

    if (cookiesLoaded) {
      // Test if cookies are still valid by navigating to LinkedIn
      try {
        sendLog({ level: 'info', stage: 'system', message: 'Testing saved cookies...' });
        await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 15000 });
        const url = page.url();
        if (url.includes('/feed') || !url.includes('/login')) {
          sendLog({ level: 'success', stage: 'system', message: 'Cookies still valid, skipping login' });
          cookiesLoaded = true;
        } else {
          sendLog({ level: 'warn', stage: 'system', message: 'Cookies expired, need to login again' });
          cookiesLoaded = false;
        }
      } catch (err) {
        sendLog({ level: 'warn', stage: 'system', message: 'Cookie test failed, will login fresh' });
        cookiesLoaded = false;
      }
    }

    // If cookies didn't work or don't exist, login fresh
    if (!cookiesLoaded) {
      await loginToLinkedIn(page, config);
    }

    if (shouldStop) { sendDone('finished', stats); return; }

    // Step 2: Collect job listings across multiple pages
    const searchUrl = process.env.JOB_SEARCH_URL || '';
    const rawMaxPages = parseInt(process.env.MAX_PAGES || '3', 10);
    const maxPages = isNaN(rawMaxPages) || rawMaxPages < 1 ? 3 : Math.min(rawMaxPages, 20);

    if (!searchUrl || !searchUrl.includes('linkedin.com')) {
      sendLog({ level: 'error', stage: 'fetch', message: `JOB_SEARCH_URL is not set or is invalid: "${searchUrl.slice(0, 80)}". Restart the server and try again.` });
      sendDone('error', stats);
      return;
    }

    sendLog({ level: 'info', stage: 'fetch', message: `Collecting jobs from up to ${maxPages} pages... (local cap: ${effectiveCap})`, meta: { url: searchUrl } });

    const rawJobLinks = await collectJobLinks(page, searchUrl, maxPages);

    // Keep each local run bounded even if the search returns many pages.
    const jobLinks = rawJobLinks.slice(0, effectiveCap);
    const capped = rawJobLinks.length > jobLinks.length;

    sendLog({
      level: jobLinks.length > 0 ? 'info' : 'warn',
      stage: 'fetch',
      message: capped
        ? `Found ${rawJobLinks.length} jobs, capped to ${jobLinks.length} (local run limit)`
        : `Found ${jobLinks.length} total job listings across all pages`,
      meta: { count: jobLinks.length, capped },
    });

    if (jobLinks.length === 0) {
      sendLog({ level: 'error', stage: 'fetch', message: 'No job links found. Check search URL or LinkedIn may have changed its layout.' });
      sendDone('error', stats);
      return;
    }

    // Step 4: Process each job
    for (const jobUrl of jobLinks) {
      if (shouldStop) break;
      if (stats.totalJobs >= effectiveCap) {
        sendLog({ level: 'warn', stage: 'system', message: `Local job limit reached (${effectiveCap})` });
        break;
      }

      try {
        await processJob(page, jobUrl, searchUrl, config, easyApplyOnly);
      } catch (err) {
        sendLog({
          level: 'error',
          stage: 'apply',
          message: `Error processing job: ${err instanceof Error ? err.message : String(err)}`,
          meta: { url: jobUrl },
        });
      }

      stats.totalJobs++;
      sendStats(stats);

      // Rate limiting: random delay 3-8 seconds between jobs
      const delay = 3000 + Math.random() * 5000;
      await page.waitForTimeout(delay);
    }

    sendDone('finished', stats);
  } catch (err) {
    sendLog({
      level: 'error',
      stage: 'system',
      message: `Fatal error: ${err instanceof Error ? err.message : String(err)}`,
    });
    sendDone('error', stats);
  } finally {
    // Save cookies for next run
    if (context) {
      await saveCookies(context);
    }
    if (browser) await browser.close();
    setTimeout(() => process.exit(0), 1000);
  }
}

// ── LinkedIn Actions ─────────────────────────────────────────────────

async function loginToLinkedIn(page: Page, config: AppConfig) {
  sendLog({ level: 'info', stage: 'system', message: 'Logging in to LinkedIn...' });
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });

  const email = config.linkedinEmail || process.env.LINKEDIN_EMAIL;
  const password = config.linkedinPassword || process.env.LINKEDIN_PASSWORD;

  if (!email || !password) {
    throw new Error('LinkedIn credentials missing. Please set them in the Configuration page.');
  }

  await page.fill('#username', email);
  await page.fill('#password', password);
  await page.click('[data-litms-control-urn="login-submit"]');

  // Wait for the URL to leave /login — poll-based to avoid waitForURL load timeout
  sendLog({ level: 'info', stage: 'system', message: 'Waiting for login redirect...' });
  let attempts = 0;
  while (attempts < 60) {
    await page.waitForTimeout(1000);
    const currentUrl = page.url();

    if (currentUrl.includes('/checkpoint') || currentUrl.includes('/challenge')) {
      sendLog({ level: 'warn', stage: 'system', message: `Manual verification needed: ${currentUrl}` });
      // Keep waiting — user will solve CAPTCHA/2FA in the visible browser
    } else if (!currentUrl.includes('/login')) {
      // Successfully left the login page
      sendLog({ level: 'success', stage: 'system', message: `Logged in, redirected to: ${currentUrl}` });
      return;
    }

    attempts++;
  }

  throw new Error('Login timed out after 60 seconds');
}

async function collectJobLinks(page: Page, searchUrl: string, maxPages = 3): Promise<string[]> {
  const allLinks: string[] = [];

  // Guard: catch the hot-reload arg-shift bug where userId ends up as searchUrl
  if (!searchUrl || !searchUrl.includes('linkedin.com')) {
    sendLog({ level: 'error', stage: 'fetch', message: `Invalid search URL: "${String(searchUrl).slice(0, 80)}". Restart the server and try again.` });
    return [];
  }

  // Strip any existing `start` param so we control pagination cleanly
  const baseUrl = searchUrl.replace(/[?&]start=\d+/, '');
  const separator = baseUrl.includes('?') ? '&' : '?';

  for (let pageNum = 0; pageNum < maxPages; pageNum++) {
    if (shouldStop) break;

    const pageUrl = pageNum === 0
      ? `${baseUrl}`
      : `${baseUrl}${separator}start=${pageNum * 25}`;

    sendLog({ level: 'info', stage: 'fetch', message: `Loading page ${pageNum + 1} of ${maxPages}...`, meta: { url: pageUrl } });

    try {
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (navErr) {
      sendLog({ level: 'warn', stage: 'fetch', message: `Navigation failed: ${navErr instanceof Error ? navErr.message : String(navErr)}` });
      break;
    }

    // Log redirect (helps diagnose when LinkedIn sends us somewhere unexpected)
    const currentUrl = page.url();
    if (!currentUrl.includes('linkedin.com/jobs')) {
      sendLog({ level: 'warn', stage: 'fetch', message: `Redirected away from jobs: ${currentUrl}` });
    }

    // Wait for job list to appear — try multiple known container selectors
    // (LinkedIn changes class names frequently; fall back to any job href)
    const containerSelectors = [
      '.jobs-search-results-list',          // common 2024–2025
      '.scaffold-layout__list',
      'ul.scaffold-layout__list-detail-container',
      '.job-card-container',                // older layout
      '.jobs-search__results-list',
      'a[href*="/jobs/view/"]',             // last resort — page has job links
    ];

    let loaded = false;
    for (const cs of containerSelectors) {
      loaded = await waitForSelector(page, cs, 7000);
      if (loaded) {
        sendLog({ level: 'info', stage: 'fetch', message: `Page ${pageNum + 1}: container matched "${cs}"` });
        break;
      }
    }

    if (!loaded) {
      // One retry with networkidle
      sendLog({ level: 'warn', stage: 'fetch', message: `Page ${pageNum + 1}: no container found, retrying with networkidle...` });
      try { await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 45000 }); } catch { /* ignore */ }
      for (const cs of containerSelectors) {
        loaded = await waitForSelector(page, cs, 7000);
        if (loaded) break;
      }
      if (!loaded) {
        const title = await page.title().catch(() => '?');
        sendLog({ level: 'warn', stage: 'fetch', message: `Page ${pageNum + 1}: retry failed. Title: "${title}" URL: ${page.url()}` });
        break;
      }
    }

    // Give lazy-loaded cards extra time
    await page.waitForTimeout(1500);

    // Scroll the job list panel to force all cards to load
    for (let sp = 0; sp < 3; sp++) {
      await page.evaluate(() => {
        const candidates = [
          '.jobs-search-results-list',
          '.scaffold-layout__list',
          '.job-card-container',
        ];
        for (const sel of candidates) {
          const el = document.querySelector(sel);
          if (!el) continue;
          let node: Element | null = el;
          while (node && node !== document.body) {
            const s = window.getComputedStyle(node);
            if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
              node.scrollTop = node.scrollHeight;
              return;
            }
            node = node.parentElement;
          }
        }
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(1000);
    }

    // ── Extract job links ───────────────────────────────────────────────────
    // Use page.evaluate to grab ALL <a href="/jobs/view/..."> links at once.
    // This approach is immune to LinkedIn's CSS class name changes.
    const rawLinks: string[] = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href*="/jobs/view/"]'))
        .map(a => (a as HTMLAnchorElement).href)
        .filter(h => h.includes('/jobs/view/'));
    });

    const pageLinks: string[] = [];
    for (const href of rawLinks) {
      const cleanUrl = href.split('?')[0];
      if (!allLinks.includes(cleanUrl) && !pageLinks.includes(cleanUrl)) {
        pageLinks.push(cleanUrl);
      }
    }

    sendLog({ level: 'info', stage: 'fetch', message: `Page ${pageNum + 1}: found ${pageLinks.length} unique job links` });

    if (pageLinks.length === 0) {
      const title = await page.title().catch(() => '?');
      sendLog({ level: 'warn', stage: 'fetch', message: `0 jobs on page ${pageNum + 1}. Title: "${title}". Stopping pagination.` });
      break;
    }

    allLinks.push(...pageLinks);
    sendLog({ level: 'info', stage: 'fetch', message: `Page ${pageNum + 1}: +${pageLinks.length} jobs (running total: ${allLinks.length})` });

    if (pageNum < maxPages - 1) await page.waitForTimeout(2000);
  }

  return allLinks;
}

async function processJob(page: Page, jobUrl: string, searchUrl: string, config: AppConfig, easyApplyOnly = false) {
  const jobId = jobUrl.match(/\/view\/(\d+)/)?.[1] || 'unknown';

  sendLog({
    level: 'info',
    stage: 'fetch',
    message: `Opening job details`,
    meta: { jobId, url: jobUrl, jobTitle: 'Unknown', company: 'Unknown' },
  });

  await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for the job detail shell to settle. LinkedIn changes the exact markup often,
  // so we accept either a visible heading or the apply button shell.
  const detailReady = await waitForJobDetailShell(page, 15000);
  if (!detailReady) {
    sendLog({ level: 'warn', stage: 'fetch', message: 'Job details shell did not fully settle in time', meta: { jobId } });
    await page.waitForTimeout(1500);
  }

  // Extract job details using multiple selector strategies
  const jobTitle = await extractText(page, [
    'main h1',
    'h1',
    '.job-details-jobs-unified-top-card__job-title h1',
    '.job-details-jobs-unified-top-card__job-title',
    '.t-24.t-bold',
    '[data-test-id*="job-title"]',
  ]) || 'Unknown';

  const companyName = await extractText(page, [
    '.job-details-jobs-unified-top-card__company-name a',
    '.job-details-jobs-unified-top-card__company-name',
  ]) || 'Unknown';

  await page.waitForTimeout(1000);
  const easyApplyMatch = await findVisibleEasyApplyButton(page);

  if (easyApplyOnly && !easyApplyMatch) {
    stats.discardedJobs++;
    sendLog({
      level: 'info',
      stage: 'decision',
      message: `Skipping job: Easy Apply button not visible`,
      meta: { jobId, url: jobUrl, easyApplyOnly: true },
    });
    return;
  }

  // Try multiple selectors for job description — LinkedIn changes structure frequently
  let jobDescription = await extractText(page, [
    '.jobs-description__content',
    '.show-more-less-html__markup',
    '.jobs-description',
    '[data-test-id="jobs-details-top-card"] ~ div',
    '.jobs-details__main-content',
    'article .show-more-less-html__markup',
    '.jobs-details-jobs-unified-top-card ~ [class*="description"]',
  ]) || '';

  // If description is still empty, try to get ANY large text block from the page
  if (jobDescription.trim().length < 50) {
    try {
      const allText = await page.evaluate(() => document.body.textContent) || '';
      // Extract a large chunk from the middle (usually the description)
      const lines = allText.split('\n').filter(line => line.trim().length > 20);
      if (lines.length > 10) {
        // Get lines 5-20 (usually the description area)
        let descBlock = lines.slice(5, 20).join(' ');
        // Cap the description to avoid exceeding OpenAI token limits
        if (descBlock.length > 3000) {
          descBlock = descBlock.slice(0, 3000) + '...';
        }
        if (descBlock.length > 50) {
          jobDescription = descBlock; // ← assign back so scoring uses it
          sendLog({ level: 'info', stage: 'fetch', message: 'Extracted description from page text fallback', meta: { jobId, length: descBlock.length } });
        }
      }
    } catch {
      sendLog({ level: 'warn', stage: 'fetch', message: 'Could not extract description from page fallback', meta: { jobId } });
    }
  }

  sendLog({
    level: 'info',
    stage: 'scoring',
    message: `Scoring: "${jobTitle.trim()}" at ${companyName.trim()} (description: ${jobDescription.trim().length} chars)`,
    meta: { jobId, jobTitle: jobTitle.trim(), company: companyName.trim(), descriptionLength: jobDescription.trim().length },
  });

  // Warn if no description was extracted
  if (jobDescription.trim().length < 20) {
    sendLog({
      level: 'warn',
      stage: 'scoring',
      message: `Job description is empty or very short — GPT score will be inaccurate`,
      meta: { jobId, descriptionLength: jobDescription.trim().length },
    });
  }

  // Score with GPT (if enabled)
  if (config.useScoreMatching) {
    const scoring = await scoreJobMatch(jobTitle.trim(), jobDescription.trim(), companyName.trim(), config.scoreThreshold);

    // Log score with reasoning visible in the message itself
    const concernsStr = scoring.concerns.length > 0 ? ` | Issues: ${scoring.concerns.join(', ')}` : '';
    const matchesStr = scoring.keyMatches.length > 0 ? ` | Matches: ${scoring.keyMatches.join(', ')}` : '';
    sendLog({
      level: scoring.shouldApply ? 'success' : 'warn',
      stage: 'scoring',
      message: `Score ${scoring.score}/100 — ${scoring.reasoning}${concernsStr}${matchesStr}`,
      meta: {
        jobId,
        match_score: scoring.score,
        shouldApply: scoring.shouldApply,
        reasoning: scoring.reasoning,
        keyMatches: scoring.keyMatches,
        concerns: scoring.concerns,
      },
    });

    if (!scoring.shouldApply) {
      stats.discardedJobs++;
      sendLog({
        level: 'info',
        stage: 'decision',
        message: `Skipping job: score ${scoring.score} below threshold`,
        meta: { jobId },
      });
      return;
    }
  } else {
    sendLog({
      level: 'info',
      stage: 'scoring',
      message: `Score matching disabled — skipping GPT scoring, proceeding to apply`,
      meta: { jobId },
    });
  }

  if (!easyApplyMatch) {
    const alreadyApplied = await looksAlreadyApplied(page);
    if (alreadyApplied) {
      stats.discardedJobs++;
      sendLog({
        level: 'info',
        stage: 'decision',
        message: `Skipping job already marked as applied`,
        meta: { jobId, url: jobUrl, jobTitle: jobTitle.trim(), company: companyName.trim() },
      });
      await returnToResults(page, searchUrl);
      return;
    }

    stats.manualJobs++;
    sendLog({
      level: 'warn',
      stage: 'fallback',
      message: `Flagged for manual apply: Easy Apply button exists but none are visible`,
      meta: { jobId, url: jobUrl, jobTitle: jobTitle.trim(), company: companyName.trim() },
    });
    await returnToResults(page, searchUrl);
    return;
  }

  sendLog({
    level: 'info',
    stage: 'apply',
    message: `Easy Apply button found via "${easyApplyMatch.foundSelector}", clicking...`,
    meta: { jobId, jobTitle: jobTitle.trim(), company: companyName.trim(), url: jobUrl },
  });
  await attemptEasyApply(page, jobTitle.trim(), companyName.trim(), jobId, easyApplyMatch.button, config);
}

async function findVisibleEasyApplyButton(page: Page): Promise<{ button: Locator; foundSelector: string } | null> {
  for (let attempt = 0; attempt < 10; attempt++) {
    for (const selector of EASY_APPLY_SELECTORS) {
      const all = page.locator(selector);
      const count = await all.count().catch(() => 0);
      if (count === 0) continue;

      for (let i = 0; i < count; i++) {
        const loc = all.nth(i);
        const text = await loc.textContent().catch(() => '');
        const ariaLabel = await loc.getAttribute('aria-label').catch(() => '');
        const combined = `${text || ''} ${ariaLabel || ''}`.toLowerCase();
        if (!combined.includes('apply')) continue;

        const visible = await loc.isVisible().catch(() => false);
        if (visible) {
          return { button: loc, foundSelector: `${selector}[${i}]` };
        }
      }
    }

    const textCandidates = page.getByText('Easy Apply', { exact: false });
    const textCount = await textCandidates.count().catch(() => 0);
    for (let i = 0; i < textCount; i++) {
      const loc = textCandidates.nth(i);
      const visible = await loc.isVisible().catch(() => false);
      if (!visible) continue;

      const handle = await loc.elementHandle().catch(() => null);
      const ancestor = handle ? await handle.evaluateHandle((node) => {
        const element = node as HTMLElement;
        return element.closest('a, button, [role="button"]');
      }).catch(() => null) : null;

      if (ancestor) {
        const candidate = page.locator('a, button, [role="button"]').filter({
          hasText: /easy apply/i,
        }).first();
        if (await candidate.isVisible().catch(() => false)) {
          return { button: candidate, foundSelector: 'text:Easy Apply' };
        }
      }
    }

    await page.waitForTimeout(500);
  }
  return null;
}

async function extractText(page: Page, selectors: string[]): Promise<string | null> {
  for (const selector of selectors) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible().catch(() => false)) {
        const text = await el.textContent();
        if (text && text.trim().length > 0) {
          return text.trim();
        }
      }
    } catch {
      // Try next selector
    }
  }
  return null;
}

async function looksAlreadyApplied(page: Page): Promise<boolean> {
  const appliedSelectors = [
    'button:has-text("Applied")',
    'button:has-text("Application submitted")',
    'button:has-text("Candidatura enviada")',
    'a:has-text("Applied")',
    'span:has-text("Applied")',
    'div:has-text("Applied")',
  ];

  for (const selector of appliedSelectors) {
    if (await page.locator(selector).first().isVisible().catch(() => false)) {
      return true;
    }
  }

  return false;
}

async function returnToResults(page: Page, searchUrl: string): Promise<void> {
  try {
    const canonical = searchUrl
      .replace(/[?&]currentJobId=\d+/g, '')
      .replace(/[?&]position=\d+/g, '')
      .replace(/[?&]pageNum=\d+/g, '')
      .replace(/[?&]trackingId=[^&]+/g, '')
      .replace(/[?&]trk=[^&]+/g, '')
      .replace(/[?&]$/, '');
    await page.goto(canonical, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);
  } catch {
    // best effort
  }
}

async function attemptEasyApply(page: Page, jobTitle: string, companyName: string, jobId: string, applyBtn: Locator, config: AppConfig) {
  sendLog({ level: 'info', stage: 'apply', message: `Starting Easy Apply for "${jobTitle}"`, meta: { jobId } });

  try {
    // Scroll button into view first
    await applyBtn.scrollIntoViewIfNeeded();

    // Human-like delay before clicking — avoids looking like a bot
    const preClickDelay = 4000 + Math.floor(Math.random() * 2000);
    sendLog({ level: 'info', stage: 'apply', message: `Waiting ${(preClickDelay / 1000).toFixed(1)}s before clicking Easy Apply...`, meta: { jobId } });
    await page.waitForTimeout(preClickDelay);

    // Use force:true to click even if not perfectly visible — LinkedIn sometimes covers buttons with overlays
    await applyBtn.click({ force: true, timeout: 10000 });
    sendLog({ level: 'info', stage: 'apply', message: 'Clicked Easy Apply button, waiting for modal...', meta: { jobId, jobTitle, company: companyName } });

    // Wait for the Easy Apply modal to appear
    const modalLoaded = await waitForSelector(page, '.jobs-easy-apply-modal, .artdeco-modal', 5000);
    if (!modalLoaded) {
      // Check for daily limit message (seen in screenshot)
      const dailyLimitText = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        return bodyText.includes('limit daily submissions') || bodyText.includes('apply tomorrow');
      });

      if (dailyLimitText) {
        sendLog({
          level: 'error',
          stage: 'system',
          message: 'Daily application limit reached. LinkedIn has temporarily blocked new submissions to prevent automated behavior. Please try again tomorrow.',
        });
        shouldStop = true;
        return;
      }

      sendLog({ level: 'warn', stage: 'apply', message: 'Easy Apply modal did not appear', meta: { jobId } });
      stats.manualJobs++;
      return;
    }

    await page.waitForTimeout(1000);

    let maxSteps = 10;
    while (maxSteps-- > 0) {
      if (shouldStop) {
        sendLog({ level: 'warn', stage: 'apply', message: 'Aborting Easy Apply due to stop signal', meta: { jobId } });
        await closeModal(page);
        stats.manualJobs++;
        return;
      }

      // Fill form fields on the current page before clicking any buttons
      const { filled, unanswered, educationBlocked } = await fillFormFields(page, config, jobId);
      if (filled > 0) {
        sendLog({ level: 'info', stage: 'apply', message: `Filled ${filled} field(s) on this step`, meta: { jobId } });
      }
      if (unanswered.length > 0) {
        sendLog({ level: 'warn', stage: 'apply', message: `Questions without answers: ${unanswered.join(', ')}`, meta: { jobId, unanswered } });
      }

      if (educationBlocked) {
        sendLog({
          level: 'warn',
          stage: 'fallback',
          message: `Education step needs configuration — dismissing education editor and continuing`,
          meta: { jobId, reason: 'Missing education config', jobTitle, company: companyName },
        });
        const dismissed = await dismissEducationStep(page);
        if (!dismissed) {
          stats.needsInfoJobs++;
          sendLog({
            level: 'warn',
            stage: 'fallback',
            message: `Could not dismiss education step cleanly — closing application`,
          meta: { jobId, jobTitle, company: companyName },
        });
        await closeModal(page);
        return;
        }
        await page.waitForTimeout(1000);
        continue;
      }

      // Check for validation errors IF we have unanswered questions or just filled something
      const errorMsg = page.locator('.artdeco-inline-feedback--error, .artdeco-text-input--error, .fb-dash-form-element--error, [data-test-form-element-error]').first();
      if (await errorMsg.isVisible().catch(() => false)) {
        const text = await errorMsg.textContent();
        sendLog({ level: 'warn', stage: 'apply', message: `Form has errors: "${text?.trim()}" — Skipping job to save time.`, meta: { jobId } });
        stats.needsInfoJobs++;
        await closeModal(page);
        return;
      }

      // Small delay after filling to let LinkedIn validate
      if (filled > 0) await page.waitForTimeout(500);

      // Check for submit button (multiple possible aria-labels)
      const submitButton = page.locator('button[aria-label="Submit application"], button[aria-label="Enviar candidatura"]').first();
      if (await submitButton.isVisible().catch(() => false)) {
        sendLog({ level: 'info', stage: 'apply', message: 'Found Submit button, submitting...', meta: { jobId } });
        await submitButton.click();
        stats.appliedJobs++;
        sendLog({
          level: 'success',
          stage: 'apply',
          message: `Application submitted for "${jobTitle}"`,
          meta: { jobId },
        });

        // Close confirmation dialog
        await page.waitForTimeout(1500);
        await closeModal(page);
        return;
      }

      // Check for "Next" button
      const nextButton = page.locator('button[aria-label="Continue to next step"], button[aria-label="Continuar para a próxima etapa"]').first();
      if (await nextButton.isVisible().catch(() => false)) {
        sendLog({ level: 'info', stage: 'apply', message: 'Clicking Next step...', meta: { jobId } });
        await nextButton.click();
        await page.waitForTimeout(1000);
        continue;
      }

      // Check for "Review" button
      const reviewButton = page.locator('button[aria-label="Review your application"], button[aria-label="Revise sua candidatura"]').first();
      if (await reviewButton.isVisible().catch(() => false)) {
        sendLog({ level: 'info', stage: 'apply', message: 'Clicking Review...', meta: { jobId } });
        await reviewButton.click();
        await page.waitForTimeout(1000);
        continue;
      }

      // Check if there are required fields that are empty (indicates form needs manual input)
      const requiredEmpty = await page.locator('.artdeco-text-input--error, .fb-dash-form-element--error, [data-test-form-element-error]').count();
      if (requiredEmpty > 0) {
        stats.needsInfoJobs++;
        sendLog({
          level: 'warn',
          stage: 'fallback',
          message: `Needs info: ${requiredEmpty} required field(s) for "${jobTitle}" — flagged for manual review`,
        meta: { jobId, needsInfo: true, reason: `${requiredEmpty} required fields`, jobTitle, company: companyName },
      });
        await closeModal(page);
        return;
      }

      // Try to find ANY footer button in the modal (Next/Review/Submit might have different labels)
      const footerButton = page.locator('.artdeco-modal .jobs-easy-apply-footer button.artdeco-button--primary, .artdeco-modal footer button.artdeco-button--primary').first();
      if (await footerButton.isVisible().catch(() => false)) {
        const btnText = await footerButton.textContent();
        sendLog({ level: 'info', stage: 'apply', message: `Clicking footer button: "${btnText?.trim()}"`, meta: { jobId } });

        // Safety check: if button says "Submit" or "Enviar", it's the final step
        if (btnText?.toLowerCase().includes('submit') || btnText?.toLowerCase().includes('enviar')) {
          await footerButton.click();
          stats.appliedJobs++;
          sendLog({
            level: 'success',
            stage: 'apply',
            message: `Application submitted for "${jobTitle}"`,
            meta: { jobId },
          });
          await page.waitForTimeout(1500);
          await closeModal(page);
          return;
        }

        await footerButton.click();
        await page.waitForTimeout(1000);
        continue;
      }

      // Nothing clickable found — complex form needs manual input
      stats.needsInfoJobs++;
      sendLog({
        level: 'warn',
        stage: 'fallback',
      message: `Needs info: form requires additional input for "${jobTitle}" — flagged for manual review`,
      meta: { jobId, needsInfo: true, reason: 'No actionable buttons found in modal', jobTitle, company: companyName },
    });
      await closeModal(page);
      return;
    }

    // Exhausted max steps — form has too many steps or required inputs
    stats.needsInfoJobs++;
    sendLog({
      level: 'warn',
      stage: 'fallback',
      message: `Needs info: max steps exceeded for "${jobTitle}" — flagged for manual review`,
      meta: { jobId, needsInfo: true, reason: 'Exceeded 10 form steps', jobTitle, company: companyName },
    });
    await closeModal(page);
  } catch (err) {
    stats.manualJobs++;
    sendLog({
      level: 'error',
      stage: 'apply',
      message: `Easy Apply failed: ${err instanceof Error ? err.message : String(err)}`,
      meta: { jobId, jobTitle, company: companyName },
    });
    await closeModal(page);
  }
}

async function closeModal(page: Page) {
  try {
    // Try dismiss button first
    const dismissBtn = page.locator('button[aria-label="Dismiss"], button[aria-label="Dispensar"], button[aria-label="Fechar"]').first();
    if (await dismissBtn.isVisible().catch(() => false)) {
      await dismissBtn.click();
      await page.waitForTimeout(500);

      // LinkedIn sometimes shows a "Discard" confirmation dialog
      const discardBtn = page.locator('button[data-control-name="discard_application_confirm_btn"], button[data-test-dialog-primary-btn]').first();
      if (await discardBtn.isVisible().catch(() => false)) {
        await discardBtn.click();
      }
      return;
    }

    // Try the X close button on the modal
    const closeBtn = page.locator('.artdeco-modal__dismiss, .artdeco-modal button[aria-label="Dismiss"]').first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
      await page.waitForTimeout(500);

      // Handle discard confirmation
      const discardBtn = page.locator('button[data-control-name="discard_application_confirm_btn"], button[data-test-dialog-primary-btn]').first();
      if (await discardBtn.isVisible().catch(() => false)) {
        await discardBtn.click();
      }
    }
  } catch {
    // Best effort — ignore cleanup errors
  }
}

// Start execution
main();
