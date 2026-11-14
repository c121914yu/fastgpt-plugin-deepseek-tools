import z from 'zod';
import { httpUrl } from './files';

function field<T extends z.ZodType>(type: T, title: string, isToolParam = true): T {
  return type.meta({ title, isToolParam });
}
const url = z.string().max(8192).refine(httpUrl, 'Must be an HTTP(S) URL without credentials');
const fileUrl = field(url, '文件链接 / File URL').meta({
  title: '文件链接 / File URL', isToolParam: true,
  description: '可直接下载的公开 HTTP(S) 链接；不支持重定向或内网地址。Direct public file URL; no redirects or private networks.'
});

export const fetchInput = z.object({ url: field(url, '网页地址 / Web page URL') });
export const fetchOutput = z.object({
  title: field(z.string(), '网页标题 / Page title', false),
  content: field(z.string(), 'Markdown 正文 / Content', false)
});
export const ocrInput = z.object({
  fileUrl,
  purpose: field(z.enum(['text_recognition', 'rich_layout_recognition']).default('text_recognition'), '识别模式 / Recognition mode')
});
export const ocrOutput = z.object({
  id: field(z.string(), '请求 ID / Request ID', false),
  purpose: field(z.enum(['text_recognition', 'rich_layout_recognition']), '识别模式 / Recognition mode', false),
  page_count: field(z.number().int().min(1).max(1000), '页数 / Page count', false),
  pages: field(z.array(z.object({
    index: z.number().int().nonnegative(), text: z.string(), finish_reason: z.enum(['stop', 'length'])
  })), '逐页识别结果 / Recognized pages', false),
  text: field(z.string(), '合并文本 / Combined text', false)
});
export const ocrResponse = ocrOutput.omit({ text: true }).refine(
  (data) => data.page_count === data.pages.length, 'Page count must match the pages array'
);
export const asrInput = z.object({ fileUrl });
export const asrOutput = z.object({
  request_id: field(z.string(), '请求 ID / Request ID', false),
  text: field(z.string(), '转写文本 / Transcription', false),
  duration_ms: field(z.number().nonnegative(), '音频时长（毫秒）/ Duration (ms)', false)
});
export function billingCharacters(text: string): number {
  return Array.from(text).reduce((count, char) => count + (/\p{Script=Han}/u.test(char) ? 2 : 1), 0);
}
export const ttsInput = z.object({
  text: field(z.string().refine((text) => text.trim().length > 0, 'Text cannot be blank')
    .refine((text) => billingCharacters(text) <= 10_000, 'At most 10,000 billing characters (Han characters count as two)'), '朗读文本 / Text'),
  voiceId: field(z.enum(['stella', 'tide']).default('stella'), '音色 / Voice'),
  format: field(z.enum(['wav', 'pcm']).default('wav'), '音频格式 / Audio format'),
  filterMarkdown: field(z.boolean().default(true), '去除 Markdown 格式 / Remove Markdown')
});
export const ttsOutput = z.object({
  accessURL: field(z.string().url(), '音频链接 / Audio URL', false),
  fileName: field(z.string(), '文件名 / File name', false),
  format: field(z.enum(['wav', 'pcm']), '音频格式 / Audio format', false),
  size: field(z.number().int().positive(), '文件大小（字节）/ Size (bytes)', false)
});
