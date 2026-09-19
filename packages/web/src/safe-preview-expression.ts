export type PreviewJsonish =
  | null
  | boolean
  | number
  | string
  | PreviewJsonish[]
  | { [key: string]: PreviewJsonish };

type Unknown = { kind: 'unknown'; label: string };
type Callable = { kind: 'callable'; call: (args: SafeValue[]) => SafeValue };
type SafeObject = { [key: string]: SafeValue };
type SafeValue =
  | null
  | boolean
  | number
  | string
  | RegExp
  | SafeValue[]
  | SafeObject
  | Unknown
  | Callable;

type FunctionDef = {
  name: string;
  params: string[];
  body: string;
  start: number;
  bodyStart: number;
  end: number;
};

type Runtime = {
  functions: Map<string, FunctionDef>;
  globals: Map<string, SafeValue>;
  depthLimit: number;
};

export type SafePreviewResolver = {
  resolve(expression: string): PreviewJsonish;
  resolveAt(expression: string, sourceIndex: number): PreviewJsonish;
  unresolved(): string[];
};

export const UNRESOLVED_PREVIEW_PREFIX = '__apx_live_unresolved__:';

const BT = String.fromCharCode(96);

function unknown(label: string): Unknown {
  return { kind: 'unknown', label };
}

function callable(call: (args: SafeValue[]) => SafeValue): Callable {
  return { kind: 'callable', call };
}

function isUnknown(value: SafeValue): value is Unknown {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof RegExp) &&
      (value as Unknown).kind === 'unknown',
  );
}

function isCallable(value: SafeValue): value is Callable {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof RegExp) &&
      (value as Callable).kind === 'callable',
  );
}

function isObject(value: SafeValue): value is SafeObject {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof RegExp) &&
      !isUnknown(value) &&
      !isCallable(value),
  );
}

function asNumber(value: SafeValue): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asBoolean(value: SafeValue): boolean {
  if (isUnknown(value)) return false;
  if (value instanceof RegExp || isCallable(value)) return true;
  return Boolean(value);
}

function asString(value: SafeValue): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  if (isUnknown(value)) return value.label;
  return '';
}

function firstUnknown(left: SafeValue, right?: SafeValue): Unknown | null {
  if (isUnknown(left)) return left;
  if (right !== undefined && isUnknown(right)) return right;
  return null;
}

function toJsonish(value: SafeValue, unresolved: Set<string>): PreviewJsonish {
  if (isUnknown(value)) {
    unresolved.add(value.label);
    return UNRESOLVED_PREVIEW_PREFIX + value.label;
  }
  if (value instanceof RegExp || isCallable(value)) return null;
  if (Array.isArray(value)) return value.map((item) => toJsonish(item, unresolved));
  if (isObject(value)) {
    const out: { [key: string]: PreviewJsonish } = {};
    for (const [key, item] of Object.entries(value)) out[key] = toJsonish(item, unresolved);
    return out;
  }
  return value;
}

function skipTrivia(source: string, start: number): number {
  let i = start;
  while (i < source.length) {
    if (/\s/.test(source[i])) {
      i += 1;
      continue;
    }
    if (source[i] === '/' && source[i + 1] === '/') {
      i += 2;
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (source[i] === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < source.length - 1 && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    break;
  }
  return i;
}

function findMatching(source: string, openAt: number, open: string, close: string): number {
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = openAt; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === BT) {
      quote = ch;
      continue;
    }

    if (ch === open) depth += 1;
    if (ch === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function readUntil(source: string, start: number, delimiters: Set<string>) {
  let paren = 0;
  let brace = 0;
  let bracket = 0;
  let quote = '';
  let escaped = false;

  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === BT) {
      quote = ch;
      continue;
    }

    if (ch === '(') paren += 1;
    else if (ch === ')') paren -= 1;
    else if (ch === '{') brace += 1;
    else if (ch === '}') brace -= 1;
    else if (ch === '[') bracket += 1;
    else if (ch === ']') bracket -= 1;

    if (paren === 0 && brace === 0 && bracket === 0 && delimiters.has(ch)) {
      return { text: source.slice(start, i).trim(), end: i };
    }
  }

  return { text: source.slice(start).trim(), end: source.length };
}

function splitTopLevel(source: string): string[] {
  const out: string[] = [];
  let start = 0;
  let paren = 0;
  let brace = 0;
  let bracket = 0;
  let quote = '';
  let escaped = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === BT) {
      quote = ch;
      continue;
    }
    if (ch === '(') paren += 1;
    else if (ch === ')') paren -= 1;
    else if (ch === '{') brace += 1;
    else if (ch === '}') brace -= 1;
    else if (ch === '[') bracket += 1;
    else if (ch === ']') bracket -= 1;
    else if (ch === ',' && paren === 0 && brace === 0 && bracket === 0) {
      out.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }

  out.push(source.slice(start).trim());
  return out.filter(Boolean);
}

