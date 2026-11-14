import { lookup } from 'node:dns/promises';
import { Agent, fetch as download } from 'undici';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { downloadFile, publicAddress, readLimited } from './src/files';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
vi.mock('undici', () => ({
  Agent: vi.fn(function(this: { destroy: ReturnType<typeof vi.fn> }) { this.destroy = vi.fn(); }),
  fetch: vi.fn()
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(lookup).mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as never);
  vi.mocked(download).mockResolvedValue(new Response('content') as never);
});
afterEach(() => { vi.restoreAllMocks(); });

it.each(['127.0.0.1', '0.0.0.0', '10.1.2.3', '172.16.0.1', '192.168.1.2', '169.254.169.254', '100.64.0.1', '224.0.0.1', '::', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '2001:db8::1'])('blocks non-public address %s', (address) => {
  expect(publicAddress(address)).toBe(false);
});
it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('permits public address %s', (address) => {
  expect(publicAddress(address)).toBe(true);
});
it('pins validated DNS to the connection and never sends API credentials to file hosts', async () => {
  await expect(downloadFile('https://files.example.com/doc.pdf?signature=private', 100)).resolves.toEqual(Buffer.from('content'));
  expect(lookup).toHaveBeenCalledTimes(1);
  expect(download).toHaveBeenCalledWith(new URL('https://files.example.com/doc.pdf?signature=private'), expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }));
  expect(vi.mocked(download).mock.calls[0]![1]?.headers).toBeUndefined();
  const connect = vi.mocked(Agent).mock.calls[0]![0]!.connect as { lookup: Function };
  const callback = vi.fn(); connect.lookup('files.example.com', {}, callback);
  expect(callback).toHaveBeenCalledWith(null, '8.8.8.8', 4);
  const all = vi.fn(); connect.lookup('files.example.com', { all: true }, all);
  expect(all).toHaveBeenCalledWith(null, [{ address: '8.8.8.8', family: 4 }]);
  expect(vi.mocked(Agent).mock.instances[0]!.destroy).toHaveBeenCalledOnce();
});
it.each(['http://127.0.0.1/file', 'http://[::1]/file', 'http://2130706433/file', 'http://0x7f000001/file', 'http://user:pass@example.com/file', 'file:///etc/passwd'])('blocks unsafe file URL %s before network access', async (url) => {
  await expect(downloadFile(url, 100)).rejects.toThrow(); expect(download).not.toHaveBeenCalled();
});
it('rejects mixed public/private DNS answers', async () => {
  vi.mocked(lookup).mockResolvedValue([{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }] as never);
  await expect(downloadFile('https://example.com/file', 100)).rejects.toThrow('public IP');
  expect(download).not.toHaveBeenCalled();
});
it('hides signed URL and network error details and releases the agent on failure', async () => {
  vi.mocked(download).mockRejectedValue(new Error('https://example.com?signature=private'));
  const error = await downloadFile('https://example.com/file?signature=private', 100).catch((error: Error) => error);
  expect(error.message).not.toContain('private'); expect(error.message).not.toContain('signature');
  expect(vi.mocked(Agent).mock.instances[0]!.destroy).toHaveBeenCalledOnce();
});
it('rejects failed downloads and cancels their bodies', async () => {
  const response = new Response('error', { status: 403 }); const cancel = vi.spyOn(response.body!, 'cancel');
  vi.mocked(download).mockResolvedValue(response as never);
  await expect(downloadFile('https://example.com/file', 100)).rejects.toThrow('Unable to download');
  expect(cancel).toHaveBeenCalledOnce();
});
it('rejects oversized declared bodies before reading and oversized chunked streams while reading', async () => {
  const declared = new Response('x', { headers: { 'content-length': '101' } }); const cancel = vi.spyOn(declared.body!, 'cancel');
  await expect(readLimited(declared, 100)).rejects.toThrow('limit'); expect(cancel).toHaveBeenCalledOnce();
  const cancelStream = vi.fn();
  const chunked = new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(60)); controller.enqueue(new Uint8Array(60)); }, cancel: cancelStream
  }));
  await expect(readLimited(chunked, 100)).rejects.toThrow('limit'); expect(cancelStream).toHaveBeenCalledOnce();
});
it('rejects an empty audio or document response', async () => {
  await expect(readLimited(new Response(''), 100)).rejects.toThrow('empty');
});
