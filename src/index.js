export default {
	async fetch(request, env) {
		// only allow GET requests
		if (request.method != 'GET') {
			console.log(`Invalid request method: ${request.method}`);
			return emptyResponse(501);
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

		// determine domain name and lookup settings from KV
		const domainName = url.hostname.slice(prefix.length);
		console.log(`Domain: ${domainName}`);
		const domain = await env.KV_DOMAIN.get(domainName, { type: 'json' });
		if (!domain) {
			return emptyResponse(404);
		}

		// create response
		let body = `version: STSv1\nmode: ${domain.mode}\n`;
		domain.mx.forEach(function(mx) {
			body += `mx: ${mx}\n`;
		});
		body += 'max_age: 604800\n'
		return textResponse(body);
	}
}

function emptyResponse(status) {
	const options = { status: status }
	return new Response(null, options);	
}

function textResponse(body) {
	const options = { headers: { 'content-type': 'text/plain' } }
	return new Response(body, options);	
}
