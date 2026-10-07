function headersToObject(headers) {
  const result = {};
  for (const [name, value] of headers.entries()) {
    result[name.toLowerCase()] = value;
  }
  return result;
}

async function readBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;

  const text = await request.text();
  if (!text) return undefined;

  const contentType = request.headers.get('content-type') || '';
  if (contentType.toLowerCase().includes('application/json')) {
    try { return JSON.parse(text); } catch { return {}; }
  }

  return text;
}

function createResponseShim() {
  let statusCode = 200;
  let body;
  let hasBody = false;
  const headers = new Headers();

  const res = {
    setHeader(name, value) {
      if (Array.isArray(value)) {
        headers.delete(name);
        for (const entry of value) headers.append(name, String(entry));
      } else {
        headers.set(name, String(value));
      }
      return res;
    },

    status(code) {
      statusCode = Number(code);
      return res;
    },

    json(value) {
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json; charset=utf-8');
      }
      body = JSON.stringify(value);
      hasBody = true;
      return res;
    },

    send(value) {
      body = value == null ? '' : String(value);
      hasBody = true;
      return res;
    },

    end() {
      hasBody = false;
      body = undefined;
      return res;
    },
  };

  return {
    res,
    build() {
      return new Response(hasBody ? body : null, {
        status: statusCode,
        headers,
      });
    },
  };
}

export async function invokeVercelHandler(handler, request, runtimeEnv = undefined) {
  if (typeof handler !== 'function') throw new Error('CLOUDFLARE_HANDLER_REQUIRED');
  if (!(request instanceof Request)) throw new Error('CLOUDFLARE_REQUEST_REQUIRED');

  const req = {
    method: request.method,
    headers: headersToObject(request.headers),
    body: await readBody(request),
    url: request.url,
    env: runtimeEnv,
  };

  const response = createResponseShim();
  const result = await handler(req, response.res);

  if (result instanceof Response) return result;
  return response.build();
}
