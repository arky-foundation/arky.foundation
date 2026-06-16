/**
 * RFC 8785 JSON Canonicalization Scheme (JCS), per ARKY-TIM-Canonicalization-v1.
 *
 * Clean-room implementation from the spec (not shared with the repo tooling):
 *   - object member names sorted by UTF-16 code units (§3 item 1)
 *   - no insignificant whitespace
 *   - finite numbers only; JS Number.prototype formatting matches JCS for the
 *     value ranges Arky uses (integers and short decimals)
 *   - rejects NaN / Infinity (§3 item 5)
 */

/** Serialize a value to its JCS canonical string. */
export function canonicalize(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return serializeNumber(value);
  if (typeof value === 'string') return serializeString(value);
  if (Array.isArray(value)) return '[' + value.map(serialize).join(',') + ']';
  if (typeof value === 'object') return serializeObject(value as Record<string, unknown>);
  throw new TypeError(`JCS: unsupported value of type ${typeof value}`);
}

function serializeNumber(n: number): string {
  if (!Number.isFinite(n)) throw new RangeError('JCS: non-finite numbers are forbidden');
  // JCS forbids -0; normalize to 0.
  if (Object.is(n, -0)) return '0';
  return String(n);
}

/** RFC 8785 §3.2.2.2 string escaping (the JSON minimal-escape set). */
function serializeString(s: string): string {
  let out = '"';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    switch (ch) {
      case '"': out += '\\"'; break;
      case '\\': out += '\\\\'; break;
      case '\b': out += '\\b'; break;
      case '\f': out += '\\f'; break;
      case '\n': out += '\\n'; break;
      case '\r': out += '\\r'; break;
      case '\t': out += '\\t'; break;
      default:
        if (code < 0x20) {
          out += '\\u' + code.toString(16).padStart(4, '0');
        } else {
          out += ch;
        }
    }
  }
  return out + '"';
}

function serializeObject(obj: Record<string, unknown>): string {
  // Sort keys by UTF-16 code units. JS string comparison is already UTF-16
  // code-unit lexicographic, which is exactly the RFC 8785 rule.
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  const parts: string[] = [];
  for (const k of keys) {
    parts.push(serializeString(k) + ':' + serialize(obj[k]));
  }
  return '{' + parts.join(',') + '}';
}
