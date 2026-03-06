import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), "data", "config.json");

export interface AppConfig {
  openaiApiKey: string;
  linkedinEmail: string;
  linkedinPassword: string;
  useAI: boolean;
  useScoreMatching: boolean;
  scoreThreshold: number;
  resume: string;
  profile: {
    firstName: string;
    lastName: string;
    phone: string;
    city: string;
    state: string;
    country: string;
    linkedinUrl: string;
    portfolioUrl: string;
    yearsOfExperience: string;
    currentSalary: string;
    desiredSalary: string;
    noticePeriodDays: string;
  };
  compliance: {
    requireVisa: string;
    usCitizenship: string;
    gender: string;
    ethnicity: string;
    disability: string;
    veteran: string;
  };
  freeText: {
    headline: string;
    summary: string;
    coverLetter: string;
  };
  customAnswers: Array<{ keywords: string[]; answer: string }>;
}

export function getDefaultConfig(): AppConfig {
  return {
    openaiApiKey: "",
    linkedinEmail: "",
    linkedinPassword: "",
    useAI: true,
    useScoreMatching: true,
    scoreThreshold: 60,
    resume: "",
    profile: {
      firstName: "",
      lastName: "",
      phone: "",
      city: "",
      state: "",
      country: "",
      linkedinUrl: "",
      portfolioUrl: "",
      yearsOfExperience: "",
      currentSalary: "",
      desiredSalary: "",
      noticePeriodDays: "",
    },
    compliance: {
      requireVisa: "No",
      usCitizenship: "Other",
      gender: "Decline",
      ethnicity: "Decline",
      disability: "Decline",
      veteran: "Decline",
    },
    freeText: { headline: "", summary: "", coverLetter: "" },
    customAnswers: [],
  };
}

export function loadConfig(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
      return deepMerge(getDefaultConfig(), raw);
    }
  } catch {
    /* corrupted file, return defaults */
  }
  return getDefaultConfig();
}

export function saveConfig(partial: Partial<AppConfig>): AppConfig {
  const current = loadConfig();
  const merged = deepMerge(current, partial);

  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));

  return merged;
}

export function maskApiKey(key: string): string {
  if (!key || key.length < 8) return key ? "****" : "";
  return key.slice(0, 5) + "..." + key.slice(-4);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = target[key];
    if (srcVal !== undefined && srcVal !== null) {
      if (
        typeof srcVal === "object" &&
        !Array.isArray(srcVal) &&
        typeof tgtVal === "object" &&
        !Array.isArray(tgtVal)
      ) {
        result[key] = deepMerge(tgtVal, srcVal);
      } else {
        result[key] = srcVal;
      }
    }
  }
  return result;
}
