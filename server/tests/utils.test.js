/**
 * Unit tests for pure utility functions.
 * Run with: node --test tests/utils.test.js
 * Requires Node 18+ (uses built-in node:test runner — no extra deps needed).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ─── distributeQuestions ──────────────────────────────────────────────────────
// Import the named export directly (no DB/env dependencies in this function)
import { distributeQuestions } from '../agents/mockTestGeneratorAgent.js';

describe('distributeQuestions', () => {
  test('total question count matches requested amount', () => {
    const result = distributeQuestions(10, ['mcq', 'coding', 'typing']);
    const total = Object.values(result).reduce((a, b) => a + b, 0);
    assert.equal(total, 10);
  });

  test('only mcq type fills technical_mcq and aptitude_mcq', () => {
    const result = distributeQuestions(6, ['mcq']);
    assert.equal(result.coding, 0);
    assert.equal(result.technical_conceptual, 0);
    assert.equal(result.hr_behavioral, 0);
    assert.ok(result.technical_mcq + result.aptitude_mcq === 6);
  });

  test('only coding type fills coding bucket', () => {
    const result = distributeQuestions(5, ['coding']);
    assert.equal(result.coding, 5);
    assert.equal(result.technical_mcq, 0);
    assert.equal(result.aptitude_mcq, 0);
  });

  test('only typing type fills technical_conceptual and hr_behavioral', () => {
    const result = distributeQuestions(4, ['typing']);
    assert.equal(result.coding, 0);
    assert.equal(result.technical_mcq, 0);
    assert.equal(result.aptitude_mcq, 0);
    assert.ok(result.technical_conceptual + result.hr_behavioral === 4);
  });

  test('mcq ratio: roughly 2:1 technical to aptitude', () => {
    const result = distributeQuestions(9, ['mcq']);
    // 9 mcqs → 6 technical_mcq, 3 aptitude_mcq (2:1 ratio)
    assert.equal(result.technical_mcq, 6);
    assert.equal(result.aptitude_mcq, 3);
  });

  test('empty selectedTypes defaults to mcq + typing + coding', () => {
    const result = distributeQuestions(9, []);
    const total = Object.values(result).reduce((a, b) => a + b, 0);
    assert.equal(total, 9);
  });

  test('returns zero counts for unused categories', () => {
    const result = distributeQuestions(3, ['coding']);
    assert.equal(result.technical_mcq, 0);
    assert.equal(result.aptitude_mcq, 0);
    assert.equal(result.technical_conceptual, 0);
    assert.equal(result.hr_behavioral, 0);
  });
});

// ─── skillsMatch ─────────────────────────────────────────────────────────────
// skillsMatch is not exported — test the normalisation logic directly via a
// local reimplementation that mirrors the source exactly.
const skillsMatch = (skillA, skillB) => {
  const normalize = (s) => {
    if (!s) return '';
    let val = s.toLowerCase().trim();
    if (val.endsWith('.js')) {
      val = val.slice(0, -3);
    } else if (val.endsWith('js') && val !== 'javascript' && val.length > 2) {
      val = val.slice(0, -2);
    }
    return val.replace(/[\s\-\/]/g, '');
  };
  const partsA = skillA.split(/[\/&,]/).map(normalize).filter(Boolean);
  const partsB = skillB.split(/[\/&,]/).map(normalize).filter(Boolean);
  for (const a of partsA) {
    for (const b of partsB) {
      if (a === b) return true;
    }
  }
  return false;
};

describe('skillsMatch', () => {
  test('exact match', () => {
    assert.ok(skillsMatch('Python', 'python'));
  });

  test('case-insensitive', () => {
    assert.ok(skillsMatch('ReactJS', 'reactjs'));
  });

  test('.js suffix stripped — react.js matches react', () => {
    assert.ok(skillsMatch('react.js', 'react'));
  });

  test('js suffix stripped — nodejs matches node', () => {
    assert.ok(skillsMatch('nodejs', 'node'));
  });

  test('"javascript" is NOT stripped (special case)', () => {
    assert.ok(!skillsMatch('javascript', 'java'));
  });

  test('whitespace stripped — "machine learning" matches "machinelearning"', () => {
    assert.ok(skillsMatch('machine learning', 'machinelearning'));
  });

  test('hyphen stripped — "ci-cd" matches "cicd"', () => {
    assert.ok(skillsMatch('ci-cd', 'cicd'));
  });

  test('slash-separated multi-skill — "html/css" matches "css"', () => {
    assert.ok(skillsMatch('html/css', 'css'));
  });

  test('no match between unrelated skills', () => {
    assert.ok(!skillsMatch('Python', 'Java'));
  });

  test('empty string does not crash', () => {
    assert.ok(!skillsMatch('', 'python'));
    assert.ok(!skillsMatch('python', ''));
  });
});
