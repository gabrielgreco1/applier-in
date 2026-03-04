import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let cachedResume: string | null = null;

function getResume(): string {
  if (!cachedResume) {
    const resumePath = process.env.RESUME_PATH || './data/resume.txt';
    cachedResume = fs.readFileSync(path.resolve(resumePath), 'utf-8');
  }
  return cachedResume;
}

export interface ScoringResult {
  score: number;
  reasoning: string;
  shouldApply: boolean;
  keyMatches: string[];
  concerns: string[];
}

export async function scoreJobMatch(
  jobTitle: string,
  jobDescription: string,
  companyName: string
): Promise<ScoringResult> {
  const resume = getResume();
  const threshold = parseInt(process.env.MATCH_SCORE_THRESHOLD || '60', 10);

  // Warn if resume is still placeholder
  if (resume.includes('Placeholder resume') || resume.trim().length < 100) {
    console.warn('[scoring] WARNING: resume.txt appears to be placeholder or too short (' + resume.trim().length + ' chars). Scores will be inaccurate.');
  }

  // Warn if job description is empty
  if (!jobDescription || jobDescription.trim().length < 20) {
    console.warn('[scoring] WARNING: job description is empty or very short (' + (jobDescription?.trim().length || 0) + ' chars). Score may be inaccurate.');
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a STRICT job match scoring system for a remote software engineer based in Brazil (São Paulo, UTC-3).

CANDIDATE PROFILE:
- Based in Brazil, open to remote work worldwide
- NO university degree (self-taught engineer with 4+ years professional experience)
- Bilingual: Portuguese + English
- CANNOT relocate to the US or work on-site in the US/Europe
- Valid work authorization for remote work from Brazil

DEALBREAKER CHECK (MANDATORY):
1. LOCATION:
   - On-site/hybrid in US/Europe → MAX SCORE 15
   - Remote-only but "must be in US timezone" or "US candidates preferred" → MAX SCORE 35
   - Remote with no location restrictions → NO PENALTY

2. EDUCATION:
   - Degree "required" / "must have" → MAX SCORE 30
   - Degree "preferred" / "nice to have" → -15 points from final score
   - No degree mentioned → NO PENALTY

SKILLS SCORING (0-100 base):
- 0-20 pts: Role completely unrelated (e.g., Sales, HR, Design with no tech)
- 20-40 pts: Tangentially related but missing core skills
- 40-60 pts: Some overlapping skills but significant gaps in key requirements (e.g., needs specific framework not listed, needs specialty like ML/Data Science)
- 60-75 pts: Good match with 70-85% of job requirements covered, minor technology gaps
- 75-90 pts: Strong match with 85%+ of requirements, aligned with career progression
- 90-100 pts: Excellent match - 95%+ coverage, perfect role fit, rare find

CRITICAL: Score based on job DETAILS not just title:
- If description is too vague/generic (<200 chars), score can't exceed 70 (insufficient signal)
- Heavy penalties for conflicting needs (e.g., "we need ML expert BUT also full-stack generalist")
- Give credit for EXACT technology matches, not just "similar" tech

Return JSON with:
- score: number 0-100 (strictly enforced)
- reasoning: string (2-3 sentences explaining WHY this score, reference specific requirements)
- keyMatches: string[] (specific skills matched to job requirements)
- concerns: string[] (ALL gaps, dealbreakers, vague requirements)`,
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
