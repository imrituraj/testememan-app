/**
 * TestMeMan Windows Assessment App - Assessment Service Layer
 * Interfaces with the TestMeMan backend API.
 * Provides a clean abstraction, real API integration, and an explicitly labeled Development Mock Adapter.
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const DEFAULT_PROD_URL = 'https://api.test.helpmeman.com';
const DEFAULT_DEV_URL = 'http://localhost:8787';

class AssessmentService {
  constructor(options = {}) {
    this.env = process.env.TESTMEMAN_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'development');
    this.baseUrl = process.env.TESTMEMAN_API_URL || (this.env === 'production' ? DEFAULT_PROD_URL : DEFAULT_DEV_URL);
    this.forceMock = process.env.MOCK_MODE === 'true' || options.forceMock === true;
    this.timeoutMs = options.timeoutMs || 8000;
  }

  isMockMode() {
    return this.forceMock;
  }

  setBaseUrl(url) {
    this.baseUrl = url;
  }

  setForceMock(enabled) {
    if (this.env === 'production' && enabled) {
      throw new Error('Cannot enable mock mode in production environment');
    }
    this.forceMock = !!enabled;
  }

  async _request(endpoint, method = 'GET', data = null, headers = {}) {
    const fullUrl = new URL(endpoint, this.baseUrl);
    const isHttps = fullUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const requestHeaders = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'TestMeMan-Secure-Assessment-Windows/1.0.0',
      ...headers,
    };

    let bodyStr = null;
    if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
      bodyStr = JSON.stringify(data);
      requestHeaders['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    return new Promise((resolve, reject) => {
      const req = client.request(
        fullUrl,
        {
          method,
          headers: requestHeaders,
          timeout: this.timeoutMs,
        },
        (res) => {
          let chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            let parsed;
            try {
              parsed = raw ? JSON.parse(raw) : {};
            } catch (err) {
              parsed = { rawResponse: raw };
            }

            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ status: res.statusCode, data: parsed, headers: res.headers });
            } else {
              const err = new Error(parsed?.error || `HTTP ${res.statusCode}: ${res.statusMessage}`);
              err.statusCode = res.statusCode;
              err.response = parsed;
              reject(err);
            }
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        const err = new Error(`Connection to ${this.baseUrl} timed out after ${this.timeoutMs}ms`);
        err.code = 'ETIMEDOUT';
        reject(err);
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (bodyStr) {
        req.write(bodyStr);
      }
      req.end();
    });
  }

  async pingBackend() {
    if (this.forceMock) {
      return {
        reachable: true,
        isMock: true,
        latencyMs: 10,
        serverTime: new Date().toISOString(),
        timeDeltaMs: 0,
      };
    }

    const tStart = Date.now();
    try {
      const res = await this._request('/api/proctoring/settings', 'GET');
      const latencyMs = Date.now() - tStart;
      const serverDateHeader = res.headers['date'];
      const serverTime = serverDateHeader ? new Date(serverDateHeader).getTime() : Date.now();
      const timeDeltaMs = Math.abs(Date.now() - serverTime);

      return {
        reachable: true,
        isMock: false,
        latencyMs,
        serverTime: new Date(serverTime).toISOString(),
        timeDeltaMs,
      };
    } catch (err) {
      if (this.env !== 'production') {
        return {
          reachable: false,
          isMock: false,
          error: err.message,
          suggestion: 'Backend is unreachable. Start testmeman-backend or switch to Development Mock Adapter for offline testing.',
        };
      }
      return {
        reachable: false,
        isMock: false,
        error: err.message,
        suggestion: 'Please check your internet connection or firewall.',
      };
    }
  }

  async validateAssessment({ code, candidateId, candidateName }) {
    const cleanCode = (code || '').trim().toUpperCase();
    const cleanCandId = (candidateId || '').trim();
    const cleanCandName = (candidateName || '').trim();

    if (!cleanCode) {
      throw new Error('Assessment Access Code is required');
    }
    if (!cleanCandId) {
      throw new Error('Candidate ID / Roll Number is required');
    }
    if (!cleanCandName) {
      throw new Error('Candidate Full Name is required');
    }

    if (this.forceMock) {
      return this._getMockAssessmentValidation(cleanCode, cleanCandId, cleanCandName);
    }

    try {
      const res = await this._request(`/api/oa/verify/${encodeURIComponent(cleanCode)}`, 'GET');
      if (res.data && res.data.valid) {
        return {
          valid: true,
          isMock: false,
          assessment: res.data.assessment,
          candidate: { id: cleanCandId, name: cleanCandName },
          authorizedAt: new Date().toISOString(),
        };
      } else {
        throw new Error(res.data?.error || 'Invalid or expired assessment code');
      }
    } catch (err) {
      if (this.env !== 'production' && (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT')) {
        console.warn('[AssessmentService] Backend unavailable, using labeled dev mock adapter');
        return this._getMockAssessmentValidation(cleanCode, cleanCandId, cleanCandName);
      }
      throw err;
    }
  }

  async startAttempt({ code, candidateId, candidateName }) {
    const validation = await this.validateAssessment({ code, candidateId, candidateName });
    const attemptId = `TMM-${code}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`.toUpperCase();

    return {
      attemptId,
      code,
      candidate: { id: candidateId, name: candidateName },
      title: validation.assessment.title,
      company: validation.assessment.company,
      durationMinutes: validation.assessment.durationMinutes || 45,
      sections: validation.assessment.sections || this._getDefaultSectionsForExam(code),
      isMock: validation.isMock,
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (validation.assessment.durationMinutes || 45) * 60 * 1000).toISOString(),
    };
  }

  async saveAnswers({ attemptId, answers, answersSummary }) {
    if (this.forceMock) {
      return { success: true, isMock: true, savedAt: new Date().toISOString() };
    }

    try {
      await this._request('/api/oa/log-integrity', 'POST', {
        attemptId,
        type: 'ANSWER_HEARTBEAT',
        timestamp: new Date().toISOString(),
        answersSummary,
      });
      return { success: true, isMock: false, savedAt: new Date().toISOString() };
    } catch (err) {
      return { success: false, error: err.message, localAuthoritative: true };
    }
  }

  async submitAttempt({ attemptId, code, candidateId, candidateName, answers, timeTakenSeconds, submitReason, integritySummary, localScoreData }) {
    if (this.forceMock) {
      return this._getMockSubmissionResult({
        attemptId,
        code,
        candidateId,
        candidateName,
        answers,
        timeTakenSeconds,
        submitReason,
        integritySummary,
        localScoreData,
      });
    }

    try {
      const payload = {
        attemptId,
        code,
        candidateName,
        candidateId,
        timeTakenSeconds,
        submitReason: submitReason || 'NORMAL_SUBMISSION',
        integrity: {
          warnings: integritySummary?.warnings || 0,
          violations: integritySummary?.violations || 0,
          locked: true,
          events: integritySummary?.events || [],
        },
        answersCount: Object.keys(answers || {}).length,
        answers,
      };

      const res = await this._request('/api/oa/submit', 'POST', payload);
      const receiptId = res.data?.receiptId || `OA-RCPT-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

      return {
        success: true,
        isMock: false,
        receiptId,
        submittedAt: res.data?.receivedAt || new Date().toISOString(),
        attemptId,
        verifiedScore: localScoreData,
      };
    } catch (err) {
      if (this.env !== 'production') {
        console.warn('[AssessmentService] Submit failed on network, using dev mock receipt');
        return this._getMockSubmissionResult({
          attemptId,
          code,
          candidateId,
          candidateName,
          answers,
          timeTakenSeconds,
          submitReason,
          integritySummary,
          localScoreData,
        });
      }
      throw err;
    }
  }

  async recordIntegrityEvent(attemptId, event) {
    if (this.forceMock) return { ok: true, isMock: true };
    try {
      await this._request('/api/oa/log-integrity', 'POST', {
        attemptId,
        event,
        timestamp: new Date().toISOString(),
      });
      return { ok: true, isMock: false };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  _getMockAssessmentValidation(code, candidateId, candidateName) {
    const knownPresets = {
      'TCS-NQT-2026': { title: 'TCS NQT 2026 — Master Placement Assessment', company: 'Tata Consultancy Services', durationMinutes: 45 },
      'INF-DSE-2026': { title: 'Infosys Specialist Programmer & DSE Assessment', company: 'Infosys Limited', durationMinutes: 60 },
      'COG-GENC-2026': { title: 'Cognizant GenC Elevate Assessment', company: 'Cognizant', durationMinutes: 40 },
      'ACC-ASE-2026': { title: 'Accenture Advanced ASE Assessment', company: 'Accenture', durationMinutes: 45 },
      'WIP-NLTH-2026': { title: 'Wipro Elite National Level Talent Hunt', company: 'Wipro Limited', durationMinutes: 45 },
    };

    const preset = knownPresets[code] || {
      title: `Corporate Assessment (${code})`,
      company: 'Corporate Placement Cell',
      durationMinutes: 40,
    };

    return {
      valid: true,
      isMock: true,
      assessment: {
        code,
        title: preset.title,
        company: preset.company,
        durationMinutes: preset.durationMinutes,
        sections: this._getDefaultSectionsForExam(code),
      },
      candidate: { id: candidateId, name: candidateName },
      authorizedAt: new Date().toISOString(),
      mockNote: 'DEVELOPMENT MOCK ADAPTER — Offline development and testing mode',
    };
  }

  _getMockSubmissionResult({ attemptId, code, candidateId, candidateName, timeTakenSeconds, submitReason, integritySummary, localScoreData }) {
    const receiptId = `MOCK-RCPT-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    return {
      success: true,
      isMock: true,
      receiptId,
      submittedAt: new Date().toISOString(),
      attemptId,
      submitReason,
      verifiedScore: localScoreData,
      mockNote: 'DEVELOPMENT MOCK ADAPTER — Verified locally for development verification',
    };
  }

  _getDefaultSectionsForExam(code) {
    return [
      {
        id: 'sec_num',
        name: 'Numerical Ability',
        questions: [
          {
            id: 'num_q1',
            type: 'single',
            text: 'A shopkeeper marks an item 40% above cost price and allows a 20% discount. What is his overall profit percentage?',
            options: ['12%', '14%', '15%', '20%'],
            marks: 2,
          },
          {
            id: 'num_q2',
            type: 'single',
            text: 'Two trains running in opposite directions cross a man standing on the platform in 27 seconds and 17 seconds respectively and cross each other in 23 seconds. What is the ratio of their speeds?',
            options: ['3 : 2', '2 : 3', '3 : 4', '1 : 3'],
            marks: 2,
          },
          {
            id: 'num_q3',
            type: 'single',
            text: 'If log10(x) + log10(x - 3) = 1, then what is the real value of x?',
            options: ['5', '-2', '2', '10'],
            marks: 2,
          },
        ],
      },
      {
        id: 'sec_reasoning',
        name: 'Reasoning Ability',
        questions: [
          {
            id: 'rea_q1',
            type: 'single',
            text: 'Pointing to a photograph of a boy, Suresh said, "He is the son of the only son of my mother." How is Suresh related to that boy?',
            options: ['Brother', 'Uncle', 'Father', 'Cousin'],
            marks: 2,
          },
          {
            id: 'rea_q2',
            type: 'single',
            text: 'Find the missing number in the sequence: 4, 18, 48, 100, 180, ?',
            options: ['294', '280', '312', '256'],
            marks: 2,
          },
        ],
      },
      {
        id: 'sec_verbal',
        name: 'Verbal Ability',
        questions: [
          {
            id: 'vbl_q1',
            type: 'single',
            text: 'Choose the word most nearly opposite in meaning to CANDID:',
            options: ['Guarded', 'Blunt', 'Honest', 'Sincere'],
            marks: 1,
          },
          {
            id: 'vbl_q2',
            type: 'single',
            text: 'Identify the error in the sentence: "Neither the manager nor the employees was present at the quarterly meeting."',
            options: ['Neither the manager', 'nor the employees', 'was present', 'at the quarterly meeting'],
            marks: 1,
          },
        ],
      },
    ];
  }
}

module.exports = { AssessmentService };
