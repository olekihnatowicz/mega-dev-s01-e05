import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createAgentApp } from '../src/agents.js';

const rawKey = Buffer.from('test webhook secret');
const pingKey = `whsec_${rawKey.toString('base64')}`;

function signedHeaders(body: string, id: string, timestamp: string): Headers {
  const signature = createHmac('sha256', rawKey).update(`${id}.${timestamp}.${body}`).digest('base64');
  return new Headers({
    'content-type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': timestamp,
    'webhook-signature': `v1,${signature}`,
  });
}

describe('course agents', () => {
  it('publishes the owner and only the agents permitted actions', async () => {
    const app = createAgentApp({ env: { OWNER_CODE: 'owner-test', PING_KEY: pingKey } });
    const response = await app.request('/.well-known/mega-pulse.json');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      owner: 'owner-test',
      agents: {
        pulse: { wakes: 'pulse', may: ['answer'] },
        'test-writer': { wakes: 'test', may: ['test', 'answer'] },
      },
    });
  });

  it('rejects an unsigned ping before making outbound requests', async () => {
    let called = false;
    const app = createAgentApp({
      env: { PING_KEY: pingKey },
      fetcher: async () => {
        called = true;
        throw new Error('unexpected request');
      },
    });
    const response = await app.request('/ping', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'pulse' }),
    });
    expect(response.status).toBe(401);
    expect(called).toBe(false);
  });

  it('accepts a correctly signed ping timestamp and id before validating its payload', async () => {
    const app = createAgentApp({ env: { PING_KEY: pingKey } });
    const body = JSON.stringify({ kind: 'unknown' });
    const response = await app.request('/ping', {
      method: 'POST',
      headers: signedHeaders(body, 'ping-test', String(Math.floor(Date.now() / 1000))),
      body,
    });
    expect(response.status).toBe(400);
  });

  it('quotes a pulse phrase and replies with a currently open issue', async () => {
    let replyBody: Record<string, string> | undefined;
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url === 'https://hq.mega.dev/rig/tracker/issues') {
        return new Response(JSON.stringify({ issues: [
          { number: 14, title: 'pulse replies look wrong', state: 'open', body: 'untrusted text' },
        ] }), { status: 200 });
      }
      if (url.endsWith('/chat/completions')) {
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"status":"The pulse is live","issueNumber":14,"recommendation":"check the signed reply path"}' } }] }), { status: 200 });
      }
      if (url === 'https://hq.mega.dev/reply/one') {
        replyBody = JSON.parse(String(init?.body)) as Record<string, string>;
        return new Response(null, { status: 202 });
      }
      throw new Error(`unexpected request: ${url}`);
    };
    const app = createAgentApp({
      env: { PING_KEY: pingKey, MODEL_API_KEY: 'test-model-key' },
      fetcher,
    });
    const body = JSON.stringify({
      kind: 'pulse',
      text: 'pulse? phrase-42',
      phrase: 'phrase-42',
      reply: 'https://hq.mega.dev/reply/one',
      tracker: 'https://hq.mega.dev/rig/tracker/issues',
    });
    const response = await app.request('/ping', {
      method: 'POST',
      headers: signedHeaders(body, 'pulse-1', String(Math.floor(Date.now() / 1000))),
      body,
    });
    expect(response.status).toBe(202);
    expect(replyBody?.text).toContain('"phrase-42"');
    expect(replyBody?.text).toContain('#14');
  });

  it('returns only a new test file for a signed test ping', async () => {
    let replyBody: Record<string, string> | undefined;
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url === 'https://hq.mega.dev/rig/tracker/issues/12') {
        return new Response(JSON.stringify({ number: 12, title: 'missing owner row', body: 'data' }), { status: 200 });
      }
      if (url.endsWith('/chat/completions')) {
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"path":"test/owner-regression.test.ts","test":"import { expect, it } from \'vitest\';\\nit(\'keeps the row\', () => { expect(true).toBe(false); });","red":"expected one row, received none"}' } }] }), { status: 200 });
      }
      if (url === 'https://hq.mega.dev/reply/two') {
        replyBody = JSON.parse(String(init?.body)) as Record<string, string>;
        return new Response(null, { status: 202 });
      }
      throw new Error(`unexpected request: ${url}`);
    };
    const app = createAgentApp({
      env: { PING_KEY: pingKey, MODEL_API_KEY: 'test-model-key' },
      fetcher,
    });
    const body = JSON.stringify({
      kind: 'test',
      issue: 12,
      reply: 'https://hq.mega.dev/reply/two',
      files: { 'src/digest/read.ts': 'base source', 'test/digest.test.ts': 'existing test' },
    });
    const response = await app.request('/ping', {
      method: 'POST',
      headers: signedHeaders(body, 'test-1', String(Math.floor(Date.now() / 1000))),
      body,
    });
    expect(response.status).toBe(202);
    expect(replyBody?.path).toBe('test/owner-regression.test.ts');
    expect(replyBody?.red).toContain('received none');
  });
});