function paramName(source: string): string {
  let value = source.trim().replace(/^\.\.\./, '');
  const equal = value.indexOf('=');
  if (equal >= 0) value = value.slice(0, equal);
  const colon = value.indexOf(':');
  if (colon >= 0) value = value.slice(0, colon);
  return value.trim().replace(/\?$/, '');
}

function collectFunctions(source: string): Map<string, FunctionDef> {
  const out = new Map<string, FunctionDef>();
  const re = /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(source))) {
    const open = source.indexOf('(', match.index);
    const close = findMatching(source, open, '(', ')');
    if (close < 0) continue;

    let bodyOpen = close + 1;
    while (bodyOpen < source.length && source[bodyOpen] !== '{') bodyOpen += 1;
    if (bodyOpen >= source.length) continue;

    const bodyClose = findMatching(source, bodyOpen, '{', '}');
    if (bodyClose < 0) continue;

    out.set(match[1], {
      name: match[1],
      params: splitTopLevel(source.slice(open + 1, close)).map(paramName).filter(Boolean),
      body: source.slice(bodyOpen + 1, bodyClose),
      start: match.index,
      bodyStart: bodyOpen + 1,
      end: bodyClose + 1,
    });
    re.lastIndex = bodyClose + 1;
  }

  return out;
}

function insideFunction(index: number, functions: Map<string, FunctionDef>) {
  for (const fn of functions.values()) if (index > fn.start && index < fn.end) return true;
  return false;
}

function builtins(): Map<string, SafeValue> {
  const env = new Map<string, SafeValue>();

  const math = (name: string, fn: (...values: number[]) => number) =>
    callable((args) => {
      const values = args.map(asNumber);
      if (values.some((value) => value === null)) return unknown('Math.' + name);
      return fn(...(values as number[]));
    });

  env.set('Math', {
    PI: Math.PI,
    E: Math.E,
    max: math('max', Math.max),
    min: math('min', Math.min),
    floor: math('floor', (value) => Math.floor(value)),
    ceil: math('ceil', (value) => Math.ceil(value)),
    round: math('round', (value) => Math.round(value)),
    abs: math('abs', (value) => Math.abs(value)),
  });
  env.set('Boolean', callable((args) => asBoolean(args[0] ?? null)));
  env.set('Number', callable((args) => asNumber(args[0] ?? null) ?? 0));
  env.set('String', callable((args) => asString(args[0] ?? '')));

  return env;
}

class Parser {
  private i = 0;

  constructor(
    private readonly source: string,
    private readonly env: Map<string, SafeValue>,
    private readonly runtime: Runtime,
    private readonly depth: number,
  ) {}

  parse(): SafeValue {
    const arrow = this.arrow();
    if (arrow) return arrow;
    return this.additive();
  }

