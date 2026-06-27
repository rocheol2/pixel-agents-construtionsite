/** Chat Completions API에 보낼 메시지 하나. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** chatCompletion() 호출에 필요한 입력. */
export interface OpenRouterChatOptions {
  model: string;
  apiKey: string;
  baseUrl: string;
  messages: ChatMessage[];
}

/** OpenRouter(OpenAI Compatible) 응답에서 우리가 실제로 쓰는 부분만. */
interface OpenRouterChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry-After 헤더(초 단위 문자열)를 ms로 변환한다. 없거나 숫자가 아니면 undefined. */
function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
}

/**
 * OpenRouter Chat Completions를 호출해 모델의 응답 텍스트를 반환한다.
 * - 429(rate limit): Retry-After 헤더 또는 지수 백오프로 MAX_RETRIES까지 재시도.
 * - 5xx/네트워크 오류/타임아웃: 지수 백오프로 MAX_RETRIES까지 재시도.
 * - 그 외 4xx(예: 401 잘못된 키): 재시도해도 성공할 수 없으므로 즉시 throw.
 */
export async function chatCompletion(options: OpenRouterChatOptions): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(`${options.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({ model: options.model, messages: options.messages }),
        signal: controller.signal,
      });

      if (res.status === 429) {
        const backoffMs = parseRetryAfterMs(res.headers.get('retry-after')) ?? BASE_BACKOFF_MS * 2 ** attempt;
        console.warn(`[OpenRouter] 429 rate limited - retry in ${backoffMs}ms (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
        await sleep(backoffMs);
        continue;
      }

      if (res.status >= 500) {
        throw new Error(`OpenRouter HTTP ${res.status} (server error)`);
      }

      if (!res.ok) {
        // 4xx (401/400 등): 재시도해도 동일하게 실패하므로 즉시 중단.
        throw Object.assign(new Error(`OpenRouter HTTP ${res.status}: ${await res.text()}`), {
          nonRetryable: true,
        });
      }

      const data = (await res.json()) as OpenRouterChatResponse;
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error('OpenRouter 응답에 choices[0].message.content가 없습니다');
      }
      return content;
    } catch (err) {
      if (err instanceof Error && (err as Error & { nonRetryable?: boolean }).nonRetryable) {
        throw err;
      }
      lastError = err;
      if (attempt < MAX_RETRIES) {
        const backoffMs = BASE_BACKOFF_MS * 2 ** attempt;
        console.warn(
          `[OpenRouter] request failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${err instanceof Error ? err.message : String(err)} - retry in ${backoffMs}ms`,
        );
        await sleep(backoffMs);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(
    `OpenRouter request failed after ${MAX_RETRIES + 1} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
