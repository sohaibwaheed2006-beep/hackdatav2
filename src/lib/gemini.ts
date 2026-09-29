const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GROK_API_KEY;
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";

const FALLBACK_MODELS = [
  DEFAULT_MODEL,
  "gemini-flash-lite-latest",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-3.7-flash",
];

interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function callGemini(
  messages: AIMessage[],
  temperature = 0.7,
  responseJson = false
): Promise<string> {
  if (!GEMINI_API_KEY || GEMINI_API_KEY.includes("placeholder")) {
    throw new Error("GEMINI_API_KEY is not set in environment variables");
  }

  const systemMessage = messages.find((m) => m.role === "system");
  const userAndAssistantMessages = messages.filter((m) => m.role !== "system");

  const contents = userAndAssistantMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const payload: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: 4096,
      ...(responseJson ? { responseMimeType: "application/json" } : {}),
    },
  };

  if (systemMessage) {
    payload.systemInstruction = {
      parts: [{ text: systemMessage.content }],
    };
  }

  const modelsToTry = Array.from(new Set(FALLBACK_MODELS));
  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Gemini API (${model}) error ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Try next model if available
      continue;
    }
  }

  throw lastError || new Error("Failed to generate content from Gemini");
}

export async function callGeminiJSON<T>(
  messages: AIMessage[],
  temperature = 0.3
): Promise<T> {
  const content = await callGemini(messages, temperature, true);
  const cleaned = content
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();

  return JSON.parse(cleaned) as T;
}

// Aliases for backward compatibility
export const callGrok = callGemini;
export const callGrokJSON = callGeminiJSON;
