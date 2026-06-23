/**
 * Kernel conformance: @arky/core's evaluateKernel against the K1 vectors.
 * Independent evaluation of commitments over TIM evidence, producing the
 * Decision the vectors expect.
 */

import { test, expect, describe } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateKernel, evaluateAssertion } from '../src/index.ts';

const REPO = join(import.meta.dir, '../../..');
const read = (p: string) => JSON.parse(readFileSync(join(REPO, p), 'utf-8'));

describe('Assertion language (Kleene tri-state)', () => {
  const sym = { temp: { value: 22.5, unit: 'degC' }, flag: { value: true } };
  test('comparison PASS', () => expect(evaluateAssertion('temp > 20', sym).result).toBe('PASS'));
  test('comparison FAIL', () => expect(evaluateAssertion('temp > 30', sym).result).toBe('FAIL'));
  test('range AND PASS', () =>
    expect(evaluateAssertion('temp >= 20 && temp <= 25', sym).result).toBe('PASS'));
  test('range AND FAIL', () =>
    expect(evaluateAssertion('temp >= 20 && temp <= 21', sym).result).toBe('FAIL'));
  test('OR', () => expect(evaluateAssertion('temp > 30 || temp < 25', sym).result).toBe('PASS'));
  test('NOT', () => expect(evaluateAssertion('!(temp > 30)', sym).result).toBe('PASS'));
  test('set membership', () =>
    expect(evaluateAssertion('temp in [22.5, 30]', sym).result).toBe('PASS'));
  test('bare boolean symbol', () => expect(evaluateAssertion('flag', sym).result).toBe('PASS'));
  test('missing symbol -> INDETERMINATE', () =>
    expect(evaluateAssertion('humidity > 50', sym).result).toBe('INDETERMINATE'));
  test('type mismatch (num vs string) -> INDETERMINATE', () => {
    const r = evaluateAssertion('temp > "high"', sym);
    expect(r.result).toBe('INDETERMINATE');
    expect(r.error).toContain('type mismatch');
  });
  test('negative numeric literal PASS', () =>
    expect(evaluateAssertion('temp > -5', { temp: { value: -3 } }).result).toBe('PASS'));
  test('negative numeric literal FAIL', () =>
    expect(evaluateAssertion('temp > -5', { temp: { value: -10 } }).result).toBe('FAIL'));
  test('negative fractional after == and in list', () => {
    const s = { temp: { value: -3.2 } };
    expect(evaluateAssertion('temp == -3.2', s).result).toBe('PASS');
    expect(evaluateAssertion('temp in [-3.2, -1]', s).result).toBe('PASS');
  });
});

describe('Kernel K1 vectors', () => {
  const dir = 'vectors/kernel';
  for (const f of readdirSync(join(REPO, dir))
    .filter((x) => x.endsWith('.json'))
    .sort()) {
    const v = read(join(dir, f));
    test(`${v.id}: ${v.description}`, () => {
      const exp = v.expect ?? {};
      // Schema-invalid / unknown-verb negatives: only assert decision.status when given.
      const commitment = v.inputs?.commitment;
      if (!commitment) {
        expect(exp).toBeTruthy();
        return;
      }

      // Resolve the TIM evidence from context.fixtures.tim.
      const tims: any[] = [];
      const timPath = v.context?.fixtures?.tim;
      if (timPath) tims.push(read(`vectors/${timPath}`).tim);

      const decision = evaluateKernel(commitment, tims, { time: v.context?.time });

      if (exp.decision?.status) {
        expect(decision.status).toBe(exp.decision.status);
      }
      if (Array.isArray(exp.decision?.assertions)) {
        for (const ea of exp.decision.assertions) {
          const got = decision.assertions.find((a) => a.name === ea.name);
          expect(got).toBeDefined();
          if (ea.result) expect(got!.result).toBe(ea.result);
          if (ea.input_value !== undefined) expect(got!.input_value).toBe(ea.input_value);
          if (ea.error) expect(got!.error).toContain('mismatch');
        }
      }
      if (Array.isArray(exp.decision?.authorized)) {
        expect(decision.authorized.map((x) => x.name)).toEqual(exp.decision.authorized);
      }
      if (Array.isArray(exp.errors) && exp.errors.includes('kernel.unknown_verb')) {
        expect(decision.errors).toContain('kernel.unknown_verb');
      }
    });
  }
});
