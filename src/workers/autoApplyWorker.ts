import { chromium, Browser, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import { scoreJobMatch } from '../lib/scoring';
import type { WorkerMessage, ParentMessage, LogEvent, ExecutionStats } from '../lib/types';

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

// ── Main execution ───────────────────────────────────────────────────

async function main() {
  let browser: Browser | null = null;
  let context: any = null;

  try {
    // Check resume file before starting
    const resumePath = path.resolve(process.env.RESUME_PATH || './data/resume.txt');
    try {
      const resumeContent = fs.readFileSync(resumePath, 'utf-8');
      if (resumeContent.includes('Placeholder resume') || resumeContent.trim().length < 100) {
        sendLog({
          level: 'error',
          stage: 'system',
          message: `WARNING: resume.txt is placeholder or too short (${resumeContent.trim().length} chars). Edit data/resume.txt with your real resume! All scores will be 0.`,
        });
      } else {
        sendLog({
          level: 'info',
          stage: 'system',
          message: `Resume loaded: ${resumeContent.trim().length} chars`,
        });
      }
    } catch (err) {
      sendLog({
        level: 'error',
        stage: 'system',
        message: `Cannot read resume file at ${resumePath}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

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
      await loginToLinkedIn(page);
    }

    if (shouldStop) { sendDone('finished', stats); return; }

    // Step 2: Collect job listings across multiple pages
    const searchUrl = process.env.JOB_SEARCH_URL!;
    const maxPages = parseInt(process.env.MAX_PAGES || '3', 10);
    sendLog({ level: 'info', stage: 'fetch', message: `Collecting jobs from up to ${maxPages} pages...`, meta: { url: searchUrl } });

    const jobLinks = await collectJobLinks(page, searchUrl, maxPages);
    sendLog({
      level: jobLinks.length > 0 ? 'info' : 'warn',
      stage: 'fetch',
      message: `Found ${jobLinks.length} total job listings across all pages`,
      meta: { count: jobLinks.length },
    });

    if (jobLinks.length === 0) {
      sendLog({ level: 'error', stage: 'fetch', message: 'No job links found. Check search URL or LinkedIn may have changed its layout.' });
      sendDone('error', stats);
      return;
    }

    // Step 4: Process each job
    for (const jobUrl of jobLinks) {
      if (shouldStop) break;
      if (stats.appliedJobs >= dailyCap) {
        sendLog({ level: 'warn', stage: 'system', message: `Daily cap reached (${dailyCap})` });
        break;
      }

      try {
        await processJob(page, jobUrl);
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

async function loginToLinkedIn(page: Page) {
  sendLog({ level: 'info', stage: 'system', message: 'Logging in to LinkedIn...' });
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });

  await page.fill('#username', process.env.LINKEDIN_EMAIL!);
  await page.fill('#password', process.env.LINKEDIN_PASSWORD!);
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

  // Strip any existing `start` param so we control pagination cleanly
  const baseUrl = searchUrl.replace(/[?&]start=\d+/, '').replace(/[?&]currentJobId=\d+/, '');
  const separator = baseUrl.includes('?') ? '&' : '?';

  for (let pageNum = 0; pageNum < maxPages; pageNum++) {
    if (shouldStop) break;

    const pageUrl = pageNum === 0
      ? `${baseUrl}${separator}start=0`
      : `${baseUrl}${separator}start=${pageNum * 25}`;

    sendLog({ level: 'info', stage: 'fetch', message: `Loading page ${pageNum + 1} of ${maxPages}...`, meta: { url: pageUrl } });

    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for job cards to render
    const loaded = await waitForSelector(page, '.job-card-container, .jobs-search-results-list, .scaffold-layout__list', 12000);
    if (!loaded) {
      sendLog({ level: 'warn', stage: 'fetch', message: `Page ${pageNum + 1}: job cards not detected, skipping` });
      break;
    }

    // Scroll the LEFT job list panel (not the job detail pane on the right).
    // LinkedIn's layout nests job cards inside a scrollable parent.
    // We find it dynamically by walking up from a job card to its scrollable ancestor.
    for (let scrollPass = 0; scrollPass < 3; scrollPass++) {
      await page.evaluate(() => {
        // Strategy 1: Find scrollable ancestor of job cards
        const card = document.querySelector('.job-card-container, .job-card-list__entity-lockup');
        if (card) {
          let el = card.parentElement;
          while (el && el !== document.body) {
            const style = window.getComputedStyle(el);
            const isScrollable = (style.overflowY === 'auto' || style.overflowY === 'scroll')
              && el.scrollHeight > el.clientHeight;
            if (isScrollable) {
              el.scrollTop = el.scrollHeight;
              return;
            }
            el = el.parentElement;
          }
        }
        // Strategy 2: Scroll the scaffold list container
        const scaffold = document.querySelector('.scaffold-layout__list-detail-inner, .scaffold-layout__list');
        if (scaffold && scaffold.scrollHeight > scaffold.clientHeight) {
          scaffold.scrollTop = scaffold.scrollHeight;
          return;
        }
        // Strategy 3: Scroll the page itself (fallback)
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(1200);
    }

    // Collect links using multiple selector strategies
    const pageLinks: string[] = [];
    const selectors = [
      '.job-card-container__link',
      '.job-card-list__title--link',
      'a[href*="/jobs/view/"]',
    ];

    for (const selector of selectors) {
      const elements = page.locator(selector);
      const count = await elements.count();
      if (count > 0) {
        sendLog({ level: 'info', stage: 'fetch', message: `Page ${pageNum + 1}: found ${count} cards with "${selector}"` });
        for (let i = 0; i < count; i++) {
          const href = await elements.nth(i).getAttribute('href');
          if (href && href.includes('/jobs/view/')) {
            const fullUrl = href.startsWith('http') ? href : `https://www.linkedin.com${href}`;
            const cleanUrl = fullUrl.split('?')[0];
            if (!allLinks.includes(cleanUrl) && !pageLinks.includes(cleanUrl)) {
              pageLinks.push(cleanUrl);
            }
          }
        }
        break;
      }
    }

    if (pageLinks.length === 0) {
      sendLog({ level: 'warn', stage: 'fetch', message: `Page ${pageNum + 1}: no jobs found, stopping pagination` });
      break;
    }

    allLinks.push(...pageLinks);
    sendLog({ level: 'info', stage: 'fetch', message: `Page ${pageNum + 1}: collected ${pageLinks.length} jobs (total: ${allLinks.length})` });

    // Small delay between pages
    if (pageNum < maxPages - 1) await page.waitForTimeout(2000);
  }

  return allLinks;
}

