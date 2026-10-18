/**
 * TestMeMan Secure Exam: backend client (main process).
 * All network calls go through here, so the renderer never needs network access or CORS.
 * Endpoints: testmeman-backend/src/secure-exams.ts (/api/app/*)
 */

const DEFAULT_API = 'https://testmeman-api.ritur-dev.workers.dev';

class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body || {};
  }
}

class ExamApi {
  constructor({ baseUrl, appVersion, timeoutMs = 15000 } = {}) {
    this.baseUrl = (baseUrl || process.env.TESTMEMAN_API_URL || DEFAULT_API).replace(/\/+$/, '');
    this.appVersion = appVersion || '0.0.0';
    this.timeoutMs = timeoutMs;
    this.token = null;
  }

  setToken(token) {
    this.token = token || null;
  }

  async request(path, { method = 'POST', body, auth = false } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-TestMeMan-App': this.appVersion,
    };
    if (auth && this.token) headers.Authorization = `Bearer ${this.token}`;
    let res;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      throw new ApiError(err.name === 'AbortError' ? 'The server took too long to respond.' : 'No internet connection.', 0, { code: 'NETWORK' });
    } finally {
      clearTimeout(timer);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data);
    return data;
  }

  async ping() {
    const t0 = Date.now();
    const res = await fetch(`${this.baseUrl}/health`, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { latencyMs: Date.now() - t0 };
  }

  verify(code) {
    return this.request('/api/app/verify', { body: { code } });
  }

  async start(code, device) {
    const data = await this.request('/api/app/session/start', { body: { code, device } });
    this.setToken(data.sessionToken);
    return data;
  }

  identity(payload) {
    return this.request('/api/app/session/identity', { body: payload, auth: true });
  }

  saveAnswers(answers) {
    return this.request('/api/app/session/answers', { body: { answers }, auth: true });
  }

  events(events, warnings) {
    return this.request('/api/app/session/events', { body: { events, warnings }, auth: true });
  }

  snapshot(payload) {
    return this.request('/api/app/session/snapshot', { body: payload, auth: true });
  }

  submit(answers, reason) {
    return this.request('/api/app/session/submit', { body: { answers, reason }, auth: true });
  }
}

module.exports = { ExamApi, ApiError, DEFAULT_API };
