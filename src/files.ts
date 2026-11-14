import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, fetch as download } from 'undici';

export function httpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}

export function publicAddress(address: string): boolean {
  try { return ipaddr.process(address).range() === 'unicast'; }
  catch { return false; }
}

export async function readLimited(
  response: { headers: { get(name: string): string | null }; body: {
    cancel(): Promise<void>;
    getReader(): {
      read(): Promise<{ done: boolean; value?: Uint8Array | undefined }>;
      cancel(): Promise<void>;
      releaseLock(): void;
    };
  } | null },
  maxBytes: number
): Promise<Buffer> {
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel();
    throw new Error(`File exceeds the ${maxBytes / 1024 / 1024} MiB limit.`);
  }
  if (!response.body) throw new Error('The service returned an empty file.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error(`File exceeds the ${maxBytes / 1024 / 1024} MiB limit.`);
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  if (!size) throw new Error('The service returned an empty file.');
  return Buffer.concat(chunks, size);
}

export async function downloadFile(fileUrl: string, maxBytes: number): Promise<Buffer> {
  if (!httpUrl(fileUrl)) throw new Error('File URL must use HTTP or HTTPS without credentials.');
  const url = new URL(fileUrl);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let addresses;
  try {
    addresses = isIP(hostname)
      ? [{ address: hostname, family: isIP(hostname) }]
      : await lookup(hostname, { all: true });
  } catch { throw new Error('Unable to resolve the file URL.'); }
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) {
    throw new Error('File URL must resolve only to public IP addresses.');
  }
  // Pin the validated DNS answer for the connection to prevent DNS rebinding.
  const address = addresses[0]!;
  const agent = new Agent({ connect: { lookup: (_host, options, callback) => {
    if (options.all) callback(null, [address]);
    else callback(null, address.address, address.family);
  } } });
  try {
    const response = await download(url, {
      dispatcher: agent, redirect: 'error', signal: AbortSignal.timeout(60_000)
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('File download failed.');
    }
    return await readLimited(response, maxBytes);
  } catch {
    // Signed URLs and upstream errors may contain credentials.
    throw new Error(`Unable to download file. Use a directly accessible public URL, without redirects, up to ${maxBytes / 1024 / 1024} MiB.`);
  } finally { await agent.destroy(); }
}