async function processJob(page: Page, jobUrl: string) {
  const jobId = jobUrl.match(/\/view\/(\d+)/)?.[1] || 'unknown';

  sendLog({
    level: 'info',
    stage: 'fetch',
    message: `Opening job details`,
    meta: { jobId, url: jobUrl },
  });

  await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for the job title to render
  const titleLoaded = await waitForSelector(page, '.job-details-jobs-unified-top-card__job-title, .t-24.t-bold', 10000);
  if (!titleLoaded) {
    sendLog({ level: 'warn', stage: 'fetch', message: 'Job details did not load in time', meta: { jobId } });
    // Still try to continue
    await page.waitForTimeout(2000);
  }

  // Extract job details using multiple selector strategies
  const jobTitle = await extractText(page, [
    '.job-details-jobs-unified-top-card__job-title h1',
    '.job-details-jobs-unified-top-card__job-title',
    '.t-24.t-bold',
  ]) || 'Unknown';

  const companyName = await extractText(page, [
    '.job-details-jobs-unified-top-card__company-name a',
    '.job-details-jobs-unified-top-card__company-name',
  ]) || 'Unknown';

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

  // Score with GPT
  const scoring = await scoreJobMatch(jobTitle.trim(), jobDescription.trim(), companyName.trim());

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

  // Attempt Easy Apply — target the specific button using its unique data attribute
  // The correct button has data-live-test-job-apply-button="" (id="jobs-apply-button-id")
  // Avoid button.jobs-apply-button which is a generic class shared with LinkedIn Premium upsell

  // Wait a moment for the button to fully render
  await page.waitForTimeout(1000);

  // Find the Easy Apply button — LinkedIn renders two copies of the button (one hidden,
  // one visible). We must find the VISIBLE one. .first() picks the hidden one.
  const selectors = [
    'button[data-live-test-job-apply-button]',
    '#jobs-apply-button-id',
    'button[aria-label*="Easy Apply"]',
    'button[aria-label*="Apply"]',
    'button.jobs-apply-button',
  ];

  let easyApplyButton = null;
  let foundSelector = '';

  for (const selector of selectors) {
    const all = page.locator(selector);
    const count = await all.count();
    if (count === 0) continue;

    // Iterate through all matches to find a visible one
    for (let i = 0; i < count; i++) {
      const loc = all.nth(i);
      const text = await loc.textContent().catch(() => '');
      const ariaLabel = await loc.getAttribute('aria-label').catch(() => '');
      const combined = (text + ' ' + ariaLabel).toLowerCase();
      if (!combined.includes('apply')) continue;

      const visible = await loc.isVisible().catch(() => false);
      if (visible) {
        easyApplyButton = loc;
        foundSelector = `${selector}[${i}]`;
        break;
      }
    }
    if (easyApplyButton) break;
  }

  if (!easyApplyButton) {
    stats.manualJobs++;
    sendLog({
      level: 'warn',
      stage: 'fallback',
      message: `Flagged for manual apply: Easy Apply button exists but none are visible`,
      meta: { jobId, url: jobUrl },
    });
    return;
  }

  sendLog({
    level: 'info',
    stage: 'apply',
    message: `Easy Apply button found via "${foundSelector}", clicking...`,
    meta: { jobId },
  });
  await attemptEasyApply(page, jobTitle.trim(), jobId, easyApplyButton);
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

async function attemptEasyApply(page: Page, jobTitle: string, jobId: string, applyBtn: ReturnType<typeof page.locator>) {
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
    sendLog({ level: 'info', stage: 'apply', message: 'Clicked Easy Apply button, waiting for modal...', meta: { jobId } });

    // Wait for the Easy Apply modal to appear
    const modalLoaded = await waitForSelector(page, '.jobs-easy-apply-modal, .artdeco-modal', 5000);
    if (!modalLoaded) {
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
          meta: { jobId, needsInfo: true, reason: `${requiredEmpty} required fields` },
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
        meta: { jobId, needsInfo: true, reason: 'No actionable buttons found in modal' },
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
      meta: { jobId, needsInfo: true, reason: 'Exceeded 10 form steps' },
    });
    await closeModal(page);
  } catch (err) {
    stats.manualJobs++;
    sendLog({
      level: 'error',
      stage: 'apply',
      message: `Easy Apply failed: ${err instanceof Error ? err.message : String(err)}`,
      meta: { jobId },
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
