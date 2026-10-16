/**
 * Automated Tests: CBTEngine & Assessment State Machine
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { CBTEngine, ASSESSMENT_STATE } = require('../src/renderer/js/cbtEngine');

// Mock localStorage adapter for node testing
function createMockStorage() {
  const store = {};
  return {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  };
}

const SAMPLE_CONFIG = {
  attemptId: 'TEST-ATTEMPT-001',
  durationMinutes: 30,
  sections: [
    {
      id: 'sec_1',
      name: 'Quantitative',
      questions: [
        { id: 'q1', text: 'What is 10 + 20?', options: ['10', '20', '30', '40'], correct: 2, marks: 2, type: 'single' },
        { id: 'q2', text: 'Select even numbers', options: ['1', '2', '3', '4'], correct: [1, 3], marks: 3, type: 'multi' },
      ],
    },
    {
      id: 'sec_2',
      name: 'Reasoning',
      questions: [
        { id: 'q3', text: 'Odd one out', options: ['Apple', 'Banana', 'Carrot', 'Airplane'], correct: 3, marks: 1, type: 'single' },
      ],
    },
  ],
};

describe('CBTEngine Assessment Workflow', () => {
  it('initializes correctly with default state and timing', () => {
    const storage = createMockStorage();
    const engine = new CBTEngine(SAMPLE_CONFIG, {}, storage);

    assert.strictEqual(engine.state, ASSESSMENT_STATE.INITIALIZED);
    assert.strictEqual(engine.secondsRemaining, 30 * 60);
    assert.strictEqual(engine.currentSectionIdx, 0);
    assert.strictEqual(engine.currentQuestionIdx, 0);
  });

  it('navigates questions within and across sections', () => {
    const storage = createMockStorage();
    const engine = new CBTEngine(SAMPLE_CONFIG, {}, storage);

    assert.strictEqual(engine.getCurrentQuestion().id, 'q1');

    // Next question in section 1
    const moved1 = engine.nextQuestion();
    assert.strictEqual(moved1, true);
    assert.strictEqual(engine.getCurrentQuestion().id, 'q2');

    // Next question crosses into section 2
    const moved2 = engine.nextQuestion();
    assert.strictEqual(moved2, true);
    assert.strictEqual(engine.currentSectionIdx, 1);
    assert.strictEqual(engine.getCurrentQuestion().id, 'q3');

    // End of exam returns false
    const moved3 = engine.nextQuestion();
    assert.strictEqual(moved3, false);

    // Prev moves backwards across section boundary
    const back1 = engine.prevQuestion();
    assert.strictEqual(back1, true);
    assert.strictEqual(engine.currentSectionIdx, 0);
    assert.strictEqual(engine.getCurrentQuestion().id, 'q2');
  });

  it('handles single-choice and multi-choice answers correctly', () => {
    const storage = createMockStorage();
    const engine = new CBTEngine(SAMPLE_CONFIG, {}, storage);
    engine.startTimer();

    // q1: single choice
    engine.selectOption(2); // Option '30'
    assert.deepStrictEqual(engine.answers['q1'].selectedOptions, [2]);

    // q2: multi choice
    engine.nextQuestion();
    engine.selectOption(1); // '2'
    engine.selectOption(3); // '4'
    assert.deepStrictEqual(engine.answers['q2'].selectedOptions, [1, 3]);

    // unselect option 1
    engine.selectOption(1);
    assert.deepStrictEqual(engine.answers['q2'].selectedOptions, [3]);

    // reselect option 1
    engine.selectOption(1);
    assert.deepStrictEqual(engine.answers['q2'].selectedOptions, [1, 3]);

    engine.stopTimer();
  });

  it('toggles mark for review and calculates question status', () => {
    const storage = createMockStorage();
    const engine = new CBTEngine(SAMPLE_CONFIG, {}, storage);
    engine.startTimer();

    // Initially unattempted & current
    let status = engine.getQuestionStatus(0, 0);
    assert.strictEqual(status.statusClass, 'unattempted');
    assert.strictEqual(status.isCurrent, true);

    // Answer question
    engine.selectOption(2);
    status = engine.getQuestionStatus(0, 0);
    assert.strictEqual(status.statusClass, 'answered');

    // Mark for review -> marked-answered
    engine.toggleMarkForReview();
    status = engine.getQuestionStatus(0, 0);
    assert.strictEqual(status.statusClass, 'marked-answered');

    // Unmark
    engine.toggleMarkForReview();
    status = engine.getQuestionStatus(0, 0);
    assert.strictEqual(status.statusClass, 'answered');

    engine.stopTimer();
  });

  it('persists answers and recovers gracefully after crash/reload', () => {
    const storage = createMockStorage();

    // Session 1: Candidate answers questions and time elapses
    const engine1 = new CBTEngine(SAMPLE_CONFIG, {}, storage);
    engine1.startTimer();
    engine1.selectOption(2); // answers q1
    engine1.nextQuestion();
    engine1.selectOption(1); // answers q2
    engine1.selectOption(3);
    engine1.toggleMarkForReview();
    engine1.secondsRemaining = 1200;
    engine1.persistLocalState();
    engine1.stopTimer();

    // Session 2: Simulates renderer reload or recovery
    const engine2 = new CBTEngine(SAMPLE_CONFIG, {}, storage);
    assert.deepStrictEqual(engine2.answers['q1'].selectedOptions, [2]);
    assert.deepStrictEqual(engine2.answers['q2'].selectedOptions, [1, 3]);
    assert.strictEqual(engine2.markedForReview.has('q2'), true);
    assert.strictEqual(engine2.secondsRemaining, 1200);
  });

  it('computes accurate attempt summaries and score results', () => {
    const storage = createMockStorage();
    const engine = new CBTEngine(SAMPLE_CONFIG, {}, storage);
    engine.startTimer();

    // Answer q1 correctly (correct: 2, marks: 2)
    engine.selectOption(2);
    // Answer q2 correctly (correct: [1, 3], marks: 3)
    engine.nextQuestion();
    engine.selectOption(1);
    engine.selectOption(3);
    // Leave q3 unattempted
    engine.nextQuestion();

    const summary = engine.getAttemptSummary();
    assert.strictEqual(summary.totalQuestions, 3);
    assert.strictEqual(summary.answered, 2);
    assert.strictEqual(summary.unanswered, 1);

    const result = engine.calculateResult();
    assert.strictEqual(result.totalQuestions, 3);
    assert.strictEqual(result.attempted, 2);
    assert.strictEqual(result.correct, 2);
    assert.strictEqual(result.totalScore, 5); // 2 + 3
    assert.strictEqual(result.maxScore, 6);   // 2 + 3 + 1
    assert.strictEqual(result.passed, true);

    engine.stopTimer();
  });
});
