import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert/strict';
import worker from '../src/index.js';

let origLog;
let origError;

function makeEnv(store) {
	return {
		KV_DOMAIN: {
			async get(key, opts) {
				if (!Object.prototype.hasOwnProperty.call(store, key)) {
					return null;
				}
				const value = store[key];
				if (opts && opts.type === 'json') {
					return JSON.parse(value);
				}
				return value;
			},
		},
	};
}

async function call(url, method = 'GET', store = {}) {
	const request = new Request(url, { method });
	const env = makeEnv(store);
	const response = await worker.fetch(request, env);
	return response;
}

describe('MTA-STS Worker', () => {
	before(() => {
		origLog = console.log;
		origError = console.error;
		console.log = () => {};
		console.error = () => {};
	});

	after(() => {
		console.log = origLog;
		console.error = origError;
	});

	it('valid enforce policy returns 200', async () => {
		const store = {
			'example.com': JSON.stringify({
				mode: 'enforce',
				mx: ['mail.example.com', '*.example.net'],
			}),
		};
		const res = await call('https://mta-sts.example.com/.well-known/mta-sts.txt', 'GET', store);
		assert.equal(res.status, 200);
		const body = await res.text();
		const expectedBody = 'version: STSv1\r\nmode: enforce\r\nmx: mail.example.com\r\nmx: *.example.net\r\nmax_age: 604800\r\n';
		assert.equal(body, expectedBody);
		const contentType = res.headers.get('content-type');
		assert.equal(contentType, 'text/plain; charset=utf-8');
	});

	it('custom max_age is used', async () => {
		const store = {
			'example.com': JSON.stringify({
				mode: 'enforce',
				mx: ['mail.example.com'],
				max_age: 3600,
			}),
		};
		const res = await call('https://mta-sts.example.com/.well-known/mta-sts.txt', 'GET', store);
		assert.equal(res.status, 200);
		const body = await res.text();
		const expectedBody = 'version: STSv1\r\nmode: enforce\r\nmx: mail.example.com\r\nmax_age: 3600\r\n';
		assert.equal(body, expectedBody);
	});

	it('mode none with empty mx returns 200', async () => {
		const store = {
			'example.com': JSON.stringify({
				mode: 'none',
				mx: [],
			}),
		};
		const res = await call('https://mta-sts.example.com/.well-known/mta-sts.txt', 'GET', store);
		assert.equal(res.status, 200);
		const body = await res.text();
		const expectedBody = 'version: STSv1\r\nmode: none\r\nmax_age: 604800\r\n';
		assert.equal(body, expectedBody);
	});

	it('mode none with mx omitted returns 200', async () => {
		const store = {
			'example.com': JSON.stringify({
				mode: 'none',
			}),
		};
		const res = await call('https://mta-sts.example.com/.well-known/mta-sts.txt', 'GET', store);
		assert.equal(res.status, 200);
		const body = await res.text();
		const expectedBody = 'version: STSv1\r\nmode: none\r\nmax_age: 604800\r\n';
		assert.equal(body, expectedBody);
	});

	it('enforce with mx omitted returns 500', async () => {
		const store = {
			'example.com': JSON.stringify({
				mode: 'enforce',
			}),
		};
		const res = await call('https://mta-sts.example.com/.well-known/mta-sts.txt', 'GET', store);
		assert.equal(res.status, 500);
	});

	it('HEAD returns 200 with empty body', async () => {
		const store = {
			'example.com': JSON.stringify({
				mode: 'enforce',
				mx: ['mail.example.com'],
			}),
		};
		const res = await call('https://mta-sts.example.com/.well-known/mta-sts.txt', 'HEAD', store);
		assert.equal(res.status, 200);
		const body = await res.text();
		assert.equal(body, '');
		const contentType = res.headers.get('content-type');
		assert.equal(contentType, 'text/plain; charset=utf-8');
	});

	it('POST returns 405 with Allow header', async () => {
		const store = {
			'example.com': JSON.stringify({
				mode: 'enforce',
				mx: ['mail.example.com'],
			}),
		};
		const res = await call('https://mta-sts.example.com/.well-known/mta-sts.txt', 'POST', store);
		assert.equal(res.status, 405);
		const allow = res.headers.get('allow');
		assert.equal(allow, 'GET, HEAD');
	});

	it('host without mta-sts. prefix returns 404', async () => {
		const store = {
			'example.com': JSON.stringify({
				mode: 'enforce',
				mx: ['mail.example.com'],
			}),
		};
		const res = await call('https://example.com/.well-known/mta-sts.txt', 'GET', store);
		assert.equal(res.status, 404);
	});

	it('wrong path returns 404', async () => {
		const store = {
			'example.com': JSON.stringify({
				mode: 'enforce',
				mx: ['mail.example.com'],
			}),
		};
		const res = await call('https://mta-sts.example.com/not-well-known', 'GET', store);
		assert.equal(res.status, 404);
	});

	it('unknown domain returns 404', async () => {
		const res = await call('https://mta-sts.unknown.com/.well-known/mta-sts.txt', 'GET', {});
		assert.equal(res.status, 404);
	});

	it('trailing dot host works', async () => {
		const store = {
			'example.com': JSON.stringify({
				mode: 'enforce',
				mx: ['mail.example.com'],
			}),
		};
		const res = await call('https://mta-sts.example.com./.well-known/mta-sts.txt', 'GET', store);
		assert.equal(res.status, 200);
		const body = await res.text();
		const expectedBody = 'version: STSv1\r\nmode: enforce\r\nmx: mail.example.com\r\nmax_age: 604800\r\n';
		assert.equal(body, expectedBody);
	});

	it('invalid JSON returns 500', async () => {
		const store = {
			'example.com': 'not json',
		};
		const res = await call('https://mta-sts.example.com/.well-known/mta-sts.txt', 'GET', store);
		assert.equal(res.status, 500);
	});

	it('invalid mode returns 500', async () => {
		const store = {
			'example.com': JSON.stringify({
				mode: 'invalid',
				mx: ['mail.example.com'],
			}),
		};
		const res = await call('https://mta-sts.example.com/.well-known/mta-sts.txt', 'GET', store);
		assert.equal(res.status, 500);
	});

	it('mx not an array returns 500', async () => {
		const store = {
			'example.com': JSON.stringify({
				mode: 'enforce',
				mx: 'mail.example.com',
			}),
		};
		const res = await call('https://mta-sts.example.com/.well-known/mta-sts.txt', 'GET', store);
		assert.equal(res.status, 500);
	});

	it('empty mx with enforce mode returns 500', async () => {
		const store = {
			'example.com': JSON.stringify({
				mode: 'enforce',
				mx: [],
			}),
		};
		const res = await call('https://mta-sts.example.com/.well-known/mta-sts.txt', 'GET', store);
		assert.equal(res.status, 500);
	});

	// 63 + 1 + 63 + 1 + 63 + 1 + 61 = 253 characters
	const longMx = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;

	it('mx entry of 253 characters returns 200', async () => {
		const store = {
			'example.com': JSON.stringify({
				mode: 'enforce',
				mx: [longMx, `*.${longMx}`],
			}),
		};
		const res = await call('https://mta-sts.example.com/.well-known/mta-sts.txt', 'GET', store);
		assert.equal(res.status, 200);
	});

	it('mx entry of 254 characters returns 500', async () => {
		const store = {
			'example.com': JSON.stringify({
				mode: 'enforce',
				mx: [`${longMx}e`],
			}),
		};
		const res = await call('https://mta-sts.example.com/.well-known/mta-sts.txt', 'GET', store);
		assert.equal(res.status, 500);
	});

	it('mx entry containing newline returns 500', async () => {
		const store = {
			'example.com': JSON.stringify({
				mode: 'enforce',
				mx: ['mail.example.com\nmode: none'],
			}),
		};
		const res = await call('https://mta-sts.example.com/.well-known/mta-sts.txt', 'GET', store);
		assert.equal(res.status, 500);
	});

	it('max_age out of range returns 500', async () => {
		const store = {
			'example.com': JSON.stringify({
				mode: 'enforce',
				mx: ['mail.example.com'],
				max_age: 31557601,
			}),
		};
		const res = await call('https://mta-sts.example.com/.well-known/mta-sts.txt', 'GET', store);
		assert.equal(res.status, 500);
	});

	it('non-integer max_age returns 500', async () => {
		const store = {
			'example.com': JSON.stringify({
				mode: 'enforce',
				mx: ['mail.example.com'],
				max_age: 1.5,
			}),
		};
		const res = await call('https://mta-sts.example.com/.well-known/mta-sts.txt', 'GET', store);
		assert.equal(res.status, 500);
	});
});
