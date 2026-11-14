import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import plugin from './index';
import { downloadFile } from './src/files';
import { billingCharacters } from './src/tool-schemas';

vi.mock('./src/files', async (original) => ({
  ...await original<typeof import('./src/files')>(), downloadFile: vi.fn()
}));
const api = vi.fn<typeof fetch>();
const uploadFile = vi.fn();
const key = 'test-secret';
function run(child: string, input: unknown, secrets: unknown = { apiKey: key }) {
  return plugin.getToolHandler(child)!.handler(input as never, {
    secrets, invoke: { uploadFile } as never, systemVar: {}, streamResponse: vi.fn()
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', api);
  vi.mocked(downloadFile).mockResolvedValue(Buffer.from('file content'));
  uploadFile.mockResolvedValue([{ accessURL: 'https://files.example.com/speech.wav' }, null]);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('exposes five tools, shared credentials, upload permission, without a legacy root handler', async () => {
  expect(plugin.getChildManifests().map((tool) => tool.id)).toEqual(['search', 'fetch', 'ocr', 'asr', 'tts']);
  expect(plugin.getUserToolManifest()).toMatchObject({ pluginId: 'deepSeekTools', version: '1.0.0', permission: ['file-upload:allow'] });
  expect(plugin.getToolHandler()).toBeUndefined();
  expect(plugin.getSecretSchema().toJSONSchema().properties?.apiKey).toMatchObject({ isSecret: true });
  api.mockResolvedValue(Response.json({ results: [] }));
  await expect(run('search', { query: 'DeepSeek' })).resolves.toEqual({ results: [] });
});

describe('Fetch', () => {
  it('returns page title and Markdown from the official endpoint', async () => {
    api.mockResolvedValue(Response.json({ title: 'Page', content: '# Hello' }));
    await expect(run('fetch', { url: 'https://example.com' })).resolves.toEqual({ title: 'Page', content: '# Hello' });
    expect(api).toHaveBeenCalledWith('https://api.deepseek.com/v1/tools/fetch', expect.objectContaining({
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' }), redirect: 'error'
    }));
  });
  it.each(['ftp://example.com', 'https://user:pass@example.com', 'bad', 'https://example.com/' + 'a'.repeat(8192)])('rejects invalid URLs %s', async (url) => {
    await expect(run('fetch', { url })).rejects.toThrow(); expect(api).not.toHaveBeenCalled();
  });
});

describe('OCR and ASR', () => {
  const pages = [{ index: 0, text: '<｜ref｜>Hello', finish_reason: 'stop' }, { index: 1, text: 'World', finish_reason: 'length' }];
  it('uploads multipart OCR with purpose, preserves page markers/truncation and combines text', async () => {
    api.mockResolvedValue(new Response('\n\n' + JSON.stringify({ id: 'ocr-1', purpose: 'rich_layout_recognition', page_count: 2, pages })));
    await expect(run('ocr', { fileUrl: 'https://files.example.com/a.pdf', purpose: 'rich_layout_recognition' })).resolves.toEqual({
      id: 'ocr-1', purpose: 'rich_layout_recognition', page_count: 2, pages, text: '<｜ref｜>Hello\n\nWorld'
    });
    expect(downloadFile).toHaveBeenCalledWith('https://files.example.com/a.pdf', 100 * 1024 * 1024);
    const [endpoint, options] = api.mock.calls[0]!;
    expect(endpoint).toBe('https://api.deepseek.com/v1/tools/ocr');
    expect(options!.headers).toEqual({ Authorization: `Bearer ${key}` });
    const form = options!.body as FormData;
    expect(form.get('purpose')).toBe('rich_layout_recognition');
    expect(await (form.get('file') as File).text()).toBe('file content');
  });
  it('uses default OCR mode and handles errors returned with HTTP 200 without exposing upstream data', async () => {
    api.mockResolvedValue(Response.json({ error: { message: key } }));
    const error = await run('ocr', { fileUrl: 'https://example.com/a.pdf' }).catch((error: Error) => error);
    expect(error.message).toContain('could not complete'); expect(error.message).not.toContain(key);
    expect((api.mock.calls[0]![1]!.body as FormData).get('purpose')).toBe('text_recognition');
    expect(api).toHaveBeenCalledTimes(1);
  });
  it('rejects inconsistent OCR page counts', async () => {
    api.mockResolvedValue(Response.json({ id: 'ocr-1', purpose: 'text_recognition', page_count: 1, pages }));
    await expect(run('ocr', { fileUrl: 'https://example.com/a.pdf' })).rejects.toThrow('unexpected response');
  });
  it('transcribes audio with only a file part and retains duration', async () => {
    api.mockResolvedValue(Response.json({ request_id: 'asr-1', text: '你好', duration_ms: 3200 }));
    await expect(run('asr', { fileUrl: 'https://example.com/a.wav' })).resolves.toEqual({ request_id: 'asr-1', text: '你好', duration_ms: 3200 });
    expect(downloadFile).toHaveBeenCalledWith('https://example.com/a.wav', 8 * 1024 * 1024);
    expect(api.mock.calls[0]![0]).toBe('https://api.deepseek.com/v1/tools/asr');
    expect(Array.from((api.mock.calls[0]![1]!.body as FormData).keys())).toEqual(['file']);
  });
  it('never downloads files when credentials are absent', async () => {
    await expect(run('ocr', { fileUrl: 'https://example.com/a.pdf' }, {})).rejects.toThrow();
    expect(downloadFile).not.toHaveBeenCalled(); expect(api).not.toHaveBeenCalled();
  });
});

describe('TTS', () => {
  it.each(['wav', 'pcm'])('maps options and uploads binary %s to the host', async (format) => {
    api.mockResolvedValue(new Response('audio bytes', { headers: { 'content-type': format === 'wav' ? 'audio/wav' : 'application/octet-stream' } }));
    const output = await run('tts', { text: '你好', voiceId: 'tide', format, filterMarkdown: false });
    expect(output).toMatchObject({ accessURL: 'https://files.example.com/speech.wav', format, size: 11 });
    expect(output.fileName).toMatch(new RegExp(`^deepseek-.+\\.${format}$`));
    expect(api.mock.calls[0]![0]).toBe('https://api.deepseek.com/v1/tools/tts');
    expect(JSON.parse(api.mock.calls[0]![1]!.body as string)).toEqual({ text: '你好', voice_id: 'tide', format, filter_markdown: false });
    expect(uploadFile).toHaveBeenCalledWith(expect.objectContaining({ file: Buffer.from('audio bytes'), fileName: output.fileName }));
  });
  it('applies default voice, WAV format and Markdown filter', async () => {
    api.mockResolvedValue(new Response('audio', { headers: { 'content-type': 'audio/wav' } }));
    await run('tts', { text: 'Hello' });
    expect(JSON.parse(api.mock.calls[0]![1]!.body as string)).toEqual({ text: 'Hello', voice_id: 'stella', format: 'wav', filter_markdown: true });
  });
  it('counts Han characters as two and validates the boundary', async () => {
    expect(billingCharacters('中文A😀')).toBe(6);
    api.mockResolvedValue(new Response('audio', { headers: { 'content-type': 'audio/wav' } }));
    await expect(run('tts', { text: '中'.repeat(5000) })).resolves.toMatchObject({ format: 'wav' });
    api.mockClear();
    await expect(run('tts', { text: '中'.repeat(5001) })).rejects.toThrow('10,000');
    expect(api).not.toHaveBeenCalled();
  });
  it.each([{ text: ' ' }, { text: 'hi', voiceId: 'unknown' }, { text: 'hi', format: 'mp3' }, { text: 'hi', filterMarkdown: 'false' }])('rejects invalid TTS input (%j)', async (input) => {
    await expect(run('tts', input)).rejects.toThrow(); expect(api).not.toHaveBeenCalled();
  });
  it('rejects HTTP 200 JSON errors instead of uploading them as audio', async () => {
    api.mockResolvedValue(Response.json({ error: { message: key } }));
    await expect(run('tts', { text: 'Hi' })).rejects.toThrow('unexpected audio');
    expect(uploadFile).not.toHaveBeenCalled();
  });
  it('does not upload incomplete audio streams', async () => {
    const body = new ReadableStream({ start(controller) { controller.error(new Error(key)); } });
    api.mockResolvedValue(new Response(body, { headers: { 'content-type': 'audio/wav' } }));
    await expect(run('tts', { text: 'Hi' })).rejects.toThrow('Unable to read'); expect(uploadFile).not.toHaveBeenCalled();
  });
  it('preserves host upload errors', async () => {
    api.mockResolvedValue(new Response('audio', { headers: { 'content-type': 'audio/wav' } }));
    const error = new Error('Host storage unavailable'); uploadFile.mockResolvedValue([null, error]);
    await expect(run('tts', { text: 'Hi' })).rejects.toBe(error);
  });
});

it.each(['fetch', 'ocr', 'asr', 'tts'])('sanitizes API HTTP errors for %s and does not retry', async (child) => {
  api.mockResolvedValue(Response.json({ error: { message: key } }, { status: 402 }));
  const input = { url: 'https://example.com', fileUrl: 'https://example.com/file', text: 'Hello' };
  const error = await run(child, input).catch((error: Error) => error);
  expect(error.message).toContain('HTTP 402'); expect(error.message).not.toContain(key); expect(api).toHaveBeenCalledTimes(1);
});
