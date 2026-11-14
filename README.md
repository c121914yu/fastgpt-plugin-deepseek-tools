# DeepSeek Tools for FastGPT

社区维护的 DeepSeek 工具集，接入官方独立 **Search、Fetch、OCR、ASR、TTS** API，共用一个 `apiKey`。

插件 ID：`deepSeekTools`，版本：`1.0.0`。这是独立的新插件，源码仓库、安装包和社区索引均与旧插件 `deepSeekSearch@0.1.0` 分开。旧搜索插件无需升级或迁移，现有工作流不受本工具集影响。需要新增能力时安装本工具集，在工作流中选择相应子工具。

## 配置与数据流

在 [DeepSeek 开放平台](https://platform.deepseek.com/api_keys) 创建 API Key，填写到工具集的密钥字段 `apiKey`。该字段声明为 `isSecret: true`，无需设置模型或 Base URL。

所有 API 请求固定发送到 `https://api.deepseek.com/v1/tools/<endpoint>`，使用 Bearer 鉴权。输入的搜索词、网页地址、文档、音频或朗读文本会按所选工具发送到 DeepSeek；搜索和 Fetch 不额外调用对话模型。文件链接由插件先下载，再将二进制上传至 DeepSeek。API Key 仅发送给固定 DeepSeek API，不发送给文件链接所在站点。语音合成使用 `ctx.invoke.uploadFile()` 将音频上传至 FastGPT，需要 `file-upload:allow` 权限。

OCR 和 ASR 的 `fileUrl` 必须是**可直接下载的公开 HTTP(S) 文件链接**，可使用仍在有效期内的签名链接。不支持浏览器登录态、重定向、内网或本机地址；下载校验全部 DNS 结果并固定连接地址，防止访问私有网络及 DNS 重绑定。文件链接不需要由 DeepSeek 直接访问。请勿把 API Key 放入链接。

## 子工具

| 子工具 ID | 能力与输入 | 输出 |
| --- | --- | --- |
| `search` | 网页搜索：`query`，可选 `count`、`oriQuestion`、`localization`、`needContent` | `results`，包含标题、链接、摘要、正文及评分 |
| `fetch` | 网页抓取：`url` | `title`、Markdown `content` |
| `ocr` | 文字识别：`fileUrl`；`purpose` 默认 `text_recognition`，也可选 `rich_layout_recognition` | `id`、`purpose`、`page_count`、`pages`、合并 `text` |
| `asr` | 语音识别：`fileUrl` | `request_id`、`text`、`duration_ms` |
| `tts` | 语音合成：`text`；可选 `voiceId`、`format`、`filterMarkdown` | `accessURL`、`fileName`、`format`、`size` |

### 网页搜索

沿用旧搜索插件的参数和返回结构，但子工具 ID 为 `deepSeekTools/search`，与旧插件没有更新关系。

- `query`：必填，1–128 个 Unicode 字符，不可全为空白。支持 `site:`、`-site:`、`lang:`、`after:`、`before:`、排除词及精确短语，原样传递。
- `count`：整数 1–50，默认 10。
- `oriQuestion`：原始问题，1–128 个 Unicode 字符，可省略或传 `null`。
- `localization`：IPv4 或 IPv6 地址，默认空字符串。
- `needContent`：是否返回正文，默认 `false`。

结果保留 `title`、`url`、`snippet`、`summary`、`content`、`rerank_score`、`authority`、`site_name`、`site_icon`、`date`。无结果时返回空数组；站点信息和日期可为 `null`。

```json
{"query":"DeepSeek site:github.com lang:zh","count":5,"needContent":true}
```

### 网页抓取

`url` 必须是最多 8192 字符、不含用户名密码的 HTTP(S) 网页地址，由 DeepSeek 服务端抓取。可用性取决于目标网站策略。

```json
{"url":"https://api-docs.deepseek.com/zh-cn/guides/search/"}
```

### OCR

支持 PDF、Word（DOC/DOCX）、PowerPoint（PPT/PPTX）和 PNG、JPEG、WebP、GIF、BMP、TIFF 等图片；格式由文件实际内容判断。最多 **100 MiB、1000 页**。`text_recognition` 对不含图片的 Word/PowerPoint 直接提取文字，其余文件逐页识别；`rich_layout_recognition` 对所有文件逐页识别。

返回逐页原始文本，保留 `<｜ref｜>`、`<｜box｜>` 等布局标记。`pages[].index` 从 0 开始，`finish_reason: "length"` 表示该页内容被截断；合并 `text` 用两个换行连接各页，不清理标记。

```json
{"fileUrl":"https://your-public-file-host.example/document.pdf","purpose":"text_recognition"}
```

### 语音识别 ASR

仅支持 **16 位 PCM WAV 或 Ogg Opus**，不是任意 WAV，也不支持 MP3/M4A。最大 **8 MiB、120 秒**。WAV 采样率支持 8000、16000、22050、24000、32000、44100、48000 Hz；支持单双声道，双声道仅识别左声道。自动识别语种，无语种参数。时长、编码及页数等需解码才能确定的限制由 DeepSeek 校验，本插件不转码或切片。

```json
{"fileUrl":"https://your-public-file-host.example/speech.wav"}
```

### 语音合成 TTS

- `text`：必填，最多 **10000 个计费字符**；汉字计 2，其余字符计 1。完整 JSON 请求最多 64 KiB。
- `voiceId`：`stella`（海星，女声，默认）或 `tide`（暗潮，男声）。
- `format`：`wav`（默认）或 `pcm`；PCM 为 24 kHz、16 位、单声道原始数据，播放器可能需要显式设置参数。
- `filterMarkdown`：默认 `true`，朗读前去除 Markdown 格式。

使用 HTTP 整段合成，完整接收音频后上传到 FastGPT，返回 `accessURL`。不提供 WebSocket、变速、续传或在模型输出过程中流式播音。每次生成唯一文件名；空响应、非音频响应、读取失败均不会上传。

```json
{"text":"你好，我是 DeepSeek。","voiceId":"stella","format":"wav","filterMarkdown":true}
```

## 错误、时限与费用

所有子工具均在运行时校验参数及凭证，不自动重试，以免重复计费。HTTP 错误提供状态码和可操作提示，不回显上游正文、请求头或底层网络错误。OCR 在 HTTP 200 后返回的 `error` 也会作为失败处理；音频流中断则拒绝上传。

文件下载最多 60 秒；Search/Fetch 请求及响应体读取最多 30 秒；OCR 请求最多 190 秒，ASR/TTS 最多 180 秒。OCR 加上下载可能需要约 250 秒，请使用足够长的工作流执行时限。客户端取消不保证取消上游已接收的任务，是否计费及限速以官方文档为准。

本插件只实现五项独立工具 API。文章所述由对话模型自动搜索、文件问答、会话标题及内容安全等对话扩展参数不在本工具集的接口范围内。

官方契约及价格（以官方最新说明为准）：

- [Search / Fetch](https://api-docs.deepseek.com/zh-cn/guides/search/)
- [OCR](https://api-docs.deepseek.com/zh-cn/guides/ocr/)
- [ASR](https://api-docs.deepseek.com/zh-cn/guides/asr/)
- [TTS](https://api-docs.deepseek.com/zh-cn/guides/tts/)

## 本地开发与打包

Node.js >=22.19.0，pnpm 10.28.2；插件可独立构建，依赖使用固定版本，保留自己的锁文件。

```bash
pnpm install --frozen-lockfile
pnpm run type-check
pnpm test
pnpm run build
pnpm run check
pnpm run pack
```

安装包：`deepSeekTools.pkg`。自动测试模拟 HTTP、文件下载及宿主上传，不需要真实密钥，不产生 API 费用。

真实调试可创建 Git 忽略的 `.secrets.local.json`（包含 `apiKey`），然后运行：

```bash
pnpm run debug --run --tool search --input '{"query":"DeepSeek API","count":3}' --secrets-file .secrets.local.json
pnpm run debug --run --tool tts --input '{"text":"你好"}' --secrets-file .secrets.local.json
```

真实账号权限、服务可用性及输出质量需要有效密钥联调；请勿提交凭证。

## English

An independent community-maintained suite (`deepSeekTools`) for the official DeepSeek Search, Fetch, OCR, ASR and TTS APIs. It does not modify or replace the existing `deepSeekSearch` plugin. All five tools share an encrypted `apiKey` secret. OCR/ASR download public file URLs with DNS pinning, private-network blocking, redirect rejection and size limits. TTS uploads completed binary audio through the FastGPT host and returns an audio URL. Requests are not automatically retried. See the official guides above for supported formats, limits and billing.

## License and logo

Code is licensed under Apache-2.0. The DeepSeek whale logo comes from the [official documentation favicon](https://api-docs.deepseek.com/zh-cn/img/favicon.svg); DeepSeek names and marks belong to their respective owner. All five children reuse this logo.
