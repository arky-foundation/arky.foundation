/**
 * Assertion expression language per ARKY-KERNEL-v1 §4 / ARKY-ASSERTIONS-v1.
 *
 * Tri-valued (Kleene) result: PASS (true), FAIL (false), INDETERMINATE (cannot
 * evaluate — missing symbol, type/unit mismatch). Grammar (§4.1):
 *   Expr       := Comparison | LogicalExpr | "(" Expr ")"
 *   Comparison := Symbol Op Value | Symbol "in" "[" ValueList "]"
 *   LogicalExpr:= Expr ("&&" | "||") Expr | "!" Expr
 *   Op         := < <= > >= == !=
 */

export type TriState = 'PASS' | 'FAIL' | 'INDETERMINATE';

export interface Symbols {
  /** symbol name -> { value, unit? }; absent symbol => INDETERMINATE */
  [name: string]: { value: number | string | boolean; unit?: string } | undefined;
}

export interface EvalResult {
  result: TriState;
  error?: string;
}

// --- tokenizer ---

type Tok =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'sym'; v: string }
  | { t: 'op'; v: string }
  | { t: 'lparen' }
  | { t: 'rparen' }
  | { t: 'lbrack' }
  | { t: 'rbrack' }
  | { t: 'comma' }
  | { t: 'and' }
  | { t: 'or' }
  | { t: 'not' }
  | { t: 'in' };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const isSymStart = (c: string) => /[a-z_]/.test(c);
  const isSym = (c: string) => /[a-z0-9_]/.test(c);
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t') {
      i++;
      continue;
    }
    if (c === '(') {
      toks.push({ t: 'lparen' });
      i++;
      continue;
    }
    if (c === ')') {
      toks.push({ t: 'rparen' });
      i++;
      continue;
    }
    if (c === '[') {
      toks.push({ t: 'lbrack' });
      i++;
      continue;
    }
    if (c === ']') {
      toks.push({ t: 'rbrack' });
      i++;
      continue;
    }
    if (c === ',') {
      toks.push({ t: 'comma' });
      i++;
      continue;
    }
    if (c === '&' && src[i + 1] === '&') {
      toks.push({ t: 'and' });
      i += 2;
      continue;
    }
    if (c === '|' && src[i + 1] === '|') {
      toks.push({ t: 'or' });
      i += 2;
      continue;
    }
    if (c === '!' && src[i + 1] !== '=') {
      toks.push({ t: 'not' });
      i++;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== '"') s += src[j++];
      if (src[j] !== '"') throw new SyntaxError('unterminated string');
      toks.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (/[<>=!]/.test(c)) {
      const two = src.slice(i, i + 2);
      if (['<=', '>=', '==', '!='].includes(two)) {
        toks.push({ t: 'op', v: two });
        i += 2;
        continue;
      }
      if (c === '<' || c === '>') {
        toks.push({ t: 'op', v: c });
        i++;
        continue;
      }
      throw new SyntaxError(`bad operator near '${src.slice(i)}'`);
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      let n = '';
      while (j < src.length && /[0-9.]/.test(src[j])) n += src[j++];
      toks.push({ t: 'num', v: Number(n) });
      i = j;
      continue;
    }
    if (isSymStart(c)) {
      let j = i;
      let s = '';
      while (j < src.length && isSym(src[j])) s += src[j++];
      if (s === 'true') toks.push({ t: 'bool', v: true });
      else if (s === 'false') toks.push({ t: 'bool', v: false });
      else if (s === 'in') toks.push({ t: 'in' });
      else toks.push({ t: 'sym', v: s });
      i = j;
      continue;
    }
    throw new SyntaxError(`unexpected character '${c}'`);
  }
  return toks;
}

// --- parser -> AST ---

type Lit = { k: 'num'; v: number } | { k: 'str'; v: string } | { k: 'bool'; v: boolean };
type Ast =
  | { k: 'cmp'; sym: string; op: string; val: Lit }
  | { k: 'in'; sym: string; vals: Lit[] }
  | { k: 'and'; l: Ast; r: Ast }
  | { k: 'or'; l: Ast; r: Ast }
  | { k: 'not'; e: Ast }
  | { k: 'symref'; sym: string }; // bare boolean symbol (e.g. manual_override)

class Parser {
  constructor(
    private toks: Tok[],
    private pos = 0,
  ) {}
  peek(): Tok | undefined {
    return this.toks[this.pos];
  }
  next(): Tok {
    return this.toks[this.pos++];
  }

