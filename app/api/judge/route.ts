import { GoogleGenAI } from "@google/genai";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import { NextResponse } from "next/server";
import { markJudgeFailure, markJudgeSuccess } from "../../../lib/judgeState";

type JudgeVerdict = {
  status: "ok" | "error";
  verdict: "pass" | "fail";
  explanation: string;
  confidence: number;
  score?: number;
};

type JudgePayload = {
  emoji: string;
  description?: string;
  image: string;
  roundId?: string;
};

type ParsedPayload =
  | { ok: true; payload: JudgePayload }
  | { ok: false; error: string };

const PASS_SCORE_THRESHOLD = resolvePassScoreThreshold();
const GEMINI_TIMEOUT_MS = resolveGeminiTimeout();
const GEMINI_MAX_RETRIES = resolveGeminiRetryCount();
const GEMINI_MODEL_NAME = process.env.GEMINI_MODEL ?? "gemini-2.0-flash-lite";
const GEMINI_MODEL_ENDPOINT = process.env.GEMINI_MODEL_ENDPOINT;

configureGlobalProxy();

export async function POST(req: Request) {
  const parsed = await parseIncomingPayload(req);

  if (!parsed.ok) {
    markJudgeFailure();
    return NextResponse.json(
      {
        status: "error",
        verdict: "fail",
        explanation: parsed.error,
        confidence: 0,
        score: 0,
      },
      { status: 200 },
    );
  }

  const payload = parsed.payload;

  try {
    const result = await callExternalJudge(payload);

    if (result.status === "ok" && result.verdict === "pass") {
      markJudgeSuccess();
    } else {
      markJudgeFailure();
    }

    console.info(
      "[judge] round=%s emoji=%s verdict=%s confidence=%s",
      payload.roundId ?? "n/a",
      payload.emoji,
      result.verdict,
      result.confidence.toFixed(2),
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    markJudgeFailure();

    const explanation =
      error instanceof Error
        ? `Gemini judge unavailable: ${error.message}`
        : "Gemini judge unavailable. Please try again shortly.";

    return NextResponse.json(
      {
        status: "error",
        verdict: "fail",
        explanation,
        confidence: 0,
        score: 0,
      },
      { status: 200 },
    );
  }
}

async function parseIncomingPayload(req: Request): Promise<ParsedPayload> {
  const contentType = req.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      const body = (await req.json()) as Record<string, unknown>;
      return normalisePayload(body);
    }

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const emoji = formData.get("emoji");
      const description = formData.get("description");
      const image = formData.get("image");
      const roundId = formData.get("roundId");

      let dataUrl: string | null = null;
      if (typeof image === "string") {
        dataUrl = image;
      } else if (image instanceof File) {
        dataUrl = await readFileAsDataUrl(image);
      }

      return normalisePayload({ emoji, description, image: dataUrl, roundId });
    }

    return { ok: false, error: "Unsupported content type. Use JSON or multipart form data." };
  } catch (error) {
    console.error("[judge] Failed to parse payload", error);
    return { ok: false, error: "Invalid request payload." };
  }
}

function normalisePayload(data: Record<string, unknown>): ParsedPayload {
  const emoji = typeof data.emoji === "string" ? data.emoji : "";
  const description = typeof data.description === "string" ? data.description : undefined;
  const roundId = typeof data.roundId === "string" ? data.roundId : undefined;
  const image = typeof data.image === "string" ? data.image : null;

  if (!emoji) {
    return { ok: false, error: "`emoji` is required." };
  }

  if (!image) {
    return { ok: false, error: "`image` is required." };
  }

  return {
    ok: true,
    payload: {
      emoji,
      description,
      image,
      roundId,
    },
  };
}

async function readFileAsDataUrl(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function callExternalJudge(payload: JudgePayload): Promise<JudgeVerdict> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  return callGeminiJudge(payload, apiKey);
}

