/**
 * parseStrict — opt-in duplicate-key rejection (Canonicalization §3).
 */
import { test, expect, describe } from 'bun:test';
import { parseStrict } from '../src/index.ts';

describe('parseStrict (duplicate-key rejection)', () => {
  test('rejects a top-level duplicate key', () => {
    expect(() => parseStrict('{"a":1,"a":2}')).toThrow();
  });
  test('rejects a nested duplicate key', () => {
    expect(() => parseStrict('{"x":{"a":1,"a":2}}')).toThrow();
    expect(() => parseStrict('{"x":[{"a":1,"a":2}]}')).toThrow();
  });
  test('clean object round-trips equal to JSON.parse', () => {
    const src = '{"x":{"a":1,"b":2},"y":[1,2,3],"s":"hi","n":null,"b":true}';
    expect(parseStrict(src)).toEqual(JSON.parse(src));
  });
  test('handles escaped quotes in keys/values', () => {
    const src = '{"a\\"b":1,"c":"d\\"e"}';
    expect(parseStrict(src)).toEqual(JSON.parse(src));
  });
  test('distinct keys that share a prefix are allowed', () => {
    expect(() => parseStrict('{"a":1,"ab":2}')).not.toThrow();
  });
});
