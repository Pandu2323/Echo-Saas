import { auth } from "@clerk/nextjs/server";
import { groq } from "@/lib/groq";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { NextResponse } from "next/server";
import { requireWorkspacePermission } from "@/lib/workspace-auth";

const CHROMA_URL = process.env.CHROMA_SERVICE_URL!;

const SYSTEM_PROMPT = `You are echo-nemo-1.0, an AI assistant built by Echo.

You answer questions ONLY using the provided context chunks from the user's documents.

Rules:
- Answer directly and concisely
- If the answer is in the context, give it with confidence
- If the context doesn't contain enough information, say: "I don't have enough information in your documents to answer that."
- Never make up information not present in the context
- Cite sources using [Source: filename] format
- Keep answers focused — 2-5 sentences unless detail is clearly needed`;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { question, history = [], preferredProvider } = await req.json();

  if (!question?.trim()) {
    return NextResponse.json({ error: "Question required" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { clerkId: userId } });

  // 1. get chunk score boosts from feedback history
  const boostSources: { source: string; score: number }[] = [];
  if (user) {
    const scores = await db.chunkScore.findMany({
      where: { userId: user.id, score: { gt: 0 } },
      orderBy: { score: "desc" },
      take: 20,
    });
    boostSources.push(
      ...scores.map((s) => ({ source: s.sourceDoc, score: s.score })),
    );
  }

  // 2. expand query using conversation history
  let expandedQuestion = question;
  try {
    if (history.length > 0) {
      const expandRes = await fetch(`${CHROMA_URL}/expand-query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
      });
      if (expandRes.ok) {
        const expanded = await expandRes.json();
        expandedQuestion = expanded.expanded_question ?? question;
      }
    }
  } catch {
    // expansion is non-fatal — use original question
  }

  // 3. retrieve with adaptive scoring
  // with workspace-scoped namespace:
  const workspaceId = req.headers.get("x-workspace-id");
  const ragNamespace = workspaceId ?? userId;

  if (workspaceId) {
    const result = await requireWorkspacePermission(
      workspaceId,
      "QUERY_KNOWLEDGE",
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }
  }

  // then use ragNamespace everywhere userId was used in the Chroma calls
  let retrievalRes: Response;
  try {
    retrievalRes = await fetch(`${CHROMA_URL}/query/scored`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: ragNamespace, // workspace-scoped
        question: expandedQuestion,
        top_k: 8,
        boost_sources: boostSources,
      }),
    });
  } catch {
    // fetch itself threw — service is unreachable, likely cold-starting on Render
    return NextResponse.json(
      {
        error: "rag_unavailable",
        reason: "The RAG service is cold-starting on Render. Wait 15 seconds and try again.",
        retryAfter: 15,
      },
      { status: 503 },
    );
  }

  if (!retrievalRes.ok) {
    const isTimeout = retrievalRes.status === 504;
    return NextResponse.json(
      {
        error: "rag_unavailable",
        reason: isTimeout
          ? "The RAG service timed out — it may be cold-starting. Try again in 15 seconds."
          : "The RAG service is temporarily unavailable.",
        retryAfter: 15,
      },
      { status: 503 },
    );
  }

  const retrieval = await retrievalRes.json();

  if (!retrieval.has_context) {
    return NextResponse.json({
      answer:
        "Your knowledge base is empty. Upload documents, paste a URL, or add your Echo video transcripts to get started.",
      sources: [],
      context_used: false,
      model_used: "echo-nemo-1.0",
      chunk_ids: [],
    });
  }

  const contextBlock = retrieval.chunks
    .map((chunk: string, i: number) => `[Chunk ${i + 1}]:\n${chunk}`)
    .join("\n\n---\n\n");

  const userMessage = `Context from your documents:\n\n${contextBlock}\n\n---\n\nQuestion: ${question}`;

  // 4. pick model — connected agent or echo-nemo-1.0
  // Only look up a BYOK agent when the client explicitly selected one.
  // Previously, when preferredProvider was empty/undefined, the `where`
  // clause below dropped the provider filter and matched *any* active
  // key — meaning selecting "echo-nemo-1.0" in the UI silently kept using
  // whatever BYOK agent was connected instead of the default model.
  let agentKey = null;
  if (user && preferredProvider && preferredProvider !== "default") {
    agentKey = await db.agentKey.findFirst({
      where: {
        userId: user.id,
        isActive: true,
        provider: preferredProvider,
      },
    });
  }

  let answer = "";
  let modelUsed = "echo-nemo-1.0 (Groq Llama 3.3 70B)";

  const messages = [
    ...history.slice(-6).map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: userMessage },
  ];

  if (agentKey) {
    try {
      const decrypted = decrypt(agentKey.keyHash);
      const result = await callAgentModel(
        agentKey.provider,
        agentKey.model,
        decrypted,
        SYSTEM_PROMPT,
        history,
        userMessage,
      );
      answer = result.answer;
      modelUsed = `${agentKey.provider} / ${result.modelUsed}`;
    } catch (err) {
      console.error(`BYOK agent error (${agentKey.provider}):`, err);
      if (err instanceof TransientProviderError) {
        return NextResponse.json(
          {
            error: "agent_unavailable",
            reason: `${agentKey.provider} (${agentKey.model}) is temporarily overloaded on their end. Try again in a few seconds.`,
            retryAfter: 5,
          },
          { status: 503 },
        );
      }
      return NextResponse.json(
        {
          error: "agent_call_failed",
          reason: `Failed to get a response from ${agentKey.provider} (${agentKey.model}): ${(err as Error).message}`,
        },
        { status: 502 },
      );
    }
  } else {
    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      temperature: 0.1,
      max_tokens: 800,
    });
    answer = completion.choices[0]?.message?.content ?? "No response.";
  }

  return NextResponse.json({
    answer,
    sources: retrieval.sources,
    context_used: true,
    chunks_retrieved: retrieval.chunks.length,
    chunk_ids: retrieval.chunk_ids ?? [],
    model_used: modelUsed,
  });
}

// Google periodically shuts down old Gemini model IDs. Rather than making
// every user with a stale saved connection hit a 404 until they manually
// reconnect, remap known-retired IDs to their current replacement here.
// Keep this list updated as Google deprecates models.
const GEMINI_MODEL_REMAP: Record<string, string> = {
  "gemini-2.0-flash": "gemini-3.6-flash",
  "gemini-2.0-flash-lite": "gemini-3.5-flash-lite",
  "gemini-1.5-pro": "gemini-3.5-flash",
  "gemini-1.5-flash": "gemini-3.5-flash",
  "gemini-1.5-flash-8b": "gemini-3.5-flash-lite",
  "gemini-pro": "gemini-3.5-flash",
};

function resolveGeminiModel(model: string): string {
  const replacement = GEMINI_MODEL_REMAP[model];
  if (replacement) {
    console.warn(
      `Gemini model "${model}" is deprecated — using "${replacement}" instead. Reconnect the agent to update the stored model.`,
    );
    return replacement;
  }
  return model;
}

// Thrown when a provider call fails for a reason that's likely to resolve on
// its own shortly (rate limiting, momentary overload). The route surfaces
// this differently from a hard failure so the client can offer a retry
// instead of treating it as broken.
class TransientProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransientProviderError";
  }
}

function isTransientStatus(status: number): boolean {
  return status === 429 || status === 503 || (status >= 500 && status < 600);
}

// Fetch with a couple of short retries for transient upstream errors.
// Non-transient errors (401, 403, 404, 400, etc.) are returned immediately
// so the caller can fail fast with the real reason.
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 2,
  baseDelayMs = 700,
): Promise<Response> {
  let lastRes: Response | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, options);
    if (res.ok || !isTransientStatus(res.status)) {
      return res;
    }
    lastRes = res;
    if (attempt < retries) {
      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return lastRes!;
}

async function callAgentModel(
  provider: string,
  model: string,
  apiKey: string,
  systemPrompt: string,
  history: Array<{ role: string; content: string }>,
  userMessage: string,
): Promise<{ answer: string; modelUsed: string }> {
  const messages = [
    ...history.slice(-6).map((h) => ({
      role: h.role as "user" | "assistant",
      content: h.content,
    })),
    { role: "user" as const, content: userMessage },
  ];

  if (provider === "openai") {
    const res = await fetchWithRetry("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        temperature: 0.1,
        max_tokens: 800,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("OpenAI API error:", err);
      const message = `OpenAI API error: ${res.status} ${err}`;
      if (isTransientStatus(res.status)) throw new TransientProviderError(message);
      throw new Error(message);
    }
    const data = await res.json();
    return { answer: data.choices?.[0]?.message?.content ?? "No response.", modelUsed: model };
  }

  if (provider === "claude") {
    const res = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        system: systemPrompt,
        messages,
        max_tokens: 800,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("Claude API error:", err);
      const message = `Claude API error: ${res.status} ${err}`;
      if (isTransientStatus(res.status)) throw new TransientProviderError(message);
      throw new Error(message);
    }
    const data = await res.json();
    return { answer: data.content?.[0]?.text ?? "No response.", modelUsed: model };
  }

  if (provider === "gemini") {
    const resolvedModel = resolveGeminiModel(model);
    const res = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: messages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
          generationConfig: {
            maxOutputTokens: 800,
            temperature: 0.1,
          },
        }),
      },
    );
    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini API error:", err);
      const message = `Gemini API error: ${res.status} ${err}`;
      if (isTransientStatus(res.status)) throw new TransientProviderError(message);
      throw new Error(message);
    }
    const data = await res.json();
    const candidate = data.candidates?.[0];
    // Gemini can return a candidate with no text (e.g. finishReason: "SAFETY"
    // or "MAX_TOKENS") — surface that instead of a silent generic fallback.
    const text = candidate?.content?.parts?.[0]?.text;
    if (!text) {
      const finishReason = candidate?.finishReason ?? "unknown";
      throw new Error(`Gemini returned no content (finishReason: ${finishReason})`);
    }
    return { answer: text, modelUsed: resolvedModel };
  }

  if (provider === "mistral") {
    const res = await fetchWithRetry("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        temperature: 0.1,
        max_tokens: 800,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("Mistral API error:", err);
      const message = `Mistral API error: ${res.status} ${err}`;
      if (isTransientStatus(res.status)) throw new TransientProviderError(message);
      throw new Error(message);
    }
    const data = await res.json();
    return { answer: data.choices?.[0]?.message?.content ?? "No response.", modelUsed: model };
  }

  throw new Error(`Unsupported provider: ${provider}`);
}