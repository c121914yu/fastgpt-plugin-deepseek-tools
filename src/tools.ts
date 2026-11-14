import { randomUUID } from 'node:crypto';
import { createToolHandler } from '@fastgpt-plugin/sdk-factory';
import { credentials, jsonResult, request, transportError } from './api';
import { downloadFile, readLimited } from './files';
import { inputSchema, outputSchema, secretSchema } from './schemas';
import { search } from './search';
import { asrInput, asrOutput, fetchInput, fetchOutput, ocrInput, ocrOutput, ocrResponse, ttsInput, ttsOutput } from './tool-schemas';

export const searchHandler = createToolHandler({
  inputSchema, outputSchema, secretSchema,
  handler: async (input, ctx) => search(input, ctx.secrets)
});
export const fetchHandler = createToolHandler({
  inputSchema: fetchInput, outputSchema: fetchOutput, secretSchema,
  handler: async (input, ctx) => {
    const params = fetchInput.parse(input);
    return jsonResult(await request('fetch', credentials(ctx.secrets), params, 30_000), fetchOutput, 'fetch');
  }
});
export const ocrHandler = createToolHandler({
  inputSchema: ocrInput, outputSchema: ocrOutput, secretSchema,
  handler: async (input, ctx) => {
    const params = ocrInput.parse(input);
    const apiKey = credentials(ctx.secrets);
    const file = await downloadFile(params.fileUrl, 100 * 1024 * 1024);
    const form = new FormData();
    form.set('purpose', params.purpose);
    form.set('file', new Blob([new Uint8Array(file)]), 'document');
    const result = await jsonResult(await request('ocr', apiKey, form, 190_000), ocrResponse, 'ocr');
    return { ...result, text: result.pages.map((page) => page.text).join('\n\n') };
  }
});
export const asrHandler = createToolHandler({
  inputSchema: asrInput, outputSchema: asrOutput, secretSchema,
  handler: async (input, ctx) => {
    const params = asrInput.parse(input);
    const apiKey = credentials(ctx.secrets);
    const file = await downloadFile(params.fileUrl, 8 * 1024 * 1024);
    const form = new FormData();
    form.set('file', new Blob([new Uint8Array(file)]), 'audio');
    return jsonResult(await request('asr', apiKey, form, 180_000), asrOutput, 'asr');
  }
});
export const ttsHandler = createToolHandler({
  inputSchema: ttsInput, outputSchema: ttsOutput, secretSchema,
  handler: async (input, ctx) => {
    const params = ttsInput.parse(input);
    const apiKey = credentials(ctx.secrets);
    const body = { text: params.text, voice_id: params.voiceId, format: params.format, filter_markdown: params.filterMarkdown };
    if (Buffer.byteLength(JSON.stringify(body)) > 64 * 1024) throw new Error('TTS request must not exceed 64 KiB.');
    const response = await request('tts', apiKey, body, 180_000);
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim();
    if (!contentType || !(params.format === 'wav'
      ? ['audio/wav', 'audio/x-wav'] : ['audio/pcm', 'audio/L16', 'application/octet-stream']).includes(contentType)) {
      await response.body?.cancel();
      throw new Error('DeepSeek tts returned an unexpected audio format.');
    }
    let audio: Buffer;
    try { audio = await readLimited(response, 87 * 1024 * 1024); }
    catch (error) { throw transportError('tts', error); }
    const fileName = `deepseek-${randomUUID()}.${params.format}`;
    const [result, err] = await ctx.invoke.uploadFile({
      file: audio, fileName, contentType: params.format === 'wav' ? 'audio/wav' : 'application/octet-stream'
    });
    if (err) throw err;
    if (!result?.accessURL) throw new Error('Unable to upload synthesized audio to FastGPT.');
    return ttsOutput.parse({ accessURL: result.accessURL, fileName, format: params.format, size: audio.length });
  }
});
