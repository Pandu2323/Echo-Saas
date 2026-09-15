import { groq } from "@/lib/groq";

export interface ScanFinding {
  severity:    "CRITICAL" | "WARNING" | "INFO";
  title:       string;
  description: string;
  filePath:    string;
  lineNumber:  number | null;
  cwe:         string | null;
  rule:        string | null;
  snippet:     string | null;
  diffBefore:  string | null;
  diffAfter:   string | null;
  fix:         string | null;
}

const SCANNER_SYSTEM = `You are SentraCode, an expert security code reviewer.
Analyze the provided code for security vulnerabilities.
Return ONLY a valid JSON object — no markdown, no explanation.

Focus on:
- SQL Injection (CWE-89)
- XSS (CWE-79)
- Hardcoded secrets/API keys (CWE-798)
- Insecure deserialization (CWE-502)
- Missing authentication/authorization (CWE-306)
- Path traversal (CWE-22)
- Command injection (CWE-78)
- Insecure dependencies
- Missing rate limiting
- Sensitive data exposure (CWE-200)`;

export async function scanFileForVulnerabilities(
  filePath: string,
  content: string
): Promise<ScanFinding[]> {
  // skip binary/non-code files
  const skipExts = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".ttf", ".eot", ".pdf", ".zip"];
  if (skipExts.some(e => filePath.endsWith(e))) return [];

  // cap file size to avoid token limit
  const truncated = content.slice(0, 6000);

  const prompt = `Analyze this code file for security vulnerabilities.

File: ${filePath}
\`\`\`
${truncated}
\`\`\`

Return a JSON object with this exact shape:
{
  "findings": [
    {
      "severity": "CRITICAL" | "WARNING" | "INFO",
      "title": "short title",
      "description": "detailed explanation",
      "lineNumber": number or null,
      "cwe": "CWE-XX" or null,
      "rule": "rule name" or null,
      "snippet": "the vulnerable code line(s)" or null,
      "diffBefore": "the vulnerable line(s) prefixed with -" or null,
      "diffAfter": "the fixed line(s) prefixed with +" or null,
      "fix": "explanation of how to fix"
    }
  ]
}

If no vulnerabilities found, return { "findings": [] }
Be precise — only flag real security issues, not style issues.`;

  try {
    const res = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: SCANNER_SYSTEM },
        { role: "user",   content: prompt },
      ],
      temperature: 0.1,
      max_tokens:  1500,
      response_format: { type: "json_object" },
    });

    const raw  = res.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    return (parsed.findings ?? []).map((f: ScanFinding & { filePath?: string }) => ({
      ...f,
      filePath,
    }));
  } catch (err) {
    console.error(`Scan error for ${filePath}:`, err);
    return [];
  }
}

export async function reviewPRDiff(
  diff: string,
  repoName: string,
  prTitle: string
): Promise<{
  verdict: "PASSED" | "CRITICAL_ISSUE" | "NEEDS_REVIEW";
  summary: string;
  findings: ScanFinding[];
}> {
  const truncatedDiff = diff.slice(0, 8000);

  const prompt = `Review this GitHub pull request diff for security issues.

Repository: ${repoName}
PR Title: ${prTitle}

Diff:
\`\`\`diff
${truncatedDiff}
\`\`\`

Return a JSON object:
{
  "verdict": "PASSED" | "CRITICAL_ISSUE" | "NEEDS_REVIEW",
  "summary": "2-3 sentence summary of security review",
  "findings": [
    {
      "severity": "CRITICAL" | "WARNING" | "INFO",
      "title": "short title",
      "description": "detailed explanation",
      "lineNumber": number or null,
      "cwe": "CWE-XX" or null,
      "rule": "rule name" or null,
      "snippet": "the vulnerable code" or null,
      "diffBefore": "vulnerable line with -" or null,
      "diffAfter": "fixed line with +" or null,
      "fix": "how to fix"
    }
  ]
}`;

  try {
    const res = await groq.chat.completions.create({
      model:    "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SCANNER_SYSTEM },
        { role: "user",   content: prompt },
      ],
      temperature: 0.1,
      max_tokens:  2000,
      response_format: { type: "json_object" },
    });

    const raw    = res.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    return {
      verdict:  parsed.verdict  ?? "NEEDS_REVIEW",
      summary:  parsed.summary  ?? "",
      findings: parsed.findings ?? [],
    };
  } catch {
    return { verdict: "NEEDS_REVIEW", summary: "Review failed.", findings: [] };
  }
}