async function callGeminiJudge(payload: JudgePayload, apiKey: string): Promise<JudgeVerdict> {
  const { data, mimeType } = extractImageData(payload.image);
  const approxBytes = Math.floor((data.length * 3) / 4);
  const overallStart = Date.now();
  const baseLog = {
    roundId: payload.roundId ?? "n/a",
    emoji: payload.emoji,
    mimeType,
    bytes: approxBytes,
    threshold: PASS_SCORE_THRESHOLD,
  } as const;
const prompt = buildGeminiPrompt(payload);

  const client = getGeminiClient(apiKey);

  for (let attempt = 1; attempt <= GEMINI_MAX_RETRIES; attempt += 1) {
    const attemptStart = Date.now();
    console.info("[judge] Gemini request start", {
      ...baseLog,
      attempt,
      maxAttempts: GEMINI_MAX_RETRIES,
    });

    try {
      const generation = await runWithTimeout(() =>
        client.models.generateContent({
          model: GEMINI_MODEL_NAME,
          config: {
            temperature: 0.2,
            topP: 0.1,
            maxOutputTokens: 256,
            responseMimeType: "application/json",
          },
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType,
                    data,
                  },
                },
              ],
            },
          ],
        }),
      );

      console.info("[judge] Gemini responded", {
        ...baseLog,
        attempt,
        durationMs: Date.now() - attemptStart,
        totalDurationMs: Date.now() - overallStart,
      });

      const rawText = await extractTextFromGeminiResult(generation);

      const parsed = interpretGeminiResponse(rawText);

      const score = clampScore(parsed.score ?? 0);
      const explanationText = parsed.explanation?.slice(0, 120) || buildFallbackExplanation(rawText);
      const verdict = score >= PASS_SCORE_THRESHOLD ? "pass" : "fail";

      console.info("[judge] Gemini result", {
        ...baseLog,
        attempt,
        score,
        verdict,
        durationMs: Date.now() - attemptStart,
        totalDurationMs: Date.now() - overallStart,
      });

      return {
        status: "ok",
        verdict,
        explanation: explanationText,
        confidence: score,
        score,
      };
    } catch (error) {
      const attemptDuration = Date.now() - attemptStart;

      if (error instanceof Error && error.name === "AbortError") {
        console.warn("[judge] Gemini request timed out", {
          ...baseLog,
          attempt,
          durationMs: attemptDuration,
          totalDurationMs: Date.now() - overallStart,
        });

        if (attempt >= GEMINI_MAX_RETRIES) {
          throw error;
        }
      } else {
        console.error("[judge] Gemini judge failed", {
          ...baseLog,
          attempt,
          durationMs: attemptDuration,
          totalDurationMs: Date.now() - overallStart,
          error,
        });

        if (attempt >= GEMINI_MAX_RETRIES) {
          throw error instanceof Error ? error : new Error("Gemini judge failed");
        }
      }

      const backoffMs = 500 * attempt;
      console.info("[judge] Gemini retry scheduled", {
        ...baseLog,
        attempt,
        nextAttemptInMs: backoffMs,
      });
      await sleep(backoffMs);
    }
  }

  throw new Error("Gemini judge failed after retries");
}

function buildGeminiPrompt(payload: JudgePayload): string {
  return `You judge whether a webcam snapshot matches the emoji ${payload.emoji}.
Emoji description: ${payload.description ?? "(none provided)"}.
Return strict JSON array with a single element like [{"score": number between 0 and 1 with two decimals, "explanation": under 20 words describing match quality}].
Do not include backticks or prose. A higher score means closer resemblance.`;
}


type GeminiClientStore = {
  client?: GoogleGenAI;
};

const globalGeminiClient = globalThis as unknown as {
  __emojifyGemini?: GeminiClientStore;
};

function getGeminiClient(apiKey: string): GoogleGenAI {
  if (!globalGeminiClient.__emojifyGemini) {
    globalGeminiClient.__emojifyGemini = {};
  }

  if (!globalGeminiClient.__emojifyGemini.client) {
    globalGeminiClient.__emojifyGemini.client = new GoogleGenAI({
      apiKey,
      ...(GEMINI_MODEL_ENDPOINT ? { apiEndpoint: GEMINI_MODEL_ENDPOINT } : {}),
    });
  }

  return globalGeminiClient.__emojifyGemini.client as GoogleGenAI;
}

