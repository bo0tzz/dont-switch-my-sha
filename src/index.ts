import { handleWebhook } from './webhook.js';
import { getHomepage } from './homepage.js';
import type { Env } from './types.js';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(getHomepage(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    if (request.method === 'POST' && url.pathname === '/') {
      return handleWebhook(request, env);
    }

    return new Response('Not found', { status: 404 });
  },
};