  private arrow(): Callable | null {
    const source = this.source.trim();
    let paren = 0;
    let brace = 0;
    let bracket = 0;
    let quote = '';
    let escaped = false;
    let arrow = -1;

    for (let i = 0; i < source.length - 1; i += 1) {
      const ch = source[i];
      if (quote) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === quote) quote = '';
        continue;
      }
      if (ch === '"' || ch === "'" || ch === BT) {
        quote = ch;
        continue;
      }
      if (ch === '(') paren += 1;
      else if (ch === ')') paren -= 1;
      else if (ch === '{') brace += 1;
      else if (ch === '}') brace -= 1;
      else if (ch === '[') bracket += 1;
      else if (ch === ']') bracket -= 1;
      else if (ch === '=' && source[i + 1] === '>' && paren === 0 && brace === 0 && bracket === 0) {
        arrow = i;
        break;
      }
    }

    if (arrow < 0) return null;

    let rawParams = source.slice(0, arrow).trim();
    if (rawParams.startsWith('(') && rawParams.endsWith(')')) rawParams = rawParams.slice(1, -1);
    const params = splitTopLevel(rawParams).map(paramName).filter(Boolean);
    const body = source.slice(arrow + 2).trim();

    return callable((args) => {
      const local = new Map(this.env);
      params.forEach((name, index) => local.set(name, args[index] ?? null));
      if (body.startsWith('{') && body.endsWith('}')) {
        const result = execute(body.slice(1, -1), local, this.runtime, this.depth + 1);
        return result.returned ? result.value : null;
      }
      return new Parser(body, local, this.runtime, this.depth + 1).parse();
    });
  }

  private additive(): SafeValue {
    let left = this.multiplicative();
    while (true) {
      if (this.take('+')) {
        const right = this.multiplicative();
        const unresolved = firstUnknown(left, right);
        if (unresolved) left = unresolved;
        else if (typeof left === 'string' || typeof right === 'string') left = asString(left) + asString(right);
        else left = (asNumber(left) ?? 0) + (asNumber(right) ?? 0);
      } else if (this.take('-')) {
        const right = this.multiplicative();
        left = firstUnknown(left, right) ?? ((asNumber(left) ?? 0) - (asNumber(right) ?? 0));
      } else {
        return left;
      }
    }
  }

  private multiplicative(): SafeValue {
    let left = this.unary();
    while (true) {
      if (this.take('*')) {
        const right = this.unary();
        left = firstUnknown(left, right) ?? ((asNumber(left) ?? 0) * (asNumber(right) ?? 0));
      } else if (this.take('/')) {
        const right = this.unary();
        left = firstUnknown(left, right) ?? ((asNumber(left) ?? 0) / (asNumber(right) ?? 1));
      } else if (this.take('%')) {
        const right = this.unary();
        left = firstUnknown(left, right) ?? ((asNumber(left) ?? 0) % (asNumber(right) ?? 1));
      } else {
        return left;
      }
    }
  }

  private unary(): SafeValue {
    if (this.takeWord('await')) return this.unary();
    if (this.take('!')) return !asBoolean(this.unary());
    if (this.take('+')) {
      const value = this.unary();
      return isUnknown(value) ? value : asNumber(value) ?? 0;
    }
    if (this.take('-')) {
      const value = this.unary();
      return isUnknown(value) ? value : -(asNumber(value) ?? 0);
    }
    return this.postfix();
  }

  private postfix(): SafeValue {
    let value = this.primary();

    while (true) {
      this.skip();

      if (this.source[this.i] === '.') {
        this.i += 1;
        value = member(value, this.identifier());
        continue;
      }

      if (this.source[this.i] === '[') {
        this.i += 1;
        const key = this.additive();
        this.expect(']');
        value = member(value, asString(key));
        continue;
      }

      if (this.source[this.i] === '(') {
        const args = this.args();
        if (isCallable(value)) value = value.call(args);
        else if (!isUnknown(value)) value = unknown('unsupported call');
        continue;
      }

      return value;
    }
  }

  private args(): SafeValue[] {
    const values: SafeValue[] = [];
    this.expect('(');
    this.skip();

    while (this.i < this.source.length && this.source[this.i] !== ')') {
      const segment = this.argumentSegment();
      values.push(new Parser(segment.text, this.env, this.runtime, this.depth + 1).parse());
      this.i = segment.end;
      this.skip();
      if (this.source[this.i] === ',') {
        this.i += 1;
        this.skip();
        continue;
      }
      break;
    }

    this.expect(')');
    return values;
  }

  private argumentSegment() {
    const start = this.i;
    let paren = 0;
    let brace = 0;
    let bracket = 0;
    let quote = '';
    let escaped = false;
    let regex = false;

    for (let i = start; i < this.source.length; i += 1) {
      const ch = this.source[i];

      if (quote) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === quote) quote = '';
        continue;
      }
      if (regex) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '/') regex = false;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === BT) {
        quote = ch;
        continue;
      }
      if (ch === '/' && this.regexCanStart(i)) {
        regex = true;
        continue;
      }

      if (ch === '(') paren += 1;
      else if (ch === ')') {
        if (paren === 0 && brace === 0 && bracket === 0) {
          return { text: this.source.slice(start, i).trim(), end: i };
        }
        paren -= 1;
      } else if (ch === '{') brace += 1;
      else if (ch === '}') brace -= 1;
      else if (ch === '[') bracket += 1;
      else if (ch === ']') bracket -= 1;
      else if (ch === ',' && paren === 0 && brace === 0 && bracket === 0) {
        return { text: this.source.slice(start, i).trim(), end: i };
      }
    }

    return { text: this.source.slice(start).trim(), end: this.source.length };
  }

  private primary(): SafeValue {
    this.skip();
    const ch = this.source[this.i];

    if (ch === '{') return this.object();
    if (ch === '[') return this.array();
    if (ch === '"' || ch === "'" || ch === BT) return this.string();
    if (ch === '/' && this.regexCanStart(this.i)) return this.regex();
    if (ch === '(') {
      this.i += 1;
      const value = this.additive();
      this.expect(')');
      return value;
    }
    if (/[0-9.]/.test(ch ?? '')) return this.number();

    const id = this.identifier();
    if (!id) return unknown('expression');
    if (id === 'true') return true;
    if (id === 'false') return false;
    if (id === 'null' || id === 'undefined') return null;
    if (id === 'new') return unknown('new expression');
    return this.lookup(id);
  }

  private object(): SafeObject {
    const out: SafeObject = {};
    this.expect('{');
    this.skip();

    while (this.i < this.source.length && this.source[this.i] !== '}') {
      if (this.source.startsWith('...', this.i)) {
        this.i += 3;
        const value = this.additive();
        if (isObject(value)) Object.assign(out, value);
      } else {
        const ch = this.source[this.i];
        const key = ch === '"' || ch === "'" || ch === BT ? asString(this.string()) : this.identifier();
        this.skip();
        if (this.source[this.i] === ':') {
          this.i += 1;
          out[key] = this.additive();
        } else {
          out[key] = this.lookup(key);
        }
      }
      this.skip();
      if (this.source[this.i] === ',') {
        this.i += 1;
        this.skip();
        continue;
      }
      break;
    }

    this.expect('}');
    return out;
  }

  private array(): SafeValue[] {
    const out: SafeValue[] = [];
    this.expect('[');
    this.skip();

    while (this.i < this.source.length && this.source[this.i] !== ']') {
      if (this.source.startsWith('...', this.i)) {
        this.i += 3;
        const value = this.additive();
        if (Array.isArray(value)) out.push(...value);
      } else {
        out.push(this.additive());
      }
      this.skip();
      if (this.source[this.i] === ',') {
        this.i += 1;
        this.skip();
        continue;
      }
      break;
    }

    this.expect(']');
    return out;
  }

  private string(): string {
    const quote = this.source[this.i++];
    let out = '';

    while (this.i < this.source.length) {
      const ch = this.source[this.i++];
      if (ch === quote) return out;
      if (ch !== '\\') {
        out += ch;
        continue;
      }
      const next = this.source[this.i++];
      const escapes: Record<string, string> = {
        n: '\n',
        r: '\r',
        t: '\t',
        b: '\b',
        f: '\f',
        v: '\v',
        '0': '\0',
        '\\': '\\',
        '"': '"',
        "'": "'",
      };
      out += escapes[next] ?? next;
    }

    return out;
  }

  private regex(): RegExp | Unknown {
    this.expect('/');
    let body = '';
    let escaped = false;

    while (this.i < this.source.length) {
      const ch = this.source[this.i++];
      if (escaped) {
        body += '\\' + ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '/') {
        let flags = '';
        while (/[dgimsuvy]/.test(this.source[this.i] ?? '')) flags += this.source[this.i++];
        try {
          return new RegExp(body, flags);
        } catch {
          return unknown('regular expression');
        }
      }
      body += ch;
    }

    return unknown('regular expression');
  }

  private number(): number {
    const match = this.source.slice(this.i).match(/^(?:0x[\da-f]+|\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
    if (!match) return 0;
    this.i += match[0].length;
    return Number(match[0]);
  }

  private identifier(): string {
    this.skip();
    const match = this.source.slice(this.i).match(/^[A-Za-z_$][\w$]*/);
    if (!match) return '';
    this.i += match[0].length;
    return match[0];
  }

  private lookup(name: string): SafeValue {
    if (this.env.has(name)) return this.env.get(name) ?? null;
    if (this.runtime.globals.has(name)) return this.runtime.globals.get(name) ?? null;
    const fn = this.runtime.functions.get(name);
    if (fn) return callable((args) => runFunction(fn, args, this.env, this.runtime, this.depth + 1));
    return unknown(name);
  }

  private regexCanStart(index: number) {
    let i = index - 1;
    while (i >= 0 && /\s/.test(this.source[i])) i -= 1;
    return i < 0 || '([{:;,=!?&|'.includes(this.source[i]);
  }

  private take(token: string) {
    this.skip();
    if (!this.source.startsWith(token, this.i)) return false;
    this.i += token.length;
    return true;
  }

  private takeWord(word: string) {
    this.skip();
    if (!this.source.startsWith(word, this.i)) return false;
    const after = this.source[this.i + word.length];
    if (after && /[\w$]/.test(after)) return false;
    this.i += word.length;
    return true;
  }

  private expect(token: string) {
    this.skip();
    if (this.source.startsWith(token, this.i)) this.i += token.length;
  }

  private skip() {
    this.i = skipTrivia(this.source, this.i);
  }
}

function member(value: SafeValue, key: string): SafeValue {
  if (isUnknown(value)) return value;

  if (typeof value === 'string') {
    if (key === 'length') return value.length;
    if (key === 'trim') return callable(() => value.trim());
    if (key === 'toLowerCase') return callable(() => value.toLowerCase());
    if (key === 'toUpperCase') return callable(() => value.toUpperCase());
    if (key === 'split') {
      return callable((args) => {
        const separator = args[0];
        if (separator instanceof RegExp) return value.split(separator);
        if (separator === null || separator === undefined) return [value];
        return value.split(asString(separator));
      });
    }
    if (key === 'replace') {
      return callable((args) => {
        const pattern = args[0];
        const replacement = asString(args[1] ?? '');
        if (pattern instanceof RegExp) return value.replace(pattern, replacement);
        return value.replace(asString(pattern ?? ''), replacement);
      });
    }
  }

  if (Array.isArray(value)) {
    if (key === 'length') return value.length;
    if (key === 'map') {
      return callable((args) => {
        const fn = args[0];
        if (!isCallable(fn)) return unknown('Array.map callback');
        return value.map((entry, index) => fn.call([entry, index, value]));
      });
    }
    if (key === 'filter') {
      return callable((args) => {
        const fn = args[0];
        if (!isCallable(fn)) return unknown('Array.filter callback');
        return value.filter((entry, index) => asBoolean(fn.call([entry, index, value])));
      });
    }
    const index = Number(key);
    if (Number.isInteger(index)) return value[index] ?? null;
  }

  if (isObject(value)) return value[key] ?? null;
  return unknown(key || 'member');
}

type ExecuteResult = { returned: boolean; value: SafeValue };

function runFunction(
  fn: FunctionDef,
  args: SafeValue[],
  parent: Map<string, SafeValue>,
  runtime: Runtime,
  depth: number,
): SafeValue {
  if (depth > runtime.depthLimit) return unknown(fn.name + ' recursion');

  const env = new Map(runtime.globals);
  for (const [key, value] of parent.entries()) env.set(key, value);
  fn.params.forEach((name, index) => env.set(name, args[index] ?? null));

  const result = execute(fn.body, env, runtime, depth);
  return result.returned ? result.value : null;
}

function execute(body: string, env: Map<string, SafeValue>, runtime: Runtime, depth: number): ExecuteResult {
  if (depth > runtime.depthLimit) return { returned: true, value: unknown('function recursion') };

  let i = 0;

  while (i < body.length) {
    i = skipTrivia(body, i);
    if (i >= body.length) break;
    const rest = body.slice(i);

    const declaration = rest.match(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/);
    if (declaration) {
      const start = i + declaration[0].length;
      const statement = readUntil(body, start, new Set([';']));
      env.set(declaration[1], new Parser(statement.text, env, runtime, depth + 1).parse());
      i = statement.end < body.length ? statement.end + 1 : body.length;
      continue;
    }

    if (/^for\b/.test(rest)) {
      const open = body.indexOf('(', i);
      const close = open >= 0 ? findMatching(body, open, '(', ')') : -1;
      if (open < 0 || close < 0) break;

      const header = body.slice(open + 1, close).trim();
      const loop = header.match(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s+of\s+([\s\S]+)$/);
      const blockOpen = skipTrivia(body, close + 1);
      if (!loop || body[blockOpen] !== '{') {
        i = close + 1;
        continue;
      }

      const blockClose = findMatching(body, blockOpen, '{', '}');
      if (blockClose < 0) break;

      const iterable = new Parser(loop[2], env, runtime, depth + 1).parse();
      if (Array.isArray(iterable)) {
        for (const entry of iterable) {
          env.set(loop[1], entry);
          const result = execute(body.slice(blockOpen + 1, blockClose), env, runtime, depth + 1);
          if (result.returned) return result;
        }
      }

      i = blockClose + 1;
      continue;
    }

    if (/^return\b/.test(rest)) {
      const start = i + 6;
      const statement = readUntil(body, start, new Set([';']));
      return {
        returned: true,
        value: new Parser(statement.text, env, runtime, depth + 1).parse(),
      };
    }

    const assignment = rest.match(/^([A-Za-z_$][\w$]*)\s*(\+=|-=|\*=|\/=|=)/);
    if (assignment) {
      const start = i + assignment[0].length;
      const statement = readUntil(body, start, new Set([';']));
      const right = new Parser(statement.text, env, runtime, depth + 1).parse();
      const left = env.get(assignment[1]) ?? 0;

      if (assignment[2] === '=') env.set(assignment[1], right);
      else if (assignment[2] === '+=') {
        const unresolved = firstUnknown(left, right);
        if (unresolved) env.set(assignment[1], unresolved);
        else if (typeof left === 'string' || typeof right === 'string') env.set(assignment[1], asString(left) + asString(right));
        else env.set(assignment[1], (asNumber(left) ?? 0) + (asNumber(right) ?? 0));
      } else if (assignment[2] === '-=') env.set(assignment[1], (asNumber(left) ?? 0) - (asNumber(right) ?? 0));
      else if (assignment[2] === '*=') env.set(assignment[1], (asNumber(left) ?? 0) * (asNumber(right) ?? 0));
      else if (assignment[2] === '/=') env.set(assignment[1], (asNumber(left) ?? 0) / (asNumber(right) ?? 1));

      i = statement.end < body.length ? statement.end + 1 : body.length;
      continue;
    }

    const statement = readUntil(body, i, new Set([';']));
    if (statement.text) new Parser(statement.text, env, runtime, depth + 1).parse();
    i = statement.end < body.length ? statement.end + 1 : body.length;
  }

  return { returned: false, value: null };
}

function enclosingFunction(sourceIndex: number, runtime: Runtime): FunctionDef | null {
  let best: FunctionDef | null = null;

  for (const fn of runtime.functions.values()) {
    if (sourceIndex <= fn.bodyStart || sourceIndex >= fn.end) continue;
    if (!best || fn.end - fn.start < best.end - best.start) best = fn;
  }

  return best;
}

function environmentAt(sourceIndex: number, runtime: Runtime): Map<string, SafeValue> {
  const env = new Map(runtime.globals);
  const fn = enclosingFunction(sourceIndex, runtime);
  if (!fn) return env;

  for (const param of fn.params) {
    if (!env.has(param)) env.set(param, unknown(param));
  }

  const localLength = Math.max(0, Math.min(fn.body.length, sourceIndex - fn.bodyStart));
  const prefix = fn.body.slice(0, localLength);
  execute(prefix, env, runtime, 0);
  return env;
}

function collectGlobals(source: string, runtime: Runtime) {
  const declarations: Array<{ index: number; name: string; expression: string }> = [];
  const re = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(source))) {
    if (insideFunction(match.index, runtime.functions)) continue;
    const start = match.index + match[0].length;
    const statement = readUntil(source, start, new Set([';']));
    declarations.push({ index: match.index, name: match[1], expression: statement.text });
    re.lastIndex = Math.max(re.lastIndex, statement.end + 1);
  }

  declarations.sort((a, b) => a.index - b.index);

  for (const declaration of declarations) {
    runtime.globals.set(
      declaration.name,
      new Parser(declaration.expression, runtime.globals, runtime, 0).parse(),
    );
  }
}

export function createSafePreviewResolver(source: string): SafePreviewResolver {
  const runtime: Runtime = {
    functions: collectFunctions(source),
    globals: builtins(),
    depthLimit: 24,
  };

  collectGlobals(source, runtime);
  const unresolved = new Set<string>();

  return {
    resolve(expression: string) {
      return toJsonish(new Parser(expression, runtime.globals, runtime, 0).parse(), unresolved);
    },
    resolveAt(expression: string, sourceIndex: number) {
      const env = environmentAt(sourceIndex, runtime);
      return toJsonish(new Parser(expression, env, runtime, 0).parse(), unresolved);
    },
    unresolved() {
      return [...unresolved];
    },
  };
}

export function isUnresolvedPreviewValue(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(UNRESOLVED_PREVIEW_PREFIX);
}
