import source from '../../webhooks.js?raw';

export type HttpCall = { url: string; headers: Record<string, string>; payload: string; handler: string };
export type HttpResponse = { code?: number; isSuccess?: boolean; exception?: string };

/**
 * Runs webhooks.js (a YouTrack CommonJS module) with a stub of the YouTrack http module.
 * `calls` records every POST. postSync returns `respond(url)`; for postAsync, the test calls the named handler
 * with `respond(url)` as ctx.response.
 */
export function loadWebhooks(respond: (url: string) => HttpResponse = () => ({code: 200, isSuccess: true})) {
  const calls: HttpCall[] = [];

  class Connection {
    headers: Record<string, string> = {};

    constructor(public url: string) {}

    addHeader(name: string, value: string) {
      this.headers[name] = value;
    }

    bearerAuth(token: string) {
      this.headers.Authorization = 'Bearer ' + token;
    }

    postSync(_uri: string, _query: unknown, payload: string) {
      calls.push({url: this.url, headers: this.headers, payload, handler: ''});
      return respond(this.url);
    }

    postAsync(_uri: string, _query: unknown, payload: string, handler: string) {
      calls.push({url: this.url, headers: this.headers, payload, handler});
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moduleExports: Record<string, any> = {};
  // eslint-disable-next-line no-new-func
  new Function('require', 'exports', source)(() => ({Connection}), moduleExports);
  return {webhooks: moduleExports, calls, respond};
}
