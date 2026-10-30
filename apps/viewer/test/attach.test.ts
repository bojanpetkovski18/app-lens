// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isTrustedRequest } from '../attach-endpoint';
import { readSelectedFiles } from '../src/components/AttachDialog';

const request = (headers: Record<string, string>, method = 'POST') => ({ method, headers: { 'content-type': 'application/json', ...headers } });

describe('isTrustedRequest', () => {
  it('accepts the dev page itself', () => {
    expect(isTrustedRequest(request({ host: 'localhost:5173', origin: 'http://localhost:5173' }))).toBe(true);
  });

  it.each([
    ['another origin', { host: 'localhost:5173', origin: 'https://evil.example' }],
    ['no origin', { host: 'localhost:5173' }],
    ['a rebinding host', { host: 'evil.example:5173', origin: 'http://evil.example:5173' }],
  ])('refuses %s', (_name, headers) => {
    expect(isTrustedRequest(request(headers))).toBe(false);
  });

  it('refuses GET and form posts', () => {
    expect(isTrustedRequest(request({ host: 'localhost:5173', origin: 'http://localhost:5173' }, 'GET'))).toBe(false);
    expect(isTrustedRequest({ method: 'POST', headers: { host: 'localhost:5173', origin: 'http://localhost:5173', 'content-type': 'text/plain' } })).toBe(false);
  });
});

describe('readSelectedFiles', () => {
  const file = (path: string, text: string) => {
    const value = new File([text], path.split('/').pop() as string);
    Object.defineProperty(value, 'webkitRelativePath', { value: path });
    Object.defineProperty(value, 'text', { value: async () => text });
    return value;
  };

  it('strips the folder name and skips secrets and dependencies', async () => {
    const files = await readSelectedFiles([file('proj/package.json', '{}'), file('proj/.env', 'SECRET=1'), file('proj/node_modules/a/index.js', 'x'), file('proj/key.pem', 'x')]);
    expect(files).toEqual([{ path: 'package.json', text: '{}' }]);
  });
});
