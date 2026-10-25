export default {
	async fetch(request, env) {
		// only allow GET or HEAD
		if (request.method !== 'GET' && request.method !== 'HEAD') {
			console.log(`Invalid request method: ${request.method}`);
			const options = { status: 405, headers: { 'Allow': 'GET, HEAD' } };
			return new Response(null, options);
		}

		const prefix = 'mta-sts.';
		const url = new URL(request.url);

		// only allow hostnames starting with prefix (mta-sts.)
		if (!url.hostname.startsWith(prefix)) {
			console.log(`Invalid hostname: ${url.hostname}`);
			return emptyResponse(404);
		}

		// only allow path /.well-known/mta-sts.txt
		if (url.pathname !== '/.well-known/mta-sts.txt') {
			console.log(`Invalid request: ${url.pathname}`);
			return emptyResponse(404);
		}

		// strip ONE trailing dot if present
		let hostname = url.hostname;
		if (hostname.endsWith('.')) {
			hostname = hostname.slice(0, -1);
		}

		// determine domain name and lookup settings from KV
		const domainName = hostname.slice(prefix.length);
		console.log(`Domain: ${domainName}`);
		let domain;
		try {
			domain = await env.KV_DOMAIN.get(domainName, { type: 'json' });
		} catch (err) {
			console.error(`Domain ${domainName} KV parse error: ${err.message}`);
			return emptyResponse(500);
		}
		if (!domain) {
			return emptyResponse(404);
		}

		// validate domain policy
		const errMsg = validatePolicy(domain);
		if (errMsg) {
			console.error(`Domain ${domainName} validation error: ${errMsg}`);
			return emptyResponse(500);
		}

		// Build body
		const lines = [];
		lines.push('version: STSv1');
		lines.push(`mode: ${domain.mode}`);
		if (Array.isArray(domain.mx)) {
			for (const mxEntry of domain.mx) {
				lines.push(`mx: ${mxEntry}`);
			}
		}
		const maxAge = (typeof domain.max_age === 'number') ? domain.max_age : 604800;
		lines.push(`max_age: ${maxAge}`);
		const body = lines.join('\r\n') + '\r\n';

		if (request.method === 'HEAD') {
			const options = { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } };
			return new Response(null, options);
		}

		return textResponse(body);
	}
};

function emptyResponse(status) {
	const options = { status: status };
	return new Response(null, options);
}

function textResponse(body) {
	const options = { headers: { 'content-type': 'text/plain; charset=utf-8' } };
	return new Response(body, options);
}

// validation helper
const MX_PATTERN = /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/i;

function validatePolicy(domain) {
	if (typeof domain !== 'object' || domain === null || Array.isArray(domain)) {
		return 'policy is not a non-null object';
	}
	const mode = domain.mode;
	if (mode !== 'enforce' && mode !== 'testing' && mode !== 'none') {
		return 'invalid mode';
	}
	// mx may be omitted when mode is none
	const mx = (mode === 'none' && domain.mx === undefined) ? [] : domain.mx;
	if (!Array.isArray(mx)) {
		return 'mx is not an array';
	}
	if (mode !== 'none' && mx.length === 0) {
		return 'mx array is empty for mode not none';
	}
	for (const entry of mx) {
		if (typeof entry !== 'string') {
			return 'mx entry is not a string';
		}
		if (!MX_PATTERN.test(entry)) {
			return `mx entry "${entry}" does not match pattern`;
		}
	}
	if ('max_age' in domain) {
		const age = domain.max_age;
		if (!Number.isInteger(age)) {
			return 'max_age is not an integer';
		}
		if (age < 0 || age > 31557600) {
			return 'max_age out of range';
		}
	}
	return null;
}
