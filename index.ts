import { defineToolSet } from '@fastgpt-plugin/sdk-factory';

import { secretSchema } from './src/schemas';
import { asrHandler, fetchHandler, ocrHandler, searchHandler, ttsHandler } from './src/tools';

export default defineToolSet({
  manifest: {
    pluginId: 'deepSeekTools',
    version: '1.0.0',
    name: { en: 'DeepSeek Tools', 'zh-CN': 'DeepSeek 工具集' },
    description: {
      en: 'Official DeepSeek Search, Fetch, OCR, speech recognition and speech synthesis APIs with one shared API key.',
      'zh-CN': '通过 DeepSeek 官方接口提供网页搜索、网页抓取、文字识别、语音识别和语音合成，共用一个 API Key。'
    },
    versionDescription: {
      en: 'Five independent DeepSeek API tools with localized field titles and descriptions.',
      'zh-CN': '五项独立 DeepSeek API 工具，字段标题和说明遵循多语言规范。'
    },
    author: 'c121914yu',
    repoUrl: 'https://github.com/c121914yu/fastgpt-plugin-deepseek-tools',
    tutorialUrl: 'https://api-docs.deepseek.com/zh-cn/guides/search/',
    tags: ['search', 'multimodal'],
    permission: ['file-upload:allow']
  },
  secretSchema,
  children: [
    {
      id: 'search', name: { en: 'Web Search', 'zh-CN': '网页搜索' },
      description: { en: 'Search the web and return structured sources and summaries.', 'zh-CN': '搜索网页，返回结构化来源、摘要、评分和可选正文。' },
      handler: searchHandler
    },
    {
      id: 'fetch', name: { en: 'Read Web Page', 'zh-CN': '网页抓取' },
      description: { en: 'Read a web page as Markdown using DeepSeek Fetch.', 'zh-CN': '通过 DeepSeek Fetch 抓取网页并返回 Markdown 正文。' },
      handler: fetchHandler
    },
    {
      id: 'ocr', name: { en: 'Recognize Document', 'zh-CN': '文字识别 OCR' },
      description: { en: 'Extract text from a PDF, Office document or image, up to 100 MiB and 1,000 pages.', 'zh-CN': '识别 PDF、Office 文档或图片，最多 100 MiB、1,000 页，返回逐页结果和合并文本。' },
      handler: ocrHandler
    },
    {
      id: 'asr', name: { en: 'Transcribe Audio', 'zh-CN': '语音识别 ASR' },
      description: { en: 'Transcribe 16-bit PCM WAV or Ogg Opus audio, up to 8 MiB and 120 seconds; language is detected automatically.', 'zh-CN': '转写 16 位 PCM WAV 或 Ogg Opus 音频，最多 8 MiB、120 秒，自动识别语种。' },
      handler: asrHandler
    },
    {
      id: 'tts', name: { en: 'Synthesize Speech', 'zh-CN': '语音合成 TTS' },
      description: { en: 'Synthesize text with stella or tide voice and upload WAV or PCM audio to FastGPT.', 'zh-CN': '以海星或暗潮音色朗读文本，将 WAV 或 PCM 音频上传到 FastGPT 并返回链接。' },
      handler: ttsHandler
    }
  ]
});
