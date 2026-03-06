import OpenAI from 'openai';
import { loadConfig, type AppConfig } from './config';

let openaiClient: OpenAI | null = null;

function getOpenAI(config: AppConfig): OpenAI {
  // Always recreate if key might have changed (lazy singleton per key)
  const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY || '';
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

export interface ScoringResult {
  score: number;
  reasoning: string;
  shouldApply: boolean;
  keyMatches: string[];
  concerns: string[];
}

function buildSystemPrompt(config: AppConfig): string {
  const p = config.profile;
  const location = [p.city, p.state, p.country].filter(Boolean).join(', ') || 'unknown location';
  const years = p.yearsOfExperience ? `${p.yearsOfExperience} years of experience` : '';
  const needsVisa = config.compliance.requireVisa === 'No' ? 'does not need visa sponsorship' : 'needs visa sponsorship';
  const headline = config.freeText.headline || 'Software Engineer';

  return `You are a STRICT job match scoring system for a candidate applying to remote jobs.

CANDIDATE PROFILE:
- Role: ${headline}
- Location: ${location}
${years ? `- Experience: ${years}` : ''}
- Work authorization: ${needsVisa}
- Seek remote work

DEALBREAKER CHECK (MANDATORY):
1. LOCATION:
   - On-site/hybrid in a country different from candidate's → MAX SCORE 15
   - Remote-only but requires relocation or on-site presence → MAX SCORE 20
   - Remote with timezone restrictions that don't match → MAX SCORE 35
   - Fully remote with no location restrictions → NO PENALTY

2. VISA / SPONSORSHIP:
   - Job requires local authorization candidate does not have → MAX SCORE 20

SKILLS SCORING (0-100 base):
- 0-20 pts: Role completely unrelated to candidate's experience
- 20-40 pts: Tangentially related but missing core skills
- 40-60 pts: Some overlapping skills but significant gaps in key requirements
- 60-75 pts: Good match with 70-85% of job requirements covered, minor gaps
- 75-90 pts: Strong match with 85%+ of requirements, aligned with career progression
- 90-100 pts: Excellent match — 95%+ coverage, perfect role fit

CRITICAL: Score based on job DETAILS not just title:
- If description is too vague/generic (<200 chars), score can't exceed 70 (insufficient signal)
- Heavy penalties for conflicting or unrealistic requirements
- Give credit for EXACT technology matches, not just "similar" tech

Return JSON with:
- score: number 0-100 (strictly enforced)
- reasoning: string (2-3 sentences explaining WHY this score, reference specific requirements)
- keyMatches: string[] (specific skills/requirements matched)
- concerns: string[] (ALL gaps, dealbreakers, vague requirements)`;
}

export async function scoreJobMatch(
  jobTitle: string,
  jobDescription: string,
  companyName: string,
  thresholdOverride?: number
): Promise<ScoringResult> {
  const config = loadConfig();
  const resume = config.resume || '';
  const threshold = thresholdOverride ?? config.scoreThreshold ?? 60;

  if (!resume || resume.trim().length < 100) {
    console.warn('[scoring] WARNING: Resume is missing or too short. Scores will be inaccurate. Set your resume in /config.');
  }

  if (!jobDescription || jobDescription.trim().length < 20) {
    console.warn('[scoring] WARNING: job description is empty or very short. Score may be inaccurate.');
  }

  const response = await getOpenAI(config).chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: buildSystemPrompt(config),
      },
      {
        role: 'user',
        content: `## Resume:\n${resume}\n\n## Job Posting:\nTitle: ${jobTitle}\nCompany: ${companyName}\nDescription: ${jobDescription}`,
      },
    ],
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error('Empty response from OpenAI');

  const parsed = JSON.parse(content);

  return {
    score: parsed.score,
    reasoning: parsed.reasoning,
    shouldApply: parsed.score >= threshold,
    keyMatches: parsed.keyMatches || [],
    concerns: parsed.concerns || [],
  };
}