function configureGlobalProxy() {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;

  if (!proxyUrl) {
    return;
  }

  try {
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
    console.info("[judge] Using proxy for Gemini requests", { proxyUrl });
  } catch (error) {
    console.warn("[judge] Failed to configure proxy agent", error);
  }
}

type GeminiJson = {
  score?: number;
  explanation?: string;
};

function interpretGeminiResponse(text: string): GeminiJson {
  const trimmed = text.trim();
  if (!trimmed) {
    return {};
  }

  try {
    const parsed = JSON.parse(trimmed) as GeminiJson | GeminiJson[];
    if (Array.isArray(parsed)) {
      const first = parsed[0];
      if (first && typeof first === "object") {
        return first;
      }
      return {};
    }
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (error) {
    console.error("[judge] Unable to parse Gemini JSON", { text, error });
  }

  const scoreMatch = /"score"\s*:\s*([-+]?[0-9]*\.?[0-9]+)/i.exec(trimmed);
  const explanationMatch = /"explanation"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i.exec(trimmed);

  return {
    score: scoreMatch ? Number.parseFloat(scoreMatch[1]) : undefined,
    explanation: explanationMatch ? JSON.parse(`"${explanationMatch[1]}"`) : undefined,
  };
}

function buildFallbackExplanation(rawText: string): string {
  if (rawText) {
    const trimmed = rawText.trim();
    if (trimmed.length > 0) {
      return trimmed.slice(0, 120);
    }
  }
  return "Judge responded.";
}

function extractImageData(dataUrl: string): { data: string; mimeType: string } {
  const match = /^data:(?<mime>[^;]+);base64,(?<data>[A-Za-z0-9+/=]+)$/.exec(dataUrl);

  if (match?.groups?.data && match.groups.mime) {
    return {
      data: match.groups.data,
      mimeType: match.groups.mime,
    };
  }

  return {
    data: dataUrl,
    mimeType: "image/png",
  };
}

function clampScore(score: number): number {
  if (Number.isNaN(score)) {
    return 0;
  }
  return Math.min(Math.max(score, 0), 1);
}

async function extractTextFromGeminiResult(result: unknown): Promise<string> {
  const candidateResponse = (result as { response?: GeminiGenerateResponse }).response;
  const body: GeminiGenerateResponse | undefined = candidateResponse ?? (result as GeminiGenerateResponse);

  if (!body) {
    return "";
  }

  const textFn = body.text;
  if (typeof textFn === "function") {
    const value = textFn.call(body);
    return typeof value === "string" ? value : await Promise.resolve(value);
  }

  if (body.candidates?.length) {
    return (
      body.candidates
        .flatMap((candidate) => candidate.content?.parts ?? [])
        .map((part) => part.text ?? "")
        .filter(Boolean)
        .join("") ?? ""
    );
  }

  return "";
}

function resolvePassScoreThreshold(): number {
  const rawValue = process.env.JUDGE_MIN_SCORE;
  if (!rawValue) {
    return 0.8;
  }

  const parsed = Number.parseFloat(rawValue);

  if (Number.isNaN(parsed)) {
    return 0.8;
  }

  return Math.min(Math.max(parsed, 0), 1);
}

function resolveGeminiTimeout(): number {
  const rawValue = process.env.JUDGE_TIMEOUT_MS;
  if (!rawValue) {
    return 12_000;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (Number.isNaN(parsed)) {
    return 12_000;
  }

  return Math.min(Math.max(parsed, 3_000), 30_000);
}

function resolveGeminiRetryCount(): number {
  const rawValue = process.env.JUDGE_MAX_RETRIES;
  if (!rawValue) {
    return 2;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (Number.isNaN(parsed)) {
    return 2;
  }

  return Math.min(Math.max(parsed, 1), 5);
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function runWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const timeoutError = new Error("Timed out waiting for Gemini response");
      timeoutError.name = "AbortError";
      reject(timeoutError);
    }, GEMINI_TIMEOUT_MS);

    operation()
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

type GeminiContentPart = {
  text?: string;
};

type GeminiCandidate = {
  content?: {
    parts?: GeminiContentPart[];
  };
};

type GeminiGenerateResponse = {
  candidates?: GeminiCandidate[];
  text?: () => string | Promise<string>;
};
