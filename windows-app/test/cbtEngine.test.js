/**
 * Automated Tests: Windows CBTEngine & State Machine
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { CBTEngine, ASSESSMENT_STATE } = require('../src/renderer/js/cbtEngine');

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
  attemptId: 'WIN-TEST-ATTEMPT-001',
  durationMinutes: 45,
  sections: [
    {
      id: 'sec_1',
      name: 'Numerical Ability',
      questions: [
        { id: 'q1', text: 'What is 15 * 4?', options: ['45', '50', '60', '70'], correct: 2, marks: 2, type: 'single' },
        { id: 'q2', text: 'Select prime numbers', options: ['4', '5', '7', '9'], correct: [1, 2], marks: 3, type: 'multi' },
      ],
    },
    {
      id: 'sec_2',
      name: 'Reasoning Ability',
      questions: [
        { id: 'q3', text: 'Logical sequence question', options: ['A', 'B', 'C', 'D'], correct: 0, marks: 1, type: 'single' },
      ],
    },
  ],
};

describe('Windows CBTEngine Assessment Workflow', () => {
  it('initializes correctly with default state and timing', () => {
    const storage = createMockStorage();
    const engine = new CBTEngine(SAMPLE_CONFIG, {}, storage);

    assert.strictEqual(engine.state, ASSESSMENT_STATE.INITIALIZED);
    assert.strictEqual(engine.secondsRemaining, 45 * 60);
    assert.strictEqual(engine.currentSectionIdx, 0);
    assert.strictEqual(engine.currentQuestionIdx, 0);
  });

  it('navigates questions within and across sections', () => {
    const storage = createMockStorage();
    const engine = new CBTEngine(SAMPLE_CONFIG, {}, storage);

    assert.strictEqual(engine.getCurrentQuestion().id, 'q1');

    const moved1 = engine.nextQuestion();
    assert.strictEqual(moved1, true);
    assert.strictEqual(engine.getCurrentQuestion().id, 'q2');

    const moved2 = engine.nextQuestion();
    assert.strictEqual(moved2, true);
    assert.strictEqual(engine.currentSectionIdx, 1);
    assert.strictEqual(engine.getCurrentQuestion().id, 'q3');

    const moved3 = engine.nextQuestion();
    assert.strictEqual(moved3, false);

    const back1 = engine.prevQuestion();
    assert.strictEqual(back1, true);
    assert.strictEqual(engine.currentSectionIdx, 0);
    assert.strictEqual(engine.getCurrentQuestion().id, 'q2');
  });

  it('handles single-choice and multi-choice answers correctly', () => {
    const storage = createMockStorage();
    const engine = new CBTEngine(SAMPLE_CONFIG, {}, storage);
    engine.startTimer();

    engine.selectOption(2);
    assert.deepStrictEqual(engine.answers['q1'].selectedOptions, [2]);

    engine.nextQuestion();
    engine.selectOption(1);
    engine.selectOption(2);
    assert.deepStrictEqual(engine.answers['q2'].selectedOptions, [1, 2]);

    engine.selectOption(1);
    assert.deepStrictEqual(engine.answers['q2'].selectedOptions, [2]);

    engine.stopTimer();
  });

  it('persists answers and recovers gracefully after crash/reload', () => {
    const storage = createMockStorage();

    const engine1 = new CBTEngine(SAMPLE_CONFIG, {}, storage);
    engine1.startTimer();
    engine1.selectOption(2);
    engine1.nextQuestion();
    engine1.selectOption(1);
    engine1.selectOption(2);
    engine1.toggleMarkForReview();
    engine1.secondsRemaining = 1800;
    engine1.persistLocalState();
    engine1.stopTimer();

    const engine2 = new CBTEngine(SAMPLE_CONFIG, {}, storage);
    assert.deepStrictEqual(engine2.answers['q1'].selectedOptions, [2]);
    assert.deepStrictEqual(engine2.answers['q2'].selectedOptions, [1, 2]);
    assert.strictEqual(engine2.markedForReview.has('q2'), true);
    assert.strictEqual(engine2.secondsRemaining, 1800);
  });

  it('computes accurate attempt summaries and score results', () => {
    const storage = createMockStorage();
    const engine = new CBTEngine(SAMPLE_CONFIG, {}, storage);
    engine.startTimer();

    engine.selectOption(2); // q1 correct
    engine.nextQuestion();
    engine.selectOption(1);
    engine.selectOption(2); // q2 correct
    engine.nextQuestion();  // q3 unattempted

    const summary = engine.getAttemptSummary();
    assert.strictEqual(summary.totalQuestions, 3);
    assert.strictEqual(summary.answered, 2);
    assert.strictEqual(summary.unanswered, 1);

    const result = engine.calculateResult();
    assert.strictEqual(result.totalQuestions, 3);
    assert.strictEqual(result.attempted, 2);
    assert.strictEqual(result.correct, 2);
    assert.strictEqual(result.totalScore, 5);
    assert.strictEqual(result.maxScore, 6);
    assert.strictEqual(result.passed, true);

    engine.stopTimer();
  });
});
