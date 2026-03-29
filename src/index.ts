import { handleWebhook } from './webhook.js';
import { getHomepage } from './homepage.js';
import { log, type Env } from './types.js';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const response = await handleRequest(request, url, env);
    log({ event: 'request', method: request.method, path: url.pathname, status: response.status });
    return response;
  },
};

async function handleRequest(request: Request, url: URL, env: Env): Promise<Response> {
  if (request.method === 'GET' && url.pathname === '/') {
    return new Response(getHomepage(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  if (request.method === 'POST' && url.pathname === '/') {
    return handleWebhook(request, env);
  }

  return new Response('Not found', { status: 404 });
}
