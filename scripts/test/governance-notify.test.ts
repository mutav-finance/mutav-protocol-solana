import { describe, expect, test } from 'bun:test';
import { buildRequest, loadAlertConfig, main, RESEND_ENDPOINT, reportText, send, subjectFor } from '../governance/notify';

// A fake API key: never a real one.
const KEY = 're_test_FAKE_0000';
const ENV = { RESEND_API_KEY: KEY, ALERT_FROM: 'MUTAV alerts <alerts@example.com>', ALERT_TO: 'a@example.com, b@example.com' };

describe('loadAlertConfig', () => {
  test('reads the three settings', () => {
    expect(loadAlertConfig(ENV)).toEqual({ apiKey: KEY, from: ENV.ALERT_FROM, to: ['a@example.com', 'b@example.com'] });
  });

  test('refuses missing settings, naming each one and never the key', () => {
    expect(() => loadAlertConfig({})).toThrow('RESEND_API_KEY (secret), ALERT_FROM (variable), ALERT_TO (variable) not set');
    try {
      loadAlertConfig({ ...ENV, ALERT_TO: ' , ' });
      throw new Error('unreachable');
    } catch (e) {
      expect((e as Error).message).toContain('ALERT_TO');
      expect((e as Error).message).not.toContain(KEY);
    }
  });

  test('refuses malformed addresses and too many recipients', () => {
    expect(() => loadAlertConfig({ ...ENV, ALERT_FROM: 'nobody' })).toThrow('not an email address');
    const many = Array.from({ length: 51 }, (_, i) => `r${i}@example.com`).join(',');
    expect(() => loadAlertConfig({ ...ENV, ALERT_TO: many })).toThrow('at most 50');
  });
});

describe('buildRequest', () => {
  test('POSTs JSON to the Resend emails endpoint with Bearer auth', () => {
    const r = buildRequest(loadAlertConfig(ENV), { subject: 's', text: 'body', idempotencyKey: 'governance-watch/1/1' });
    expect(r.url).toBe(RESEND_ENDPOINT);
    expect(r.url).toBe('https://api.resend.com/emails');
    expect(r.init.method).toBe('POST');
    expect(r.init.headers).toEqual({ Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'governance-watch/1/1' });
    expect(JSON.parse(r.init.body)).toEqual({ from: ENV.ALERT_FROM, to: ['a@example.com', 'b@example.com'], subject: 's', text: 'body' });
  });

  test('subjects name the outcome', () => {
    expect(subjectFor('1', 'devnet')).toBe('[MUTAV governance] devnet: findings');
    expect(subjectFor('2', 'devnet')).toContain('could not complete');
    expect(subjectFor('', 'devnet')).toContain('did not run');
  });
});

describe('send', () => {
  test('returns the email id on success', async () => {
    let seen = '';
    const id = await send(loadAlertConfig(ENV), { subject: 's', text: 't' }, async (url) => {
      seen = url;
      return { ok: true, status: 200, text: async () => '{"id":"49a3999c"}' };
    });
    expect(seen).toBe(RESEND_ENDPOINT);
    expect(id).toBe('49a3999c');
  });

  test('throws on an error answer, with the key redacted', async () => {
    const p = send(loadAlertConfig(ENV), { subject: 's', text: 't' }, async () => ({ ok: false, status: 403, text: async () => `domain not verified ${KEY}` }));
    await expect(p).rejects.toThrow('Resend answered 403');
    await expect(p).rejects.not.toThrow(KEY);
  });
});

describe('main', () => {
  test('refuses to run without the settings (no request is made)', async () => {
    let called = false;
    const f = async () => {
      called = true;
      return { ok: true, status: 200, text: async () => '{}' };
    };
    await expect(main({ 'exit-code': '1' }, {}, f)).rejects.toThrow('not set');
    expect(called).toBe(false);
  });

  test('sends a stand-in when the watcher wrote no report', async () => {
    let body = '';
    await main({ 'exit-code': '2', report: '/nonexistent/report.txt' }, { ...ENV, GITHUB_RUN_ID: '7', GITHUB_REPOSITORY: 'o/r' }, async (_u, init) => {
      body = init.body;
      return { ok: true, status: 200, text: async () => '{"id":"x"}' };
    });
    const sent = JSON.parse(body);
    expect(sent.subject).toBe('[MUTAV governance] devnet: watcher could not complete');
    expect(sent.text).toContain('wrote no report');
    expect(sent.text).toContain('https://github.com/o/r/actions/runs/7');
    expect(reportText(undefined, '', undefined)).toContain('exit code unknown');
  });
});