  parse(): Ast {
    const e = this.parseOr();
    if (this.pos !== this.toks.length) throw new SyntaxError('trailing tokens');
    return e;
  }
  parseOr(): Ast {
    let l = this.parseAnd();
    while (this.peek()?.t === 'or') {
      this.next();
      l = { k: 'or', l, r: this.parseAnd() };
    }
    return l;
  }
  parseAnd(): Ast {
    let l = this.parseUnary();
    while (this.peek()?.t === 'and') {
      this.next();
      l = { k: 'and', l, r: this.parseUnary() };
    }
    return l;
  }
  parseUnary(): Ast {
    if (this.peek()?.t === 'not') {
      this.next();
      return { k: 'not', e: this.parseUnary() };
    }
    return this.parsePrimary();
  }
  parsePrimary(): Ast {
    const tk = this.peek();
    if (tk?.t === 'lparen') {
      this.next();
      const e = this.parseOr();
      if (this.next().t !== 'rparen') throw new SyntaxError('expected )');
      return e;
    }
    if (tk?.t === 'sym') {
      this.next();
      const nx = this.peek();
      if (nx?.t === 'op') {
        const op = (this.next() as any).v;
        return { k: 'cmp', sym: tk.v, op, val: this.parseLit() };
      }
      if (nx?.t === 'in') {
        this.next();
        if (this.next().t !== 'lbrack') throw new SyntaxError('expected [');
        const vals: Lit[] = [this.parseLit()];
        while (this.peek()?.t === 'comma') {
          this.next();
          vals.push(this.parseLit());
        }
        if (this.next().t !== 'rbrack') throw new SyntaxError('expected ]');
        return { k: 'in', sym: tk.v, vals };
      }
      return { k: 'symref', sym: tk.v }; // bare boolean symbol
    }
    throw new SyntaxError('expected symbol or (');
  }
  parseLit(): Lit {
    const tk = this.next();
    if (tk.t === 'num') return { k: 'num', v: tk.v };
    if (tk.t === 'str') return { k: 'str', v: tk.v };
    if (tk.t === 'bool') return { k: 'bool', v: tk.v };
    throw new SyntaxError('expected literal');
  }
}

// --- Kleene logic over tri-state ---

function and3(a: TriState, b: TriState): TriState {
  if (a === 'FAIL' || b === 'FAIL') return 'FAIL';
  if (a === 'PASS' && b === 'PASS') return 'PASS';
  return 'INDETERMINATE';
}
function or3(a: TriState, b: TriState): TriState {
  if (a === 'PASS' || b === 'PASS') return 'PASS';
  if (a === 'FAIL' && b === 'FAIL') return 'FAIL';
  return 'INDETERMINATE';
}
function not3(a: TriState): TriState {
  if (a === 'PASS') return 'FAIL';
  if (a === 'FAIL') return 'PASS';
  return 'INDETERMINATE';
}
const bool = (b: boolean): TriState => (b ? 'PASS' : 'FAIL');

/** Evaluate a parsed assertion against bound symbols. Captures the first error. */
function evalAst(ast: Ast, symbols: Symbols, errs: string[]): TriState {
  switch (ast.k) {
    case 'and':
      return and3(evalAst(ast.l, symbols, errs), evalAst(ast.r, symbols, errs));
    case 'or':
      return or3(evalAst(ast.l, symbols, errs), evalAst(ast.r, symbols, errs));
    case 'not':
      return not3(evalAst(ast.e, symbols, errs));
    case 'symref': {
      const s = symbols[ast.sym];
      if (s === undefined) {
        errs.push(`no matching receipts for symbol '${ast.sym}'`);
        return 'INDETERMINATE';
      }
      if (typeof s.value === 'boolean') return bool(s.value);
      errs.push(`symbol '${ast.sym}' is not boolean`);
      return 'INDETERMINATE';
    }
    case 'in': {
      const s = symbols[ast.sym];
      if (s === undefined) {
        errs.push(`no matching receipts for symbol '${ast.sym}'`);
        return 'INDETERMINATE';
      }
      const match = ast.vals.some((l) => l.v === s.value);
      return bool(match);
    }
    case 'cmp': {
      const s = symbols[ast.sym];
      if (s === undefined) {
        errs.push(`no matching receipts for symbol '${ast.sym}'`);
        return 'INDETERMINATE';
      }
      const lit = ast.val;
      // Type compatibility (§4.1 coercion rules).
      if (typeof s.value === 'number' && lit.k !== 'num') {
        errs.push(
          'type mismatch: numeric symbol compared to ' +
            (lit.k === 'str' ? 'string' : 'boolean') +
            ' literal',
        );
        return 'INDETERMINATE';
      }
      if (typeof s.value === 'string' && lit.k !== 'str') {
        if (ast.op === '==' || ast.op === '!=') {
          /* allow */
        } else {
          errs.push('type mismatch: string symbol compared to non-string literal');
          return 'INDETERMINATE';
        }
      }
      return bool(compare(s.value, ast.op, lit.v));
    }
  }
}

function compare(a: unknown, op: string, b: unknown): boolean {
  switch (op) {
    case '==':
      return a === b;
    case '!=':
      return a !== b;
    case '<':
      return (a as number) < (b as number);
    case '<=':
      return (a as number) <= (b as number);
    case '>':
      return (a as number) > (b as number);
    case '>=':
      return (a as number) >= (b as number);
    default:
      throw new Error(`unknown op ${op}`);
  }
}

/** Parse + evaluate an assertion string to a tri-state result. */
export function evaluateAssertion(expr: string, symbols: Symbols): EvalResult {
  let ast: Ast;
  try {
    ast = new Parser(tokenize(expr)).parse();
  } catch (e) {
    return { result: 'INDETERMINATE', error: `parse error: ${(e as Error).message}` };
  }
  const errs: string[] = [];
  const result = evalAst(ast, symbols, errs);
  return { result, ...(result === 'INDETERMINATE' && errs.length ? { error: errs[0] } : {}) };
}
