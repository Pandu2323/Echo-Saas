interface CreateBranchOptions {
  owner:      string;
  repo:       string;
  branchName: string;
  baseBranch: string;
  token:      string;
}

interface CommitFileOptions {
  owner:      string;
  repo:       string;
  branch:     string;
  filePath:   string;
  content:    string;   // new file content (plain text)
  message:    string;
  token:      string;
}

interface CreatePROptions {
  owner:      string;
  repo:       string;
  title:      string;
  body:       string;
  head:       string;
  base:       string;
  token:      string;
}

async function ghFetch(
  url:     string,
  token:   string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      "Accept":               "application/vnd.github+json",
      "Authorization":        `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type":         "application/json",
      ...(options.headers ?? {}),
    },
  });
}

export async function getDefaultBranchSha(
  owner:  string,
  repo:   string,
  branch: string,
  token:  string
): Promise<string | null> {
  const res = await ghFetch(
    `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
    token
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.object?.sha ?? null;
}

export async function createBranch(opts: CreateBranchOptions): Promise<boolean> {
  const baseSha = await getDefaultBranchSha(opts.owner, opts.repo, opts.baseBranch, opts.token);
  if (!baseSha) return false;

  const res = await ghFetch(
    `https://api.github.com/repos/${opts.owner}/${opts.repo}/git/refs`,
    opts.token,
    {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${opts.branchName}`,
        sha: baseSha,
      }),
    }
  );

  return res.ok;
}

export async function getFileSha(
  owner:    string,
  repo:     string,
  filePath: string,
  branch:   string,
  token:    string
): Promise<string | null> {
  const res = await ghFetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
    token
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.sha ?? null;
}

export async function commitFile(opts: CommitFileOptions): Promise<boolean> {
  const fileSha = await getFileSha(
    opts.owner, opts.repo, opts.filePath, opts.branch, opts.token
  );

  const encoded = Buffer.from(opts.content, "utf-8").toString("base64");

  const body: Record<string, unknown> = {
    message: opts.message,
    content: encoded,
    branch:  opts.branch,
  };

  if (fileSha) body.sha = fileSha;

  const res = await ghFetch(
    `https://api.github.com/repos/${opts.owner}/${opts.repo}/contents/${opts.filePath}`,
    opts.token,
    { method: "PUT", body: JSON.stringify(body) }
  );

  return res.ok;
}

export async function createPullRequest(opts: CreatePROptions): Promise<{
  number: number;
  url:    string;
} | null> {
  const res = await ghFetch(
    `https://api.github.com/repos/${opts.owner}/${opts.repo}/pulls`,
    opts.token,
    {
      method: "POST",
      body: JSON.stringify({
        title: opts.title,
        body:  opts.body,
        head:  opts.head,
        base:  opts.base,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("Create PR failed:", err);
    return null;
  }

  const data = await res.json();
  return { number: data.number, url: data.html_url };
}