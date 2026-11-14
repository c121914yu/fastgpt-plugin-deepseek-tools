import z from 'zod';
import { httpUrl } from './files';

function field<T extends z.ZodType>(type: T, title: { en: string; 'zh-CN': string }, isToolParam = true): T {
  return type.meta({ title: title.en, 'x-i18n': { title }, ...(isToolParam ? { isToolParam: true } : {}) });
}
const url = z.string().max(8192).refine(httpUrl, 'Must be an HTTP(S) URL without credentials');
const fileUrl = field(url, { en: 'File URL', 'zh-CN': '文件链接' }).meta({
  title: 'File URL', isToolParam: true,
  description: 'Directly downloadable public HTTP(S) URL. Redirects and private networks are not supported.',
  'x-i18n': {
    title: { en: 'File URL', 'zh-CN': '文件链接' },
    description: {
      en: 'Directly downloadable public HTTP(S) URL. Redirects and private networks are not supported.',
      'zh-CN': '可直接下载的公开 HTTP(S) 文件链接，不支持重定向或内网地址。'
    }
  }
});

export const fetchInput = z.object({ url: field(url, { en: 'Web page URL', 'zh-CN': '网页地址' }) });
export const fetchOutput = z.object({
  title: field(z.string(), { en: 'Page title', 'zh-CN': '网页标题' }, false),
  content: field(z.string(), { en: 'Content', 'zh-CN': 'Markdown 正文' }, false)
});
export const ocrInput = z.object({
  fileUrl,
  purpose: field(z.enum(['text_recognition', 'rich_layout_recognition']).default('text_recognition'), { en: 'Recognition mode', 'zh-CN': '识别模式' })
});
export const ocrOutput = z.object({
  id: field(z.string(), { en: 'Request ID', 'zh-CN': '请求 ID' }, false),
  purpose: field(z.enum(['text_recognition', 'rich_layout_recognition']), { en: 'Recognition mode', 'zh-CN': '识别模式' }, false),
  page_count: field(z.number().int().min(1).max(1000), { en: 'Page count', 'zh-CN': '页数' }, false),
  pages: field(z.array(z.object({
    index: field(z.number().int().nonnegative(), { en: 'Page index', 'zh-CN': '页码' }, false),
    text: field(z.string(), { en: 'Recognized text', 'zh-CN': '识别文本' }, false),
    finish_reason: field(z.enum(['stop', 'length']), { en: 'Finish reason', 'zh-CN': '结束原因' }, false)
  })), { en: 'Recognized pages', 'zh-CN': '逐页识别结果' }, false),
  text: field(z.string(), { en: 'Combined text', 'zh-CN': '合并文本' }, false)
});
export const ocrResponse = ocrOutput.omit({ text: true }).refine(
  (data) => data.page_count === data.pages.length, 'Page count must match the pages array'
);
export const asrInput = z.object({ fileUrl });
export const asrOutput = z.object({
  request_id: field(z.string(), { en: 'Request ID', 'zh-CN': '请求 ID' }, false),
  text: field(z.string(), { en: 'Transcription', 'zh-CN': '转写文本' }, false),
  duration_ms: field(z.number().nonnegative(), { en: 'Duration (ms)', 'zh-CN': '音频时长（毫秒）' }, false)
});
export function billingCharacters(text: string): number {
  return Array.from(text).reduce((count, char) => count + (/\p{Script=Han}/u.test(char) ? 2 : 1), 0);
}
export const ttsInput = z.object({
  text: field(z.string().refine((text) => text.trim().length > 0, 'Text cannot be blank')
    .refine((text) => billingCharacters(text) <= 10_000, 'At most 10,000 billing characters (Han characters count as two)'), { en: 'Text', 'zh-CN': '朗读文本' }),
  voiceId: field(z.enum(['stella', 'tide']).default('stella'), { en: 'Voice', 'zh-CN': '音色' }),
  format: field(z.enum(['wav', 'pcm']).default('wav'), { en: 'Audio format', 'zh-CN': '音频格式' }),
  filterMarkdown: field(z.boolean().default(true), { en: 'Remove Markdown', 'zh-CN': '去除 Markdown 格式' })
});
export const ttsOutput = z.object({
  accessURL: field(z.string().url(), { en: 'Audio URL', 'zh-CN': '音频链接' }, false),
  fileName: field(z.string(), { en: 'File name', 'zh-CN': '文件名' }, false),
  format: field(z.enum(['wav', 'pcm']), { en: 'Audio format', 'zh-CN': '音频格式' }, false),
  size: field(z.number().int().positive(), { en: 'Size (bytes)', 'zh-CN': '文件大小（字节）' }, false)
});
