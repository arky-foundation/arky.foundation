/**
 * Strict JSON parsing for Arky.
 *
 * Canonicalization §3 requires duplicate object member names to be REJECTED.
 * `JSON.parse` silently keeps the last duplicate, so a caller that wants the
 * spec's guarantee must parse untrusted JSON through `parseStrict`, which
 * throws on any duplicate key at any depth before the value is ever used.
 *
 * This is a small recursive-descent JSON parser (RFC 8259) rather than a
 * `JSON.parse` reviver, because a reviver only runs after duplicates have
 * already been collapsed and cannot detect them.
 */

class StrictParser {
  private i = 0;
  constructor(private readonly s: string) {}

  parse(): unknown {
    this.ws();
    const v = this.value();
    this.ws();
    if (this.i !== this.s.length) this.fail('trailing characters');
    return v;
  }

  private fail(msg: string): never {
    throw new SyntaxError(`parseStrict: ${msg} at position ${this.i}`);
  }

  private ws(): void {
    while (this.i < this.s.length) {
      const c = this.s[this.i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') this.i++;
      else break;
    }
  }

  private value(): unknown {
    const c = this.s[this.i];
    if (c === '{') return this.object();
    if (c === '[') return this.array();
    if (c === '"') return this.string();
    if (c === '-' || (c >= '0' && c <= '9')) return this.number();
    if (this.s.startsWith('true', this.i)) {
      this.i += 4;
      return true;
    }
    if (this.s.startsWith('false', this.i)) {
      this.i += 5;
      return false;
    }
    if (this.s.startsWith('null', this.i)) {
      this.i += 4;
      return null;
    }
    this.fail('unexpected token');
  }

  private object(): Record<string, unknown> {
    this.i++; // '{'
    const obj: Record<string, unknown> = {};
    const seen = new Set<string>();
    this.ws();
    if (this.s[this.i] === '}') {
      this.i++;
      return obj;
    }
    for (;;) {
      this.ws();
      if (this.s[this.i] !== '"') this.fail('expected object key');
      const key = this.string();
      if (seen.has(key)) this.fail(`duplicate key ${JSON.stringify(key)}`);
      seen.add(key);
      this.ws();
      if (this.s[this.i] !== ':') this.fail("expected ':'");
      this.i++;
      this.ws();
      obj[key] = this.value();
      this.ws();
      const ch = this.s[this.i];
      if (ch === ',') {
        this.i++;
        continue;
      }
      if (ch === '}') {
        this.i++;
        return obj;
      }
      this.fail("expected ',' or '}'");
    }
  }

  private array(): unknown[] {
    this.i++; // '['
    const arr: unknown[] = [];
    this.ws();
    if (this.s[this.i] === ']') {
      this.i++;
      return arr;
    }
    for (;;) {
      this.ws();
      arr.push(this.value());
      this.ws();
      const ch = this.s[this.i];
      if (ch === ',') {
        this.i++;
        continue;
      }
      if (ch === ']') {
        this.i++;
        return arr;
      }
      this.fail("expected ',' or ']'");
    }
  }

  private string(): string {
    // Delegate the actual unescaping to JSON.parse on the isolated literal,
    // after locating its bounds — this keeps escape handling spec-exact.
    const start = this.i;
    this.i++; // opening quote
    while (this.i < this.s.length) {
      const c = this.s[this.i];
      if (c === '\\') {
        this.i += 2;
        continue;
      }
      if (c === '"') {
        this.i++;
        return JSON.parse(this.s.slice(start, this.i)) as string;
      }
      this.i++;
    }
    this.fail('unterminated string');
  }

  private number(): number {
    const start = this.i;
    if (this.s[this.i] === '-') this.i++;
    while (this.i < this.s.length && /[0-9.eE+-]/.test(this.s[this.i])) this.i++;
    const lit = this.s.slice(start, this.i);
    const n = Number(lit);
    if (Number.isNaN(n)) this.fail(`bad number ${JSON.stringify(lit)}`);
    return n;
  }
}

/**
 * Parse JSON, rejecting any object with a duplicate member name at any depth
 * (Canonicalization §3). Throws `SyntaxError` on duplicate keys or malformed
 * input. Use this for untrusted JSON before canonicalizing/verifying.
 */
export function parseStrict(json: string): unknown {
  return new StrictParser(json).parse();
}
