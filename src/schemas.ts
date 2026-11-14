import { isIP } from 'node:net';

import type { InputSchemaMetaType, OutputSchemaMetaType, SecretSchemaMetaType } from '@fastgpt-plugin/sdk-factory';
import z from 'zod';

// Keep the stable SDK runtime; emit the same x-i18n contract as the newer schema helpers.
// The API counts Unicode code points; Zod's string length counts UTF-16 code units.
const searchText = z.string().min(1).refine(
  (value) => Array.from(value).length <= 128,
  'Must contain at most 128 Unicode characters'
);

export const inputSchema = z.object({
  query: searchText.refine((value) => value.trim().length > 0, 'Query cannot be blank').meta({
    title: 'Query', maxLength: 128,
    description: 'Search query, 1–128 Unicode characters. Supports site:, -site:, lang:, after:, before:, excluded terms, and quoted exact phrases. Operators are forwarded unchanged.',
    'x-i18n': {
      title: { en: 'Query', 'zh-CN': '搜索词' },
      description: {
        en: 'Search query, 1–128 Unicode characters. Supports site:, -site:, lang:, after:, before:, excluded terms, and quoted exact phrases. Operators are forwarded unchanged.',
        'zh-CN': '1–128 个 Unicode 字符，支持 site:、-site:、lang:、after:、before:、排除词和精确短语。搜索语法原样传递。'
      }
    },
    isToolParam: true
  } satisfies InputSchemaMetaType),
  count: z.number().int().min(1).max(50).default(10).optional().meta({
    title: 'Result count', description: 'Return 1–50 results; defaults to 10.',
    'x-i18n': {
      title: { en: 'Result count', 'zh-CN': '结果数量' },
      description: { en: 'Return 1–50 results; defaults to 10.', 'zh-CN': '返回 1–50 条结果，默认 10 条。' }
    },
    isToolParam: true
  } satisfies InputSchemaMetaType),
  oriQuestion: searchText.nullish().meta({
    title: 'Original question', maxLength: 128,
    description: 'Optional original question, 1–128 Unicode characters. Null means not provided.',
    'x-i18n': {
      title: { en: 'Original question', 'zh-CN': '原始问题' },
      description: {
        en: 'Optional original question, 1–128 Unicode characters. Null means not provided.',
        'zh-CN': '可选，触发搜索的原始问题，1–128 个 Unicode 字符；null 表示不提供。'
      }
    },
    isToolParam: true
  } satisfies InputSchemaMetaType),
  localization: z.string().refine(
    (value) => value === '' || isIP(value) !== 0,
    'Localization must be an IPv4 or IPv6 address, or empty'
  ).default('').optional().meta({
    title: 'Localization IP', description: 'Optional IPv4 or IPv6 address for localized results. Leave empty to skip.',
    'x-i18n': {
      title: { en: 'Localization IP', 'zh-CN': '本地化 IP' },
      description: {
        en: 'Optional IPv4 or IPv6 address for localized results. Leave empty to skip.',
        'zh-CN': '可选，IPv4 或 IPv6 地址，用于优先返回本地化结果；默认留空。'
      }
    },
    isToolParam: false
  } satisfies InputSchemaMetaType),
  needContent: z.boolean().default(false).optional().meta({
    title: 'Include page content', description: 'Include page content; disabled by default. Enabling this may produce large responses.',
    'x-i18n': {
      title: { en: 'Include page content', 'zh-CN': '返回正文' },
      description: {
        en: 'Include page content; disabled by default. Enabling this may produce large responses.',
        'zh-CN': '是否返回网页正文，默认关闭；开启后响应内容可能较大。'
      }
    },
    isToolParam: true
  } satisfies InputSchemaMetaType)
});

export const secretSchema = z.object({
  apiKey: z.string().trim().min(1, 'DeepSeek API Key is required').meta({
    title: 'DeepSeek API Key', description: 'Create an API key at https://platform.deepseek.com/api_keys.',
    'x-i18n': {
      title: { en: 'DeepSeek API Key', 'zh-CN': 'DeepSeek API 密钥' },
      description: {
        en: 'Create an API key at https://platform.deepseek.com/api_keys.',
        'zh-CN': '在 https://platform.deepseek.com/api_keys 创建 API 密钥。'
      }
    },
    isSecret: true
  } satisfies SecretSchemaMetaType)
});

export const outputSchema = z.object({
  results: z.array(z.object({
    title: z.string().meta({ title: 'Page title', 'x-i18n': { title: { en: 'Page title', 'zh-CN': '网页标题' } } }),
    url: z.string().meta({ title: 'Page URL', 'x-i18n': { title: { en: 'Page URL', 'zh-CN': '网页链接' } } }),
    snippet: z.string().meta({ title: 'Snippet', 'x-i18n': { title: { en: 'Snippet', 'zh-CN': '短摘要' } } }),
    summary: z.string().meta({ title: 'Summary', 'x-i18n': { title: { en: 'Summary', 'zh-CN': '长摘要' } } }),
    content: z.string().meta({ title: 'Page content', 'x-i18n': { title: { en: 'Page content', 'zh-CN': '网页正文' } } }),
    rerank_score: z.number().min(0).max(3).meta({ title: 'Relevance score', 'x-i18n': { title: { en: 'Relevance score', 'zh-CN': '相关性评分' } } }),
    authority: z.number().int().min(-1).max(4).meta({ title: 'Authority', 'x-i18n': { title: { en: 'Authority', 'zh-CN': '权威等级' } } }),
    site_name: z.string().nullable().meta({ title: 'Site name', 'x-i18n': { title: { en: 'Site name', 'zh-CN': '站点名称' } } }),
    site_icon: z.string().nullable().meta({ title: 'Site icon', 'x-i18n': { title: { en: 'Site icon', 'zh-CN': '站点图标' } } }),
    date: z.string().nullable().meta({ title: 'Published date', 'x-i18n': { title: { en: 'Published date', 'zh-CN': '发布时间' } } })
  })).meta({
    title: 'Search results', description: 'Page titles, URLs, snippets, summaries, content, relevance scores, authority, and site metadata. Empty when no results match.',
    'x-i18n': {
      title: { en: 'Search results', 'zh-CN': '搜索结果' },
      description: {
        en: 'Page titles, URLs, snippets, summaries, content, relevance scores, authority, and site metadata. Empty when no results match.',
        'zh-CN': '网页标题、链接、短摘要、长摘要、正文、相关性评分、权威等级及站点信息；无匹配时为空数组。'
      }
    }
  } satisfies OutputSchemaMetaType)
});
