export type RegexHit = { type: string; snippet: string };

type Rule = {
  type: string;
  priority: number; // Lower number = higher priority (runs first to claim overlaps)
  re: RegExp;
  prefilters?: string[]; // If provided, text MUST contain at least one of these strings (case-insensitive if regex is)
  validate?: (value: string) => boolean; // Reject captures that cannot be a real secret (code fragments, prose)
};

/**
 * A captured value is plausible as a secret when it is an opaque token: no code
 * punctuation, and at least one digit mixed with letters, or a long hex/base64 run.
 * Minified JS and markup routinely satisfy a bare `key=value` shape without this gate.
 */
function looksLikeSecretValue(value: string): boolean {
  if (/[(),;{}[\]!<>?'"|&$\\`\s]/.test(value)) return false;
  if (/^[0-9a-f]{32,}$/i.test(value)) return true;
  const hasDigit = /\d/.test(value);
  const hasLetter = /[A-Za-z]/.test(value);
  if (hasDigit && hasLetter && value.length >= 16) return true;
  if (/[+/=]/.test(value) && hasDigit) return true;
  return false;
}

/**
 * Card numbers satisfy the Luhn checksum. Without this gate the rule matches
 * arbitrary 13–16 digit constants, e.g. `4503599627370496` (2^52) in bundled JS.
 */
function passesLuhnCheck(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 13) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

// RULES are sorted alphabetically by 'type' for easy reading/maintenance.
const RULES: Rule[] = [
  {
    type: "aws-key",
    priority: 10,
    re: /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/g,
    prefilters: ["AKIA", "ASIA", "ABIA", "ACCA"],
  },
  {
    type: "azure-sas-token",
    priority: 20,
    re: /(?:sig|signature)=([a-zA-Z0-9%+/]{40,})/gi,
    prefilters: ["sig=", "signature="],
  },
  {
    type: "basic-auth-url",
    priority: 20,
    // Reject the `mailto:` scheme: `http://mailto:someone@host/` is a mailto link,
    // not a basic-auth credential.
    re: /https?:\/\/(?!mailto:)[^\s:@/]+:([^\s:@/]{3,})@[^\s:/?#]+/gi,
    prefilters: ["http://", "https://", "@"],
  },
  {
    type: "bearer-token",
    priority: 50,
    re: /[Bb]earer\s+([A-Za-z0-9_\-.~+/]{20,})\b/g,
    prefilters: ["bearer "],
  },
  {
    type: "combo-list-cred",
    priority: 15,
    // Menangkap format Stealer Logs: URL:Username:Password atau URL:Email:Password
    re: /(?:https?:\/\/[a-zA-Z0-9.-]+(?::\d{2,5})?(?:[/?#][^:\s]*)?):([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|[a-zA-Z0-9_-]{3,30}):([^:\s]{4,50})/gi,
    prefilters: ["http"],
  },
  {
    type: "credential-like",
    priority: 100, // Very generic, lowest priority
    // Value charset excludes code punctuation (but allows `@`, common in passwords);
    // the validate hook then requires an opaque-token shape. Without both, minified
    // JS yields ~99% false positives.
    re: /(?:password|passwd|pwd|secret|token|api[_-]?key)\s*[=:]\s*["']?([A-Za-z0-9+/=_\-@]{12,120})["']?/gi,
    validate: looksLikeSecretValue,
  },
  {
    type: "credit-card",
    priority: 60,
    re: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/g,
    validate: passesLuhnCheck,
  },
  {
    type: "db-connection",
    priority: 20,
    re: /(?:mysql|postgres(?:ql)?|mongodb(?:\+srv)?|redis|mssql):\/\/[^\s'"]{10,}/gi,
    prefilters: ["mysql://", "postgres://", "postgresql://", "mongodb://", "mongodb+srv://", "redis://", "mssql://"],
  },
  {
    type: "email",
    priority: 90,
    // A URL userinfo (`http://user@host/`) and a `mailto:` link are not email
    // addresses; the lookbehind rejects both without touching real addresses.
    re: /(?<![\w.%+\-/:])[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
    prefilters: ["@"],
  },
  {
    type: "gcp-service-account",
    priority: 10,
    re: /"type"\s*:\s*"service_account"\s*,\s*"project_id"/g,
    prefilters: ["service_account"],
  },
  {
    type: "github-token",
    priority: 10,
    re: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[a-zA-Z0-9_]{36,255}\b/g,
    prefilters: ["ghp_", "gho_", "ghu_", "ghs_", "ghr_", "github_pat_"],
  },
  {
    type: "gitlab-token",
    priority: 10,
    re: /\bglpat-[a-zA-Z0-9\-]{20}\b/g,
    prefilters: ["glpat-"],
  },
  {
    type: "google-api-key",
    priority: 10,
    re: /\bAIzaSy[A-Za-z0-9_-]{33}\b/g,
    prefilters: ["AIzaSy"],
  },
  {
    type: "hex-secret",
    priority: 90, // Generic, run after specifics
    // Snippet keeps the `key=` prefix (full match). Changing this would give existing
    // rows a new dedup identity and duplicate them on the next scan.
    re: /(?:key|secret|token|apikey|api_key|access_key|auth)\s*[=:]\s*[0-9a-f]{32,}/gi,
  },
  {
    type: "jwt-token",
    priority: 30,
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    prefilters: ["eyJ"],
  },
  {
    type: "openai-key",
    priority: 10,
    re: /\bsk-[a-zA-Z0-9]{48}\b/g,
    prefilters: ["sk-"],
  },
  {
    type: "private-key",
    priority: 10,
    re: /-----BEGIN [A-Z ]+PRIVATE KEY-----/g,
    prefilters: ["-----BEGIN "],
  },
  {
    type: "sendgrid-key",
    priority: 10,
    re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g,
    prefilters: ["SG."],
  },
  {
    type: "slack-bot-token",
    priority: 10,
    re: /\bxoxb-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9\-]*\b/g,
    prefilters: ["xoxb-"],
  },
  {
    type: "slack-user-token",
    priority: 10,
    re: /\bxoxp-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9\-]*\b/g,
    prefilters: ["xoxp-"],
  },
  {
    type: "slack-webhook",
    priority: 10,
    re: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]{8,}\/B[A-Z0-9]{8,}\/[A-Za-z0-9]{20,}/g,
    prefilters: ["hooks.slack.com/services/"],
  },
  {
    type: "stripe-key",
    priority: 10,
    re: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{20,99}\b/g,
    prefilters: ["_live_", "_test_"],
  },
  {
    type: "twilio-key",
    priority: 10,
    re: /\bSK[a-z0-9]{32}\b/g,
    prefilters: ["SK"],
  },
];

// Pre-sort rules by priority so we execute the most specific ones first
const EXECUTION_ORDER = [...RULES].sort((a, b) => a.priority - b.priority);

export function runSensitiveRegexScan(text: string): RegexHit[] {
  const hits: RegexHit[] = [];
  const textLower = text.toLowerCase(); // For case-insensitive prefiltering
  
  // Keep track of claimed character indices to prevent generic rules from double-reporting
  const claimedRanges: { start: number; end: number }[] = [];

  for (const r of EXECUTION_ORDER) {
    // 1. Keyword Pre-filtering (O(N) speedup mechanism like Aho-Corasick)
    if (r.prefilters && r.prefilters.length > 0) {
      // If none of the prefilters are present, skip this heavy regex entirely!
      const isCaseInsensitive = r.re.flags.includes("i");
      const targetText = isCaseInsensitive ? textLower : text;
      
      let matchedAnyPrefilter = false;
      for (const pf of r.prefilters) {
        const checkStr = isCaseInsensitive ? pf.toLowerCase() : pf;
        if (targetText.includes(checkStr)) {
          matchedAnyPrefilter = true;
          break;
        }
      }
      if (!matchedAnyPrefilter) continue;
    }

    // 2. Execute Regex
    r.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = r.re.exec(text)) !== null) {
      const matchStart = m.index;
      const matchEnd = m.index + m[0].length;

      // 3. Overlap Protection
      // Check if this new match overlaps with an existing higher-priority match
      const isOverlap = claimedRanges.some(
        (range) => matchStart < range.end && matchEnd > range.start
      );

      if (!isOverlap) {
        const value = m[1] !== undefined ? m[1] : m[0];
        if (r.validate && !r.validate(value)) continue;

        claimedRanges.push({ start: matchStart, end: matchEnd });

        // Use capture group 1 if present (e.g. for credential-like where we don't want the "key=" prefix)
        // Otherwise use the full match.
        const snippet = value.slice(0, 240);
        hits.push({ type: r.type, snippet });
      }
    }
  }

  return hits;
}
