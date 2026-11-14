import type z from 'zod';
import { secretSchema } from './schemas';

const MESSAGES: Record<number, string> = {
  400: 'Invalid request. Check the input and supported file formats.',
  401: 'Authentication failed. Check your DeepSeek API Key.',
  402: 'Insufficient balance. Top up your DeepSeek account.',
  403: 'The request was refused by the service safety policy.',
  404: 'No usable content was found.',
  408: 'The request timed out. Please try again later.',
  413: 'The request is too large.',
  429: 'Rate limit exceeded. Please wait before trying again.'
};

export function credentials(secrets: unknown): string {
  return secretSchema.parse(secrets ?? {}).apiKey;
}

class ApiError extends Error {}

export function transportError(endpoint: string, error: unknown): Error {
  if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) {
    return new Error(`DeepSeek ${endpoint} request timed out. Please try again later.`);
  }
  return new Error(`Unable to read the DeepSeek ${endpoint} response. Please try again later.`);
}

export async function request(
  endpoint: 'fetch' | 'ocr' | 'asr' | 'tts', apiKey: string,
  body: FormData | Record<string, unknown>, timeoutMs: number
): Promise<Response> {
  try {
    const response = await fetch(`https://api.deepseek.com/v1/tools/${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' })
      },
      body: body instanceof FormData ? body : JSON.stringify(body),
      redirect: 'error', signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ApiError(`DeepSeek ${endpoint} (HTTP ${response.status}): ${
        MESSAGES[response.status] ?? 'The service could not complete the request. Please try again later.'
      }`);
    }
    return response;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw transportError(endpoint, error);
  }
}

export async function jsonResult<T extends z.ZodType>(
  response: Response, schema: T, endpoint: string
): Promise<z.output<T>> {
  let data: unknown;
  try { data = await response.json(); }
  catch (error) { throw transportError(endpoint, error); }
  // OCR may fail after sending HTTP 200 and keep-alive whitespace.
  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error(`DeepSeek ${endpoint} could not complete the request. Please check the input or try again later.`);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error(`DeepSeek ${endpoint} returned an unexpected response format.`);
  return parsed.data;
}
