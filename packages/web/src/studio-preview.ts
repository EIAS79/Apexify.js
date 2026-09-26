import { createSafePreviewResolver, isUnresolvedPreviewValue, UNRESOLVED_PREVIEW_PREFIX } from './safe-preview-expression';
export type WebVirtualAsset = {
  id: string;
  name: string;
  mime: string;
  size: number;
  base64: string;
  metadata?: { width?: number; height?: number; duration?: number };
};

function studioAssetIdFromReference(value: string): string | null {
  const match = /^studio:\/\/asset\/([A-Za-z0-9._-]+)$/i.exec(value.trim());
  return match?.[1] ?? null;
}

type Jsonish = null | boolean | number | string | Jsonish[] | { [key: string]: Jsonish };
type RecordValue = { [key: string]: Jsonish };

export type WebStudioPreviewResult =
  | {
      ok: true;
      dataUrl: string;
      mime: 'image/png';
      width: number;
      height: number;
      elapsedMs: number;
      supportedApis: string[];
      warnings: string[];
      results?: Record<string, Jsonish>;
    }
  | {
      ok: false;
      elapsedMs: number;
      error: string;
      supportedApis: string[];
    };

const SHAPES = new Set([
  'rectangle',
  'square',
  'circle',
  'triangle',
  'trapezium',
  'star',
  'heart',
  'polygon',
  'arc',
  'pieSlice',
]);

const MAX_REMOTE_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REMOTE_IMAGE_PIXELS = 12_000_000;
const MAX_REMOTE_IMAGE_COUNT = 8;
const REMOTE_IMAGE_TIMEOUT_MS = 8_000;

const UNSUPPORTED_APIS = [
  'createScene',
  'renderScene',
  'createTemplate',
  'createGIF',
  'animate',
  'createVideo',
  'videoPipeline',
  'createAudio',
  'batch',
  'chain',
];

class LiteralParser {
  private index = 0;

  constructor(private readonly source: string) {}

  parse(): Jsonish {
    const value = this.parseValue();
    this.skipSpace();
    if (this.index < this.source.length) {
      throw new Error(`Unexpected token near “${this.source.slice(this.index, this.index + 24)}”.`);
    }
    return value;
  }

  private parseValue(): Jsonish {
    this.skipSpace();
    const ch = this.source[this.index];

    if (ch === '{') return this.parseObject();
    if (ch === '[') return this.parseArray();
    if (ch === '"' || ch === "'" || ch === '`') return this.parseString();

    if (ch === '-' || ch === '+' || /[0-9.]/.test(ch ?? '')) {
      return this.parseNumber();
    }

    const id = this.parseIdentifier();
    if (id === 'true') return true;
    if (id === 'false') return false;
    if (id === 'null' || id === 'undefined') return null;

    throw new Error(
      id
        ? `Apexify Web could not resolve the expression “${id}” in this preview.`
        : 'Apexify Web could not parse this Apexify options object.',
    );
  }

  private parseObject(): RecordValue {
    const out: RecordValue = {};
    this.expect('{');
    this.skipSpace();

    while (this.source[this.index] !== '}') {
      let key: string;
      const ch = this.source[this.index];
      if (ch === '"' || ch === "'" || ch === '`') {
        const parsed = this.parseString();
        key = String(parsed);
      } else {
        key = this.parseIdentifier();
      }

      if (!key) throw new Error('Expected an object property name.');
      this.skipSpace();
      this.expect(':');
      out[key] = this.parseValue();
      this.skipSpace();

      if (this.source[this.index] === ',') {
        this.index += 1;
        this.skipSpace();
        if (this.source[this.index] === '}') break;
        continue;
      }
      break;
    }

    this.expect('}');
    return out;
  }

  private parseArray(): Jsonish[] {
    const out: Jsonish[] = [];
    this.expect('[');
    this.skipSpace();

    while (this.source[this.index] !== ']') {
      out.push(this.parseValue());
      this.skipSpace();

      if (this.source[this.index] === ',') {
        this.index += 1;
        this.skipSpace();
        if (this.source[this.index] === ']') break;
        continue;
      }
      break;
    }

    this.expect(']');
    return out;
  }

  private parseString(): string {
    const quote = this.source[this.index++];
    let out = '';

    while (this.index < this.source.length) {
      const ch = this.source[this.index++];

      if (ch === quote) return out;
      if (quote === '`' && ch === '$' && this.source[this.index] === '{') {
        throw new Error('Template expressions are not supported in Apexify Web literals.');
      }

      if (ch !== '\\') {
        out += ch;
        continue;
      }

      const next = this.source[this.index++];
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
        '`': '`',
      };
      out += escapes[next] ?? next;
    }

    throw new Error('Unterminated string literal.');
  }

  private parseNumber(): number {
    const rest = this.source.slice(this.index);
    const match = rest.match(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
    if (!match) throw new Error('Invalid numeric literal.');
    this.index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) throw new Error('Numeric literal must be finite.');
    return value;
  }

  private parseIdentifier(): string {
    this.skipSpace();
    const rest = this.source.slice(this.index);
    const match = rest.match(/^[A-Za-z_$][\w$-]*/);
    if (!match) return '';
    this.index += match[0].length;
    return match[0];
  }

  private skipSpace() {
    while (this.index < this.source.length) {
      const ch = this.source[this.index];
      const next = this.source[this.index + 1];

      if (/\s/.test(ch)) {
        this.index += 1;
        continue;
      }

      if (ch === '/' && next === '/') {
        this.index += 2;
        while (this.index < this.source.length && this.source[this.index] !== '\n') this.index += 1;
        continue;
      }

      if (ch === '/' && next === '*') {
        this.index += 2;
        while (
          this.index < this.source.length - 1 &&
          !(this.source[this.index] === '*' && this.source[this.index + 1] === '/')
        ) {
          this.index += 1;
        }
        this.index += 2;
        continue;
      }

      break;
    }
  }

  private expect(ch: string) {
    this.skipSpace();
    if (this.source[this.index] !== ch) {
      throw new Error(`Expected “${ch}” near “${this.source.slice(this.index, this.index + 20)}”.`);
    }
    this.index += 1;
  }
}

function isRecord(value: Jsonish | undefined): value is RecordValue {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function numberOf(value: Jsonish | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringOf(value: Jsonish | undefined, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function boolOf(value: Jsonish | undefined, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

type Call = { method: string; index: number; args: string[] };

function extractCalls(source: string, methods: string[]): Call[] {
  const calls: Call[] = [];

  for (const method of methods) {
    const methodPattern = method.split('.').join('\\s*\\.\\s*');
    const re = new RegExp('\\.\\s*' + methodPattern + '\\s*\\(', 'g');
    let match: RegExpExecArray | null;

    while ((match = re.exec(source))) {
      const open = source.indexOf('(', match.index);
      if (open < 0) continue;
      const parsed = readCallArguments(source, open);
      if (!parsed) continue;
      calls.push({ method, index: match.index, args: parsed.args });
      re.lastIndex = parsed.end + 1;
    }
  }

  return calls.sort((a, b) => a.index - b.index);
}

function assignedIdentifierForCall(source: string, call: Call): string | null {
  const start = Math.max(
    source.lastIndexOf(';', call.index - 1),
    source.lastIndexOf('\n', call.index - 1),
    source.lastIndexOf('{', call.index - 1),
  ) + 1;
  const prefix = source.slice(start, call.index);
  const match = prefix.match(
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*\s*$/,
  );
  if (match?.[1]) return match[1];

  const reassigned = prefix.match(
    /([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*\s*$/,
  );
  return reassigned?.[1] ?? null;
}

function readCallArguments(source: string, openParen: number): { args: string[]; end: number } | null {
  const args: string[] = [];
  let start = openParen + 1;
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let quote: string | null = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = openParen + 1; i < source.length; i += 1) {
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
      if (ch === quote) quote = null;
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
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === '(') depthParen += 1;
    else if (ch === ')') {
      if (depthParen === 0 && depthBrace === 0 && depthBracket === 0) {
        const final = source.slice(start, i).trim();
        if (final) args.push(final);
        return { args, end: i };
      }
      depthParen -= 1;
    } else if (ch === '{') depthBrace += 1;
    else if (ch === '}') depthBrace -= 1;
    else if (ch === '[') depthBracket += 1;
    else if (ch === ']') depthBracket -= 1;
    else if (ch === ',' && depthParen === 0 && depthBrace === 0 && depthBracket === 0) {
      args.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }

  return null;
}

function parseLiteral(source: string): Jsonish {
  return new LiteralParser(source).parse();
}

function hasUnresolved(value: Jsonish): boolean {
  if (isUnresolvedPreviewValue(value)) return true;
  if (Array.isArray(value)) return value.some(hasUnresolved);
  if (isRecord(value)) return Object.values(value).some(hasUnresolved);
  return false;
}

function createGradient(
  ctx: CanvasRenderingContext2D,
  config: RecordValue,
  width: number,
  height: number,
): CanvasGradient | CanvasPattern {
  return phase7Gradient(ctx, config, { x: 0, y: 0, w: width, h: height });
}

function canvasPositionSet(value: Jsonish | undefined): Set<string> {
  return new Set(
    stringOf(value, 'all')
      .toLowerCase()
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function canvasCornerRadii(
  borderPosition: Jsonish | undefined,
  radius: number,
  width: number,
  height: number,
) {
  const selected = canvasPositionSet(borderPosition);
  const has = (name: string) =>
    selected.has('all') ||
    selected.has(name) ||
    (name === 'top-left' && (selected.has('top') || selected.has('left'))) ||
    (name === 'top-right' && (selected.has('top') || selected.has('right'))) ||
    (name === 'bottom-right' && (selected.has('bottom') || selected.has('right'))) ||
    (name === 'bottom-left' && (selected.has('bottom') || selected.has('left')));
  const r = Math.min(Math.max(0, radius), width / 2, height / 2);
  return {
    tl: has('top-left') ? r : 0,
    tr: has('top-right') ? r : 0,
    br: has('bottom-right') ? r : 0,
    bl: has('bottom-left') ? r : 0,
  };
}

function drawCanvasPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radiusValue: Jsonish | undefined,
  borderPosition: Jsonish | undefined = 'all',
) {
  ctx.beginPath();
  if (radiusValue === 'circular') {
    const radius = Math.min(width, height) / 2;
    ctx.arc(x + width / 2, y + height / 2, radius, 0, Math.PI * 2);
    ctx.closePath();
    return;
  }

  const radius = typeof radiusValue === 'number' && Number.isFinite(radiusValue)
    ? Math.max(0, radiusValue)
    : 0;
  if (radius <= 0) {
    ctx.rect(x, y, width, height);
    ctx.closePath();
    return;
  }

  const { tl, tr, br, bl } = canvasCornerRadii(
    borderPosition,
    radius,
    width,
    height,
  );
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + width - tr, y);
  if (tr) ctx.arcTo(x + width, y, x + width, y + tr, tr);
  ctx.lineTo(x + width, y + height - br);
  if (br) ctx.arcTo(x + width, y + height, x + width - br, y + height, br);
  ctx.lineTo(x + bl, y + height);
  if (bl) ctx.arcTo(x, y + height, x, y + height - bl, bl);
  ctx.lineTo(x, y + tl);
  if (tl) ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

type CanvasStrokeEdge = 'top' | 'right' | 'bottom' | 'left';

function canvasStrokeSides(value: Jsonish | undefined): Set<CanvasStrokeEdge> | 'all' {
  const raw = stringOf(value, 'all').toLowerCase().trim();
  if (!raw || raw === 'all') return 'all';
  const out = new Set<CanvasStrokeEdge>();
  for (const part of raw.split(',').map((item) => item.trim()).filter(Boolean)) {
    if (part === 'top' || part === 'right' || part === 'bottom' || part === 'left') {
      out.add(part);
    } else if (part === 'top-left') {
      out.add('top'); out.add('left');
    } else if (part === 'top-right') {
      out.add('top'); out.add('right');
    } else if (part === 'bottom-right') {
      out.add('bottom'); out.add('right');
    } else if (part === 'bottom-left') {
      out.add('bottom'); out.add('left');
    }
  }
  return out.size ? out : 'all';
}

function drawPartialStrokePath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radiusValue: Jsonish | undefined,
  roundedCorners: Jsonish | undefined,
  sides: Set<CanvasStrokeEdge>,
) {
  const radius = typeof radiusValue === 'number' && Number.isFinite(radiusValue)
    ? Math.min(Math.max(0, radiusValue), width / 2, height / 2)
    : 0;
  const { tl, tr, br, bl } = canvasCornerRadii(
    roundedCorners,
    radius,
    width,
    height,
  );
  const order: CanvasStrokeEdge[] = ['top', 'right', 'bottom', 'left'];
  const has = (edge: CanvasStrokeEdge) => sides.has(edge);
  if (order.every(has)) {
    drawCanvasPath(ctx, x, y, width, height, radiusValue, roundedCorners);
    return;
  }

  ctx.beginPath();
  const starts: number[] = [];
  for (let index = 0; index < 4; index += 1) {
    if (has(order[index]!) && !has(order[(index + 3) % 4]!)) starts.push(index);
  }
  for (const start of starts) {
    const run: CanvasStrokeEdge[] = [];
    let index = start;
    while (has(order[index]!)) {
      run.push(order[index]!);
      index = (index + 1) % 4;
      if (index === start || run.length >= 4) break;
    }
    if (!run.length) continue;

    switch (run[0]) {
      case 'top': ctx.moveTo(x + tl, y); break;
      case 'right': ctx.moveTo(x + width, y + tr); break;
      case 'bottom': ctx.moveTo(x + width - br, y + height); break;
      case 'left': ctx.moveTo(x, y + height - bl); break;
    }

    for (let runIndex = 0; runIndex < run.length; runIndex += 1) {
      const edge = run[runIndex]!;
      const next = run[runIndex + 1];
      if (edge === 'top') {
        ctx.lineTo(x + width - tr, y);
        if (next === 'right') {
          if (tr) ctx.arcTo(x + width, y, x + width, y + tr, tr);
          else ctx.lineTo(x + width, y);
        }
      } else if (edge === 'right') {
        ctx.lineTo(x + width, y + height - br);
        if (next === 'bottom') {
          if (br) ctx.arcTo(x + width, y + height, x + width - br, y + height, br);
          else ctx.lineTo(x + width, y + height);
        }
      } else if (edge === 'bottom') {
        ctx.lineTo(x + bl, y + height);
        if (next === 'left') {
          if (bl) ctx.arcTo(x, y + height, x, y + height - bl, bl);
          else ctx.lineTo(x, y + height);
        }
      } else {
        ctx.lineTo(x, y + tl);
        if (next === 'top') {
          if (tl) ctx.arcTo(x, y, x + tl, y, tl);
          else ctx.lineTo(x, y);
        }
      }
    }
  }
}

function applyCanvasZoomPreview(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  zoom: RecordValue | null,
) {
  if (!zoom) return;
  const scale = numberOf(zoom.scale, 1);
  if (!Number.isFinite(scale) || scale === 1) return;
  const centerX = numberOf(zoom.centerX, width / 2);
  const centerY = numberOf(zoom.centerY, height / 2);
  ctx.translate(centerX, centerY);
  ctx.scale(scale, scale);
  ctx.translate(-centerX, -centerY);
}

function applyCanvasRotationPreview(
  ctx: CanvasRenderingContext2D,
  rotation: number,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (!rotation) return;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  ctx.translate(centerX, centerY);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-centerX, -centerY);
}

function darkerHex(color: string, factor: number) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  const value = Number.parseInt(color.slice(1), 16);
  const part = (shift: number) =>
    Math.max(0, Math.floor(((value >> shift) & 255) * (1 - factor)));
  return '#' + ((part(16) << 16) | (part(8) << 8) | part(0))
    .toString(16)
    .padStart(6, '0');
}

function lighterHex(color: string, factor: number) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  const value = Number.parseInt(color.slice(1), 16);
  const part = (shift: number) => {
    const channel = (value >> shift) & 255;
    return Math.min(255, Math.floor(channel + (255 - channel) * factor));
  };
  return '#' + ((part(16) << 16) | (part(8) << 8) | part(0))
    .toString(16)
    .padStart(6, '0');
}

function configureStrokeDash(
  ctx: CanvasRenderingContext2D,
  style: string,
  width: number,
) {
  if (style === 'dashed') {
    ctx.setLineDash([width * 3, width * 2]);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
  } else if (style === 'dotted') {
    ctx.setLineDash([Math.max(1, width * 0.08), width * 1.8]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  } else {
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
  }
}

function applyCanvasShadowPreview(
  ctx: CanvasRenderingContext2D,
  shadow: RecordValue,
  x: number,
  y: number,
  width: number,
  height: number,
  fallbackRadius: Jsonish | undefined,
  fallbackCorners: Jsonish | undefined,
) {
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, numberOf(shadow.opacity, 0.4)));
  const blur = Math.max(0, numberOf(shadow.blur, 20));
  if (blur > 0) ctx.filter = 'blur(' + blur + 'px)';
  const offsetX = numberOf(shadow.offsetX, 0);
  const offsetY = numberOf(shadow.offsetY, 0);
  drawCanvasPath(
    ctx,
    x + offsetX,
    y + offsetY,
    width,
    height,
    shadow.borderRadius ?? fallbackRadius,
    shadow.roundedCorners ?? shadow.borderPosition ?? fallbackCorners ?? 'all',
  );
  ctx.fillStyle = isRecord(shadow.gradient)
    ? phase7Gradient(ctx, shadow.gradient, {
        x: x + offsetX,
        y: y + offsetY,
        w: width,
        h: height,
      })
    : stringOf(shadow.color, 'rgba(0,0,0,1)');
  ctx.fill();
  ctx.restore();
}

type CanvasShadowPreviewBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function canvasShadowPreviewBounds(
  config: RecordValue,
  shadow: RecordValue,
  width: number,
  height: number,
): CanvasShadowPreviewBounds {
  const x = numberOf(config.x, 0);
  const y = numberOf(config.y, 0);
  const offsetX = numberOf(shadow.offsetX, 0);
  const offsetY = numberOf(shadow.offsetY, 0);
  const rotation = (numberOf(config.rotation, 0) * Math.PI) / 180;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const corners = [
    [x + offsetX, y + offsetY],
    [x + offsetX + width, y + offsetY],
    [x + offsetX + width, y + offsetY + height],
    [x + offsetX, y + offsetY + height],
  ] as const;

  if (!rotation) {
    return {
      minX: corners[0][0],
      minY: corners[0][1],
      maxX: corners[2][0],
      maxY: corners[2][1],
    };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  for (const [px, py] of corners) {
    const dx = px - cx;
    const dy = py - cy;
    const rx = cx + dx * cos - dy * sin;
    const ry = cy + dx * sin + dy * cos;
    minX = Math.min(minX, rx);
    minY = Math.min(minY, ry);
    maxX = Math.max(maxX, rx);
    maxY = Math.max(maxY, ry);
  }
  return { minX, minY, maxX, maxY };
}

function composeCanvasShadowOverflowPreview(
  source: HTMLCanvasElement,
  config: RecordValue,
  width: number,
  height: number,
): HTMLCanvasElement {
  const shadow = isRecord(config.shadow) ? config.shadow : null;
  if (!shadow || numberOf(shadow.opacity, 0.4) <= 0) return source;

  const blur = Math.max(0, numberOf(shadow.blur, 20));
  // Canvas blur kernels have implementation-defined tails. Three blur radii is
  // a conservative visible bound that prevents the Studio wrapper from cutting
  // the shadow while keeping the preview allocation finite and predictable.
  const blurExtent = Math.ceil(blur * 3);
  const bounds = canvasShadowPreviewBounds(config, shadow, width, height);
  const left = Math.ceil(Math.max(0, blurExtent - bounds.minX));
  const top = Math.ceil(Math.max(0, blurExtent - bounds.minY));
  const right = Math.ceil(Math.max(0, bounds.maxX + blurExtent - width));
  const bottom = Math.ceil(Math.max(0, bounds.maxY + blurExtent - height));
  const outputWidth = width + left + right;
  const outputHeight = height + top + bottom;

  if (
    outputWidth > 4096 ||
    outputHeight > 4096 ||
    outputWidth * outputHeight > 12_000_000
  ) {
    throw new Error(
      'Apexify Web shadow overflow exceeds the 4096×4096 / 12 million pixel preview limit.',
    );
  }

  const output = document.createElement('canvas');
  output.width = outputWidth;
  output.height = outputHeight;
  const out = output.getContext('2d', { alpha: true });
  if (!out) throw new Error('Canvas 2D is unavailable while composing shadow overflow.');

  const x = numberOf(config.x, 0);
  const y = numberOf(config.y, 0);
  const rotation = numberOf(config.rotation, 0);
  out.save();
  out.translate(left, top);
  applyCanvasRotationPreview(out, rotation, x, y, width, height);
  applyCanvasShadowPreview(
    out,
    shadow,
    x,
    y,
    width,
    height,
    config.borderRadius ?? 0,
    config.borderPosition ?? 'all',
  );
  out.restore();
  out.drawImage(source, left, top);
  return output;
}

function applyCanvasStrokePreview(
  ctx: CanvasRenderingContext2D,
  stroke: RecordValue,
  x: number,
  y: number,
  width: number,
  height: number,
  fallbackRadius: Jsonish | undefined,
  fallbackCorners: Jsonish | undefined,
) {
  const lineWidth = Math.max(0, numberOf(stroke.width, 2));
  if (!lineWidth) return;
  const position = numberOf(stroke.position, 0);
  const rect = {
    x: x - position,
    y: y - position,
    width: width + position * 2,
    height: height + position * 2,
  };
  const radius = stroke.borderRadius ?? fallbackRadius ?? 0;
  const roundedCorners = stroke.roundedCorners ?? fallbackCorners ?? 'all';
  const sides = canvasStrokeSides(stroke.borderPosition);
  const build = (delta = 0) => {
    const target = {
      x: rect.x - delta,
      y: rect.y - delta,
      width: rect.width + delta * 2,
      height: rect.height + delta * 2,
    };
    if (sides === 'all' || radius === 'circular') {
      drawCanvasPath(
        ctx,
        target.x,
        target.y,
        target.width,
        target.height,
        radius,
        roundedCorners,
      );
    } else {
      drawPartialStrokePath(
        ctx,
        target.x,
        target.y,
        target.width,
        target.height,
        radius,
        roundedCorners,
        sides,
      );
    }
  };

  const blur = Math.max(0, numberOf(stroke.blur, 0));
  if (blur > 0) {
    const layer = document.createElement('canvas');
    layer.width = ctx.canvas.width;
    layer.height = ctx.canvas.height;
    const layerCtx = layer.getContext('2d');
    if (layerCtx) {
      applyCanvasStrokePreview(
        layerCtx,
        { ...stroke, blur: 0 },
        x,
        y,
        width,
        height,
        fallbackRadius,
        fallbackCorners,
      );
      ctx.save();
      ctx.filter = 'blur(' + blur + 'px)';
      ctx.drawImage(layer, 0, 0);
      ctx.restore();
    }
    return;
  }

  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, numberOf(stroke.opacity, 1)));

  const gradient = isRecord(stroke.gradient)
    ? phase7Gradient(ctx, stroke.gradient, {
        x: rect.x,
        y: rect.y,
        w: rect.width,
        h: rect.height,
      })
    : null;
  const color = stringOf(stroke.color, '#000000');
  const style = stringOf(stroke.style, 'solid');
  configureStrokeDash(ctx, style, lineWidth);

  const strokeOnce = (
    paint: string | CanvasGradient | CanvasPattern,
    widthValue: number,
    delta = 0,
  ) => {
    build(delta);
    ctx.lineWidth = Math.max(0.5, widthValue);
    ctx.strokeStyle = paint;
    ctx.stroke();
  };

  if (style === 'groove' || style === 'ridge') {
    const first = gradient ?? (style === 'groove'
      ? darkerHex(color, 0.32)
      : lighterHex(color, 0.32));
    const second = gradient ?? (style === 'groove'
      ? lighterHex(color, 0.32)
      : darkerHex(color, 0.32));
    strokeOnce(first, lineWidth * 0.58, lineWidth * 0.18);
    strokeOnce(second, lineWidth * 0.58, -lineWidth * 0.18);
  } else if (style === 'double') {
    const paint = gradient ?? color;
    strokeOnce(paint, Math.max(1, lineWidth / 3), lineWidth / 3);
    strokeOnce(paint, Math.max(1, lineWidth / 3), -lineWidth / 3);
  } else {
    strokeOnce(gradient ?? color, lineWidth);
  }

  ctx.restore();
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  drawCanvasPath(ctx, x, y, width, height, radius, 'all');
}

async function applyBackground(
  ctx: CanvasRenderingContext2D,
  config: RecordValue,
  width: number,
  height: number,
  studioAssetsById: ReadonlyMap<string, WebVirtualAsset>,
  warnings: string[],
) {
  const x = numberOf(config.x, 0);
  const y = numberOf(config.y, 0);
  const rotation = numberOf(config.rotation, 0);
  const opacity = Math.min(1, Math.max(0, numberOf(config.opacity, 1)));
  const borderRadius = config.borderRadius ?? 0;
  const borderPosition = config.borderPosition ?? 'all';
  const customBg = isRecord(config.customBg) ? config.customBg : null;
  const hasGradient = isRecord(config.gradientBg);
  const transparent = boolOf(config.transparentBase, false);

  ctx.save();
  try {
    ctx.globalAlpha = opacity;
    applyCanvasRotationPreview(ctx, rotation, x, y, width, height);
    drawCanvasPath(
      ctx,
      x,
      y,
      width,
      height,
      borderRadius,
      borderPosition,
    );
    ctx.clip();
    applyCanvasZoomPreview(
      ctx,
      width,
      height,
      isRecord(config.zoom) ? config.zoom : null,
    );
    ctx.translate(x, y);

    const blendMode = stringOf(config.blendMode, 'source-over');
    try {
      ctx.globalCompositeOperation = blendMode as GlobalCompositeOperation;
    } catch {
      ctx.globalCompositeOperation = 'source-over';
    }

    const blur = Math.max(0, numberOf(config.blur, 0));

    if (customBg) {
      const source = stringOf(customBg.source, '');
      if (source) {
        const bitmap = await previewBitmapFromSource(
          source,
          studioAssetsById,
          warnings,
          'customBg',
        );
        if (bitmap) {
          try {
            ctx.save();
            ctx.globalAlpha *= Math.min(
              1,
              Math.max(0, numberOf(customBg.opacity, 1)),
            );
            if (blur > 0) ctx.filter = 'blur(' + blur + 'px)';
            drawBitmapFitted(
              ctx,
              bitmap,
              width,
              height,
              stringOf(customBg.fit, 'fill'),
              stringOf(customBg.align, 'center'),
            );
            ctx.restore();
          } finally {
            bitmap.close();
          }
        }
      }
    } else if (hasGradient) {
      ctx.save();
      if (blur > 0) ctx.filter = 'blur(' + blur + 'px)';
      ctx.fillStyle = createGradient(
        ctx,
        config.gradientBg as RecordValue,
        width,
        height,
      );
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    } else if (!transparent) {
      ctx.save();
      if (blur > 0) ctx.filter = 'blur(' + blur + 'px)';
      ctx.fillStyle = stringOf(config.colorBg, '#000000');
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    const layers = Array.isArray(config.bgLayers) ? config.bgLayers : [];
    for (const layer of layers) {
      if (!isRecord(layer)) continue;

      ctx.save();
      const blend = stringOf(layer.blendMode, 'source-over');
      try {
        ctx.globalCompositeOperation = blend as GlobalCompositeOperation;
      } catch {
        ctx.globalCompositeOperation = 'source-over';
      }

      const type = stringOf(layer.type, '');
      if (type === 'color') {
        ctx.globalAlpha *= Math.min(
          1,
          Math.max(0, numberOf(layer.opacity, 1)),
        );
        ctx.fillStyle = stringOf(layer.value, 'transparent');
        ctx.fillRect(0, 0, width, height);
      } else if (type === 'gradient' && isRecord(layer.value)) {
        ctx.globalAlpha *= Math.min(
          1,
          Math.max(0, numberOf(layer.opacity, 1)),
        );
        ctx.fillStyle = createGradient(ctx, layer.value, width, height);
        ctx.fillRect(0, 0, width, height);
      } else if (type === 'image') {
        const source = stringOf(layer.source, '');
        const bitmap = source
          ? await previewBitmapFromSource(
              source,
              studioAssetsById,
              warnings,
              'bgLayers image',
            )
          : null;
        if (bitmap) {
          try {
            ctx.globalAlpha *= Math.min(
              1,
              Math.max(0, numberOf(layer.opacity, 1)),
            );
            drawBitmapFitted(
              ctx,
              bitmap,
              width,
              height,
              stringOf(layer.fit, 'fill'),
              stringOf(layer.align, 'center'),
            );
          } finally {
            bitmap.close();
          }
        }
      } else if (type === 'pattern') {
        const source = stringOf(layer.source, '');
        const bitmap = source
          ? await previewBitmapFromSource(
              source,
              studioAssetsById,
              warnings,
              'bgLayers pattern',
            )
          : null;
        if (bitmap) {
          try {
            ctx.globalAlpha *= Math.min(
              1,
              Math.max(0, numberOf(layer.opacity, 1)),
            );
            const repeat = stringOf(layer.repeat, 'repeat') as
              | 'repeat'
              | 'repeat-x'
              | 'repeat-y'
              | 'no-repeat';
            const pattern = ctx.createPattern(bitmap, repeat);
            if (pattern) {
              ctx.fillStyle = pattern;
              ctx.fillRect(0, 0, width, height);
            }
          } finally {
            bitmap.close();
          }
        }
      } else if (type === 'presetPattern' && isRecord(layer.pattern)) {
        ctx.globalAlpha *= Math.min(
          1,
          Math.max(0, numberOf(layer.opacity, 1)),
        );
        drawPattern(ctx, layer.pattern, width, height);
      } else if (type === 'noise') {
        const intensity = Math.min(
          1,
          Math.max(0, numberOf(layer.intensity, 0.08)),
        );
        if (intensity > 0) drawNoise(ctx, width, height, intensity);
      }
      ctx.restore();
    }

    if (isRecord(config.patternBg)) {
      ctx.save();
      const pattern = config.patternBg;
      const blend = stringOf(pattern.blendMode, 'overlay');
      try {
        ctx.globalCompositeOperation = blend as GlobalCompositeOperation;
      } catch {
        ctx.globalCompositeOperation = 'overlay';
      }
      drawPattern(ctx, pattern, width, height);
      ctx.restore();
    }

    if (isRecord(config.noiseBg)) {
      const intensity = Math.min(
        1,
        Math.max(0, numberOf(config.noiseBg.intensity, 0)),
      );
      if (intensity > 0) drawNoise(ctx, width, height, intensity);
    }
  } finally {
    ctx.restore();
  }

  const stroke = isRecord(config.canvasStroke)
    ? config.canvasStroke
    : isRecord(config.stroke)
      ? config.stroke
      : null;
  if (stroke) {
    applyCanvasStrokePreview(
      ctx,
      stroke,
      x,
      y,
      width,
      height,
      borderRadius,
      borderPosition,
    );
  }
}
function drawPattern(
  ctx: CanvasRenderingContext2D,
  pattern: RecordValue,
  width: number,
  height: number,
) {
  const type = stringOf(pattern.type, 'grid');
  const color = stringOf(pattern.color, 'rgba(255,255,255,.16)');
  const secondary = stringOf(pattern.secondaryColor, color);
  const spacing = Math.max(2, numberOf(pattern.spacing, 24));
  const size = Math.max(1, numberOf(pattern.size, 6));
  const lineWidth = Math.max(0.5, Math.min(4, size * 0.16));
  const rotation = (numberOf(pattern.rotation, 0) * Math.PI) / 180;
  const scale = Math.max(0.01, numberOf(pattern.scale, 1));
  const offsetX = numberOf(pattern.offsetX, 0);
  const offsetY = numberOf(pattern.offsetY, 0);
  const rawGradient = isRecord(pattern.gradient) ? pattern.gradient : null;
  const gradientPaint = rawGradient
    ? createGradient(
        ctx,
        {
          ...rawGradient,
          ...(rawGradient.type === 'linear' &&
          rawGradient.rotate === undefined &&
          typeof rawGradient.angle === 'number'
            ? { rotate: rawGradient.angle }
            : {}),
          ...(rawGradient.type === 'conic' &&
          rawGradient.startAngle === undefined &&
          typeof rawGradient.angle === 'number'
            ? { startAngle: rawGradient.angle }
            : {}),
        },
        width,
        height,
      )
    : null;
  const primaryPaint = gradientPaint ?? color;
  const margin = Math.ceil(Math.hypot(width, height) * 0.8);
  const left = -margin;
  const top = -margin;
  const right = width + margin;
  const bottom = height + margin;
  const spanWidth = Math.max(1, right - left);
  const spanHeight = Math.max(1, bottom - top);
  const MAX_PATTERN_MARKS = 24000;
  const densityFloor = Math.sqrt((spanWidth * spanHeight) / MAX_PATTERN_MARKS);
  const bounded2dStep = (step: number) => Math.max(step, densityFloor);

  const strokePolygon = (
    points: Array<[number, number]>,
    strokeColor: string | CanvasGradient | CanvasPattern = primaryPaint,
  ) => {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.strokeStyle = strokeColor;
    ctx.stroke();
  };

  const starPath = (cx: number, cy: number, outer: number, inner: number) => {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const radius = i % 2 === 0 ? outer : inner;
      const angle = (i * Math.PI) / 5 - Math.PI / 2;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };

  ctx.save();
  ctx.globalAlpha *= Math.min(1, Math.max(0, numberOf(pattern.opacity, 1)));
  ctx.lineWidth = lineWidth;
  ctx.translate(offsetX, offsetY);
  if (scale !== 1 || rotation) {
    ctx.translate(width / 2, height / 2);
    if (rotation) ctx.rotate(rotation);
    if (scale !== 1) ctx.scale(scale, scale);
    ctx.translate(-width / 2, -height / 2);
  }

  if (type === 'dots' || type === 'polka') {
    ctx.fillStyle = primaryPaint;
    const step = bounded2dStep(Math.max(size + spacing, size * 1.6));
    for (let y = top; y <= bottom; y += step) {
      for (let x = left; x <= right; x += step) {
        const offset = type === 'polka' && Math.round((y - top) / step) % 2 ? step / 2 : 0;
        ctx.beginPath();
        ctx.arc(x + offset, y, Math.max(1, size / 2), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (type === 'stripes' || type === 'diagonal') {
    ctx.strokeStyle = primaryPaint;
    const step = Math.max(5, size + spacing);
    const diagonal = type === 'diagonal' ? height + margin * 2 : 0;
    for (let x = left - diagonal; x <= right + diagonal; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + diagonal, bottom);
      ctx.stroke();
    }
  } else if (type === 'waves') {
    const stepY = bounded2dStep(Math.max(10, size + spacing));
    const amplitude = Math.max(2, size * 0.35);
    const wavelength = Math.max(24, size * 2.4 + spacing * 2);
    const rowCount = Math.max(1, Math.ceil(spanHeight / stepY));
    const waveSampleStep = Math.max(4, Math.ceil((spanWidth * rowCount) / MAX_PATTERN_MARKS));
    for (let y = top; y <= bottom; y += stepY) {
      ctx.beginPath();
      for (let x = left; x <= right; x += waveSampleStep) {
        const waveY = y + Math.sin(((x - left) / wavelength) * Math.PI * 2) * amplitude;
        if (x === left) ctx.moveTo(x, waveY);
        else ctx.lineTo(x, waveY);
      }
      ctx.strokeStyle = Math.round((y - top) / stepY) % 2 ? secondary : color;
      ctx.stroke();
    }
  } else if (type === 'crosses') {
    const step = bounded2dStep(Math.max(8, size + spacing));
    const arm = Math.max(2, size / 2);
    for (let y = top; y <= bottom; y += step) {
      for (let x = left; x <= right; x += step) {
        ctx.strokeStyle = Math.round((x + y) / step) % 2 ? secondary : color;
        ctx.beginPath();
        ctx.moveTo(x - arm, y);
        ctx.lineTo(x + arm, y);
        ctx.moveTo(x, y - arm);
        ctx.lineTo(x, y + arm);
        ctx.stroke();
      }
    }
  } else if (type === 'hexagons') {
    const radius = Math.max(3, size);
    const hexH = Math.sqrt(3) * radius;
    const stepX = Math.max(radius * 1.5 + spacing, densityFloor);
    const stepY = Math.max(hexH + spacing, densityFloor);
    let col = 0;
    for (let x = left; x <= right + radius; x += stepX, col += 1) {
      let row = 0;
      for (let y = top + (col % 2 ? stepY / 2 : 0); y <= bottom + hexH; y += stepY, row += 1) {
        const points: Array<[number, number]> = [];
        for (let i = 0; i < 6; i += 1) {
          const angle = (Math.PI / 3) * i;
          points.push([x + Math.cos(angle) * radius, y + Math.sin(angle) * radius]);
        }
        strokePolygon(points, (col + row) % 2 ? secondary : color);
      }
    }
  } else if (type === 'checkerboard') {
    const cell = bounded2dStep(Math.max(4, size + spacing));
    for (let y = top, row = 0; y <= bottom; y += cell, row += 1) {
      for (let x = left, col = 0; x <= right; x += cell, col += 1) {
        ctx.fillStyle = (row + col) % 2 ? secondary : color;
        ctx.fillRect(x, y, cell, cell);
      }
    }
  } else if (type === 'diamonds') {
    const step = bounded2dStep(Math.max(8, size * 2 + spacing));
    const half = Math.max(3, size);
    for (let y = top; y <= bottom; y += step) {
      for (let x = left; x <= right; x += step) {
        strokePolygon([[x, y - half], [x + half, y], [x, y + half], [x - half, y]]);
      }
    }
  } else if (type === 'triangles') {
    const step = bounded2dStep(Math.max(8, size * 2 + spacing));
    const triH = Math.max(4, size * 1.5);
    for (let y = top; y <= bottom; y += step) {
      for (let x = left; x <= right; x += step) {
        strokePolygon([[x, y - triH / 2], [x + size, y + triH / 2], [x - size, y + triH / 2]]);
      }
    }
  } else if (type === 'stars') {
    const step = bounded2dStep(Math.max(12, size * 2 + spacing));
    for (let y = top; y <= bottom; y += step) {
      for (let x = left; x <= right; x += step) {
        starPath(x, y, size, size * 0.45);
        ctx.strokeStyle = primaryPaint;
        ctx.stroke();
      }
    }
  } else {
    const step = Math.max(6, size + spacing);
    for (let x = left; x <= right; x += step) {
      ctx.strokeStyle = primaryPaint;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
    }
    for (let y = top; y <= bottom; y += step) {
      ctx.strokeStyle = secondary;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }
  }

  ctx.restore();
}
function drawNoise(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number,
) {
  const alpha = Math.round(255 * Math.min(1, Math.max(0, intensity)));
  if (alpha <= 0) return;

  // Build noise offscreen, then composite it normally so CanvasConfig
  // clipping, transforms, opacity and blend modes still apply.
  const noiseCanvas = document.createElement('canvas');
  noiseCanvas.width = width;
  noiseCanvas.height = height;
  const noiseCtx = noiseCanvas.getContext('2d');
  if (!noiseCtx) return;
  const image = noiseCtx.createImageData(width, height);
  let seed = 173;
  const nextRandom = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let index = 0; index < image.data.length; index += 4) {
    const value = Math.floor(nextRandom() * 256);
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
    image.data[index + 3] = alpha;
  }
  noiseCtx.putImageData(image, 0, 0);
  ctx.drawImage(noiseCanvas, 0, 0);
}
function applyShadow(ctx: CanvasRenderingContext2D, value: Jsonish | undefined) {
  if (!isRecord(value)) return;
  ctx.shadowColor = stringOf(value.color, 'rgba(0,0,0,0)');
  ctx.shadowBlur = Math.max(0, numberOf(value.blur, 0));
  ctx.shadowOffsetX = numberOf(value.offsetX, 0);
  ctx.shadowOffsetY = numberOf(value.offsetY, 0);
}

function applyBlendMode(ctx: CanvasRenderingContext2D, value: Jsonish | undefined) {
  if (typeof value !== 'string' || !value) return;
  try {
    ctx.globalCompositeOperation = value as GlobalCompositeOperation;
  } catch {
    ctx.globalCompositeOperation = 'source-over';
  }
}

function previewTextLineDecoration(
  ctx: CanvasRenderingContext2D,
  value: Jsonish | undefined,
  fallbackColor: string,
  x0: number,
  x1: number,
  y: number,
  fontSize: number,
) {
  if (!value) return;
  const config = isRecord(value) ? value : {};
  ctx.save();
  ctx.lineWidth = Math.max(1, numberOf(config.width, fontSize * 0.05));
  ctx.strokeStyle = isRecord(config.gradient)
    ? createGradient(ctx, config.gradient, Math.max(1, x1 - x0), Math.max(1, fontSize))
    : stringOf(config.color, fallbackColor);
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  ctx.restore();
}

function previewTextLocalBounds(
  ctx: CanvasRenderingContext2D,
  text: string,
): { width: number; left: number; right: number } {
  const width = ctx.measureText(text).width;
  const align = ctx.textAlign;
  if (align === 'center') return { width, left: -width / 2, right: width / 2 };
  if (align === 'right' || align === 'end') return { width, left: -width, right: 0 };
  return { width, left: 0, right: width };
}

function drawPreviewTextLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  item: RecordValue,
  x: number,
  y: number,
  fontSize: number,
) {
  const fill = isRecord(item.fill) ? item.fill : {};
  const effects = isRecord(item.effects) ? item.effects : {};
  const decorations = isRecord(item.decorations) ? item.decorations : {};
  const stroke = isRecord(item.stroke) ? item.stroke : {};
  const highlight = isRecord(effects.highlight)
    ? effects.highlight
    : isRecord(item.highlight)
      ? item.highlight
      : null;
  const glow = isRecord(effects.glow)
    ? effects.glow
    : isRecord(item.glow)
      ? item.glow
      : null;
  const shadow = isRecord(effects.shadow)
    ? effects.shadow
    : isRecord(item.shadow)
      ? item.shadow
      : null;
  const { width, left, right } = previewTextLocalBounds(ctx, text);
  const fillColor = stringOf(fill.color, stringOf(item.color, '#000000'));

  if (highlight) {
    ctx.save();
    ctx.globalAlpha *= Math.min(1, Math.max(0, numberOf(highlight.opacity, .3)));
    ctx.fillStyle = isRecord(highlight.gradient)
      ? createGradient(ctx, highlight.gradient, Math.max(1, width), fontSize)
      : stringOf(highlight.color, '#ffff00');
    ctx.fillRect(x + left, y - fontSize * .8, Math.max(1, width), fontSize);
    ctx.restore();
  }

  if (glow) {
    ctx.save();
    ctx.globalAlpha *= Math.min(1, Math.max(0, numberOf(glow.opacity, .8)));
    ctx.shadowColor = isRecord(glow.gradient)
      ? stringOf(
          Array.isArray(glow.gradient.colors) && isRecord(glow.gradient.colors[0])
            ? glow.gradient.colors[0].color
            : undefined,
          '#ffffff',
        )
      : stringOf(glow.color, '#ffffff');
    ctx.shadowBlur = Math.max(0, numberOf(glow.intensity, 10));
    ctx.fillStyle = fillColor;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  if (shadow) {
    ctx.save();
    ctx.globalAlpha *= Math.min(1, Math.max(0, numberOf(shadow.opacity, 1)));
    ctx.shadowColor = isRecord(shadow.gradient)
      ? stringOf(
          Array.isArray(shadow.gradient.colors) && isRecord(shadow.gradient.colors[0])
            ? shadow.gradient.colors[0].color
            : undefined,
          'rgba(0,0,0,.5)',
        )
      : stringOf(shadow.color, 'rgba(0,0,0,.5)');
    ctx.shadowBlur = Math.max(0, numberOf(shadow.blur, 4));
    ctx.shadowOffsetX = numberOf(shadow.offsetX, 2);
    ctx.shadowOffsetY = numberOf(shadow.offsetY, 2);
    ctx.fillStyle = fillColor;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  const strokeWidth = Math.max(0, numberOf(stroke.width, 0));
  if (strokeWidth > 0) {
    ctx.save();
    ctx.globalAlpha *= Math.min(1, Math.max(0, numberOf(stroke.opacity, 1)));
    ctx.lineWidth = strokeWidth;
    const strokeStyle = stringOf(stroke.style, 'solid');
    if (strokeStyle === 'dashed') ctx.setLineDash([strokeWidth * 3, strokeWidth * 2]);
    else if (strokeStyle === 'dotted') {
      ctx.setLineDash([strokeWidth, strokeWidth]);
      ctx.lineCap = 'round';
    }
    ctx.strokeStyle = isRecord(stroke.gradient)
      ? createGradient(ctx, stroke.gradient, Math.max(1, width), fontSize)
      : stringOf(stroke.color, '#000000');
    ctx.strokeText(text, x, y);
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = isRecord(fill.gradient)
    ? createGradient(ctx, fill.gradient, Math.max(1, width), fontSize)
    : isRecord(item.gradient)
      ? createGradient(ctx, item.gradient, Math.max(1, width), fontSize)
      : fillColor;
  ctx.fillText(text, x, y);
  ctx.restore();

  const underline = decorations.underline ?? item.underline;
  const overline = decorations.overline ?? item.overline;
  const strikethrough = decorations.strikethrough ?? item.strikethrough;
  previewTextLineDecoration(ctx, underline, fillColor, x + left, x + right, y + fontSize * .12, fontSize);
  previewTextLineDecoration(ctx, overline, fillColor, x + left, x + right, y - fontSize * .78, fontSize);
  previewTextLineDecoration(ctx, strikethrough, fillColor, x + left, x + right, y - fontSize * .3, fontSize);
}

function previewTextGraphemes(value: string): string[] {
  try {
    const Segmenter = (Intl as unknown as {
      Segmenter?: new (
        locales?: string,
        options?: { granularity: 'grapheme' },
      ) => { segment(text: string): Iterable<{ segment: string }> };
    }).Segmenter;
    if (Segmenter) {
      return [...new Segmenter(undefined, { granularity: 'grapheme' }).segment(value)]
        .map((entry) => entry.segment);
    }
  } catch {}
  return Array.from(value);
}

function drawCurvedPreviewText(
  ctx: CanvasRenderingContext2D,
  line: string,
  item: RecordValue,
  curve: RecordValue,
  fontSize: number,
) {
  const sweepDegrees = numberOf(curve.sweepAngle, 0);
  if (!line || sweepDegrees <= 0 || sweepDegrees >= 360) {
    drawPreviewTextLine(ctx, line, item, 0, 0, fontSize);
    return;
  }
  const units = previewTextGraphemes(line);
  if (!units.length) return;

  const centers: number[] = [];
  let previous = 0;
  let acc = '';
  for (const unit of units) {
    acc += unit;
    const right = ctx.measureText(acc).width;
    centers.push((previous + right) / 2);
    previous = right;
  }
  const width = Math.max(ctx.measureText(line).width, previous, 1e-6);
  const userSweep = (sweepDegrees * Math.PI) / 180;
  const fitRadius = width / userSweep;
  const mode = stringOf(curve.layoutMode, 'clamp');
  const requestedRadius =
    typeof curve.radius === 'number' ? Math.max(.001, curve.radius) : undefined;
  let radius = fitRadius;
  let sweep = userSweep;
  if (mode === 'override') {
    radius = requestedRadius ?? fitRadius;
    sweep = Math.max(userSweep, width / radius);
  } else if (mode === 'clamp') {
    radius = requestedRadius === undefined
      ? fitRadius
      : Math.max(requestedRadius, fitRadius);
  }
  const up = boolOf(curve.up, true);
  const baselineOffset = numberOf(curve.baselineOffset, 0);
  const drawRadius = radius + baselineOffset;
  const startExtra = (numberOf(curve.startAngleDeg, 0) * Math.PI) / 180;
  const centerY = up ? radius : -radius;

  units.forEach((unit, index) => {
    const t = centers[index]! / width;
    const angle = up
      ? startExtra - Math.PI / 2 - sweep / 2 + t * sweep
      : startExtra + Math.PI / 2 + sweep / 2 - t * sweep;
    const px = drawRadius * Math.cos(angle);
    const py = centerY + drawRadius * Math.sin(angle);
    const rotation = up
      ? angle + Math.PI / 2
      : Math.atan2(-Math.cos(angle), Math.sin(angle));

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rotation);
    const previousAlign = ctx.textAlign;
    const previousBaseline = ctx.textBaseline;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    drawPreviewTextLine(ctx, unit, item, 0, 0, fontSize);
    ctx.textAlign = previousAlign;
    ctx.textBaseline = previousBaseline;
    ctx.restore();
  });
}

function previewWrappedTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  if (!(maxWidth > 0)) return text.split('\n');
  const rendered: string[] = [];
  for (const explicitLine of text.split('\n')) {
    const words = explicitLine.split(/\s+/).filter(Boolean);
    if (!words.length) {
      rendered.push('');
      continue;
    }
    let line = words[0]!;
    for (let wordIndex = 1; wordIndex < words.length; wordIndex += 1) {
      const candidate = line + ' ' + words[wordIndex]!;
      if (ctx.measureText(candidate).width <= maxWidth) line = candidate;
      else {
        rendered.push(line);
        line = words[wordIndex]!;
      }
    }
    rendered.push(line);
  }
  return rendered;
}

function applyText(ctx: CanvasRenderingContext2D, value: Jsonish) {
  const list = Array.isArray(value) ? value : [value];

  for (const item of list) {
    if (!isRecord(item)) continue;
    const font = isRecord(item.font) ? item.font : {};
    const decorations = isRecord(item.decorations) ? item.decorations : {};
    const layout = isRecord(item.layout) ? item.layout : {};
    const placement = isRecord(item.placement) ? item.placement : {};
    const fill = isRecord(item.fill) ? item.fill : {};

    const size = Math.max(1, numberOf(font.size, numberOf(item.fontSize, 16)));
    const family = stringOf(
      font.name,
      stringOf(
        item.fontName,
        stringOf(font.family, stringOf(item.fontFamily, 'Arial')),
      ),
    );
    const bold = boolOf(decorations.bold, boolOf(item.bold, false));
    const italic = boolOf(decorations.italic, boolOf(item.italic, false));
    const x = numberOf(item.x, 0);
    const y = numberOf(item.y, 0);
    const rotation =
      (numberOf(placement.rotation, numberOf(item.rotation, 0)) * Math.PI) / 180;
    const opacity = Math.min(
      1,
      Math.max(0, numberOf(fill.opacity, numberOf(item.opacity, 1))),
    );
    const maxWidth = numberOf(layout.maxWidth, numberOf(item.maxWidth, 0));
    const maxHeight = numberOf(layout.maxHeight, numberOf(item.maxHeight, 0));
    const lineHeightFactor = Math.max(
      .01,
      numberOf(layout.lineHeight, numberOf(item.lineHeight, 1.4)),
    );
    const lineHeight = lineHeightFactor * size;
    const curve = isRecord(item.textOnCurve) ? item.textOnCurve : null;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(x, y);
    if (rotation) ctx.rotate(rotation);
    ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px "${family}"`;
    if ('letterSpacing' in ctx) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
        numberOf(layout.letterSpacing, numberOf(item.letterSpacing, 0)) + 'px';
    }
    if ('wordSpacing' in ctx) {
      (ctx as CanvasRenderingContext2D & { wordSpacing: string }).wordSpacing =
        numberOf(layout.wordSpacing, numberOf(item.wordSpacing, 0)) + 'px';
    }
    ctx.textAlign = stringOf(
      placement.textAlign,
      stringOf(item.textAlign, 'left'),
    ) as CanvasTextAlign;
    ctx.textBaseline = stringOf(
      placement.textBaseline,
      stringOf(item.textBaseline, 'alphabetic'),
    ) as CanvasTextBaseline;

    const text = stringOf(item.text, '');
    if (curve) {
      text.split('\n').forEach((line, lineIndex) => {
        ctx.save();
        ctx.translate(0, lineIndex * lineHeight);
        drawCurvedPreviewText(ctx, line, item, curve, size);
        ctx.restore();
      });
    } else {
      const lines = previewWrappedTextLines(ctx, text, maxWidth);
      const maxLines = maxHeight > 0
        ? Math.max(0, Math.floor(maxHeight / lineHeight))
        : lines.length;
      lines.slice(0, maxLines).forEach((line, lineIndex) => {
        drawPreviewTextLine(ctx, line, item, 0, lineIndex * lineHeight, size);
      });
    }

    ctx.restore();
  }
}

function drawGeneratedCanvasLayer(
  ctx: CanvasRenderingContext2D,
  item: RecordValue,
  sourceCanvas: HTMLCanvasElement,
) {
  const x = numberOf(item.x, 0);
  const y = numberOf(item.y, 0);
  const width = Math.max(1, numberOf(item.width, sourceCanvas.width));
  const height = Math.max(1, numberOf(item.height, sourceCanvas.height));
  const radius = Math.max(0, numberOf(item.borderRadius, 0));
  const shadow = isRecord(item.shadow) ? item.shadow : null;

  if (shadow) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, numberOf(shadow.opacity, 1)));
    ctx.shadowColor = stringOf(shadow.color, 'rgba(0,0,0,.35)');
    ctx.shadowBlur = Math.max(0, numberOf(shadow.blur, 0));
    ctx.shadowOffsetX = numberOf(shadow.offsetX, 0);
    ctx.shadowOffsetY = numberOf(shadow.offsetY, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.01)';
    drawRoundedRect(ctx, x, y, width, height, radius);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, numberOf(item.opacity, 1)));
  if (radius > 0) {
    drawRoundedRect(ctx, x, y, width, height, radius);
    ctx.clip();
  }
  ctx.drawImage(sourceCanvas, x, y, width, height);
  ctx.restore();
}

function unresolvedPreviewLabel(value: Jsonish): string | null {
  if (!isUnresolvedPreviewValue(value)) return null;
  return value.slice(UNRESOLVED_PREVIEW_PREFIX.length) || null;
}

function applyImageShapes(
  ctx: CanvasRenderingContext2D,
  value: Jsonish,
  generatedChartsBySource: Map<string, HTMLCanvasElement>,
): Set<string> {
  const list = Array.isArray(value) ? value : [value];
  const usedGeneratedSources = new Set<string>();

  for (const item of list) {
    if (!isRecord(item)) continue;
    const rawSource = item.source;
    const source = stringOf(rawSource, '');
    if (!SHAPES.has(source)) {
      const unresolvedLabel = unresolvedPreviewLabel(rawSource);
      const generatedChart = unresolvedLabel ? generatedChartsBySource.get(unresolvedLabel) : undefined;
      if (unresolvedLabel && generatedChart) {
        drawGeneratedCanvasLayer(ctx, item, generatedChart);
        usedGeneratedSources.add(unresolvedLabel);
      }
      continue;
    }

    const shape = isRecord(item.shape) ? item.shape : {};
    const stroke = isRecord(item.stroke) ? item.stroke : {};
    const width = Math.max(1, numberOf(item.width, 100));
    const height = Math.max(1, numberOf(item.height, source === 'square' ? width : 100));
    const x = numberOf(item.x, 0);
    const y = numberOf(item.y, 0);
    const rotation = (numberOf(item.rotation, 0) * Math.PI) / 180;

    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, numberOf(item.opacity, 1)));
    applyBlendMode(ctx, item.blendMode);
    applyShadow(ctx, item.shadow);
    ctx.translate(x + width / 2, y + height / 2);
    if (rotation) ctx.rotate(rotation);
    ctx.translate(-width / 2, -height / 2);

    ctx.beginPath();

    if (source === 'circle') {
      const radius = numberOf(shape.radius, Math.min(width, height) / 2);
      ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
    } else if (source === 'triangle') {
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
    } else if (source === 'trapezium') {
      const topWidth = width * 0.6;
      const topOffset = (width - topWidth) / 2;
      ctx.moveTo(topOffset, 0);
      ctx.lineTo(topOffset + topWidth, 0);
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
    } else if (source === 'star') {
      const outer = numberOf(shape.outerRadius, Math.min(width, height) / 2);
      const inner = numberOf(shape.innerRadius, outer * 0.4);
      const points = 5;
      for (let i = 0; i < points * 2; i += 1) {
        const radius = i % 2 === 0 ? outer : inner;
        const angle = (i * Math.PI) / points - Math.PI / 2;
        const px = width / 2 + Math.cos(angle) * radius;
        const py = height / 2 + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (source === 'heart') {
      ctx.moveTo(width / 2, height * 0.9);
      ctx.bezierCurveTo(width * 0.35, height * 0.6, width * 0.1, height * 0.55, width * 0.1, height * 0.3333);
      ctx.bezierCurveTo(width * 0.1, height * 0.1, width * 0.5, height * 0.05, width * 0.5, height * 0.3333);
      ctx.bezierCurveTo(width * 0.5, height * 0.05, width * 0.9, height * 0.1, width * 0.9, height * 0.3333);
      ctx.bezierCurveTo(width * 0.9, height * 0.55, width * 0.65, height * 0.6, width / 2, height * 0.9);
      ctx.closePath();
    } else if (source === 'polygon') {
      const rawPoints = Array.isArray(shape.points) ? shape.points : [];
      const points = rawPoints.filter(isRecord);

      if (points.length > 0) {
        const first = points[0];
        ctx.moveTo(numberOf(first.x, x) - x, numberOf(first.y, y) - y);
        for (let i = 1; i < points.length; i += 1) {
          ctx.lineTo(numberOf(points[i].x, x) - x, numberOf(points[i].y, y) - y);
        }
        ctx.closePath();
      } else {
        const sides = Math.max(3, Math.round(numberOf(shape.sides, 6)));
        const radius = Math.min(width, height) / 2;
        for (let i = 0; i < sides; i += 1) {
          const angle = (i * Math.PI * 2) / sides - Math.PI / 2;
          const px = width / 2 + Math.cos(angle) * radius;
          const py = height / 2 + Math.sin(angle) * radius;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      }
    } else if (source === 'arc' || source === 'pieSlice') {
      const centerX = numberOf(shape.centerX, x + width / 2) - x;
      const centerY = numberOf(shape.centerY, y + height / 2) - y;
      const outerRadius = numberOf(
        shape.radius,
        numberOf(shape.outerRadius, Math.min(width, height) / 2),
      );
      const innerRadius = Math.max(0, numberOf(shape.innerRadius, 0));
      const startAngle = numberOf(shape.startAngle, 0);
      const endAngle = numberOf(shape.endAngle, Math.PI * 2);

      if (innerRadius > 0) {
        ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
        ctx.lineTo(
          centerX + innerRadius * Math.cos(endAngle),
          centerY + innerRadius * Math.sin(endAngle),
        );
        ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
        ctx.closePath();
      } else {
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
        ctx.lineTo(centerX, centerY);
        ctx.closePath();
      }
    } else {
      const strokeRadius = stroke.borderRadius;
      const radius =
        item.borderRadius === 'circular' || strokeRadius === 'circular'
          ? Math.min(width, height) / 2
          : numberOf(item.borderRadius, numberOf(strokeRadius, 0));
      const drawHeight = source === 'square' ? width : height;
      drawRoundedRect(ctx, 0, 0, width, drawHeight, radius);
    }

    if (isRecord(shape.gradient)) {
      ctx.fillStyle = createGradient(ctx, shape.gradient, width, height);
    } else {
      ctx.fillStyle = stringOf(shape.color, '#6f86ff');
    }

    if (boolOf(shape.fill, true)) ctx.fill();

    const strokeWidth = numberOf(stroke.width, 0);
    if (strokeWidth > 0) {
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = stringOf(stroke.color, '#ffffff');
      ctx.stroke();
    }

    ctx.restore();
  }

  return usedGeneratedSources;
}


function remoteImageSource(source: string): boolean {
  return /^https?:\/\//i.test(source);
}
function remoteImageHost(source: string): string {
  try { return new URL(source).hostname || 'remote host'; } catch { return 'remote host'; }
}
function alignedImageOffset(align:string, outerWidth:number, outerHeight:number, drawWidth:number, drawHeight:number) {
  let x=(outerWidth-drawWidth)/2, y=(outerHeight-drawHeight)/2;
  if (align.includes('left')) x=0; else if (align.includes('right')) x=outerWidth-drawWidth;
  if (align.includes('top')) y=0; else if (align.includes('bottom')) y=outerHeight-drawHeight;
  return {x,y};
}
async function fetchRemoteImageBitmap(source:string):Promise<ImageBitmap>{
  const controller=new AbortController();
  const timeout=window.setTimeout(()=>controller.abort(),REMOTE_IMAGE_TIMEOUT_MS);
  try{
    const response=await fetch(source,{signal:controller.signal,mode:'cors',credentials:'omit',redirect:'follow'});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const announcedBytes=Number(response.headers.get('content-length')||0);
    if(Number.isFinite(announcedBytes)&&announcedBytes>MAX_REMOTE_IMAGE_BYTES) throw new Error('image exceeds the 8 MiB Apexify Web limit');
    const blob=await response.blob();
    if(blob.size>MAX_REMOTE_IMAGE_BYTES) throw new Error('image exceeds the 8 MiB Apexify Web limit');
    if(blob.type&&!blob.type.toLowerCase().startsWith('image/')) throw new Error(`expected image content, received ${blob.type}`);
    const bitmap=await createImageBitmap(blob);
    if(bitmap.width*bitmap.height>MAX_REMOTE_IMAGE_PIXELS){bitmap.close();throw new Error('decoded image exceeds the 12 million pixel Apexify Web limit');}
    return bitmap;
  } finally { window.clearTimeout(timeout); }
}
function drawBitmapFitted(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  width: number,
  height: number,
  fit: string,
  align: string,
) {
  if (fit === 'contain' || fit === 'cover') {
    const scale =
      fit === 'cover'
        ? Math.max(width / bitmap.width, height / bitmap.height)
        : Math.min(width / bitmap.width, height / bitmap.height);
    const drawWidth = bitmap.width * scale;
    const drawHeight = bitmap.height * scale;
    const offset = alignedImageOffset(align, width, height, drawWidth, drawHeight);
    ctx.drawImage(bitmap, offset.x, offset.y, drawWidth, drawHeight);
    return;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
}

async function previewBitmapFromSource(
  source: string,
  studioAssetsById: ReadonlyMap<string, WebVirtualAsset>,
  warnings: string[],
  context: string,
): Promise<ImageBitmap | null> {
  const studioAssetId = studioAssetIdFromReference(source);
  if (studioAssetId) {
    const asset = studioAssetsById.get(studioAssetId);
    if (!asset) {
      warnings.push(`${context}: Studio asset ${source} is not loaded in this session.`);
      return null;
    }
    if (!asset.mime.startsWith('image/')) {
      warnings.push(`${context}: Studio asset ${asset.name} is ${asset.mime}, not an image.`);
      return null;
    }
    try {
      const bitmap = await studioAssetBitmap(asset);
      if (bitmap.width * bitmap.height > MAX_REMOTE_IMAGE_PIXELS) {
        bitmap.close();
        throw new Error('decoded image exceeds the 12 million pixel Apexify Web limit');
      }
      return bitmap;
    } catch (error) {
      warnings.push(
        `${context}: Studio image asset ${asset.name} could not be decoded: ${error instanceof Error ? error.message : 'unknown image error'}.`,
      );
      return null;
    }
  }

  if (remoteImageSource(source)) {
    try {
      return await fetchRemoteImageBitmap(source);
    } catch (error) {
      warnings.push(
        `${context}: remote image from ${remoteImageHost(source)} could not be rendered: ${error instanceof Error ? error.message : 'request failed'}.`,
      );
      return null;
    }
  }

  warnings.push(
    `${context}: local filesystem image paths are not available to Apexify Web. Upload the image as a Studio asset or use an HTTP(S) URL.`,
  );
  return null;
}

function studioAssetBitmap(asset: WebVirtualAsset): Promise<ImageBitmap> {
  const binary = atob(asset.base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return createImageBitmap(new Blob([bytes], { type: asset.mime || 'application/octet-stream' }));
}

async function drawStudioAssetImageLayer(
  ctx: CanvasRenderingContext2D,
  item: RecordValue,
  asset: WebVirtualAsset,
  warnings: string[],
) {
  if (!asset.mime.startsWith('image/')) {
    warnings.push(
      `Studio asset ${asset.name} is ${asset.mime}; createImage() browser preview accepts image assets only.`,
    );
    return;
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await studioAssetBitmap(asset);
    if (bitmap.width * bitmap.height > MAX_REMOTE_IMAGE_PIXELS) {
      throw new Error('decoded image exceeds the 12 million pixel Apexify Web limit');
    }

    const intrinsicWidth = Math.max(1, bitmap.width);
    const intrinsicHeight = Math.max(1, bitmap.height);
    const width = Math.max(1, numberOf(item.width, intrinsicWidth));
    const height = Math.max(1, numberOf(item.height, intrinsicHeight));
    const x = numberOf(item.x, 0);
    const y = numberOf(item.y, 0);
    const rotation = (numberOf(item.rotation, 0) * Math.PI) / 180;
    const fit = stringOf(item.fit, 'fill');
    const align = stringOf(item.align, 'center');
    const stroke = isRecord(item.stroke) ? item.stroke : {};
    const rawRadius = item.borderRadius;
    const radius =
      rawRadius === 'circular'
        ? Math.min(width, height) / 2
        : Math.max(0, numberOf(rawRadius, numberOf(stroke.borderRadius, 0)));

    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, numberOf(item.opacity, 1)));
    applyBlendMode(ctx, item.blendMode);
    ctx.translate(x + width / 2, y + height / 2);
    if (rotation) ctx.rotate(rotation);
    ctx.translate(-width / 2, -height / 2);

    if (isRecord(item.shadow)) {
      applyShadow(ctx, item.shadow);
      drawRoundedRect(ctx, 0, 0, width, height, radius);
      ctx.fillStyle = 'rgba(0,0,0,0.01)';
      ctx.fill();
      ctx.shadowColor = 'rgba(0,0,0,0)';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }

    if (radius > 0) {
      drawRoundedRect(ctx, 0, 0, width, height, radius);
      ctx.clip();
    }

    if (fit === 'contain' || fit === 'cover') {
      const scale =
        fit === 'cover'
          ? Math.max(width / intrinsicWidth, height / intrinsicHeight)
          : Math.min(width / intrinsicWidth, height / intrinsicHeight);
      const drawWidth = intrinsicWidth * scale;
      const drawHeight = intrinsicHeight * scale;
      const offset = alignedImageOffset(align, width, height, drawWidth, drawHeight);
      ctx.drawImage(bitmap, offset.x, offset.y, drawWidth, drawHeight);
    } else {
      ctx.drawImage(bitmap, 0, 0, width, height);
    }

    const strokeWidth = numberOf(stroke.width, 0);
    if (strokeWidth > 0) {
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = stringOf(stroke.color, '#ffffff');
      drawRoundedRect(
        ctx,
        strokeWidth / 2,
        strokeWidth / 2,
        width - strokeWidth,
        height - strokeWidth,
        radius,
      );
      ctx.stroke();
    }

    ctx.restore();
  } catch (error) {
    warnings.push(
      `Studio image asset ${asset.name} could not be rendered: ${error instanceof Error ? error.message : 'unknown image error'}.`,
    );
  } finally {
    bitmap?.close();
  }
}

async function drawRemoteImageLayer(ctx:CanvasRenderingContext2D,item:RecordValue,warnings:string[]){
  const source=stringOf(item.source,''); let bitmap:ImageBitmap|null=null;
  try{
    bitmap=await fetchRemoteImageBitmap(source);
    const intrinsicWidth=Math.max(1,bitmap.width), intrinsicHeight=Math.max(1,bitmap.height);
    const width=Math.max(1,numberOf(item.width,intrinsicWidth)), height=Math.max(1,numberOf(item.height,intrinsicHeight));
    const x=numberOf(item.x,0), y=numberOf(item.y,0), rotation=(numberOf(item.rotation,0)*Math.PI)/180;
    const fit=stringOf(item.fit,'fill'), align=stringOf(item.align,'center'), stroke=isRecord(item.stroke)?item.stroke:{};
    const rawRadius=item.borderRadius;
    const radius=rawRadius==='circular'?Math.min(width,height)/2:Math.max(0,numberOf(rawRadius,numberOf(stroke.borderRadius,0)));
    ctx.save();
    ctx.globalAlpha=Math.min(1,Math.max(0,numberOf(item.opacity,1)));
    applyBlendMode(ctx,item.blendMode);
    ctx.translate(x+width/2,y+height/2); if(rotation)ctx.rotate(rotation); ctx.translate(-width/2,-height/2);
    if(isRecord(item.shadow)){
      applyShadow(ctx,item.shadow); drawRoundedRect(ctx,0,0,width,height,radius);
      ctx.fillStyle='rgba(0,0,0,0.01)'; ctx.fill();
      ctx.shadowColor='rgba(0,0,0,0)'; ctx.shadowBlur=0; ctx.shadowOffsetX=0; ctx.shadowOffsetY=0;
    }
    if(radius>0){drawRoundedRect(ctx,0,0,width,height,radius);ctx.clip();}
    if(fit==='contain'||fit==='cover'){
      const scale=fit==='cover'?Math.max(width/intrinsicWidth,height/intrinsicHeight):Math.min(width/intrinsicWidth,height/intrinsicHeight);
      const drawWidth=intrinsicWidth*scale, drawHeight=intrinsicHeight*scale;
      const offset=alignedImageOffset(align,width,height,drawWidth,drawHeight);
      ctx.drawImage(bitmap,offset.x,offset.y,drawWidth,drawHeight);
    }else ctx.drawImage(bitmap,0,0,width,height);
    const strokeWidth=numberOf(stroke.width,0);
    if(strokeWidth>0){ctx.lineWidth=strokeWidth;ctx.strokeStyle=stringOf(stroke.color,'#ffffff');drawRoundedRect(ctx,strokeWidth/2,strokeWidth/2,width-strokeWidth,height-strokeWidth,radius);ctx.stroke();}
    ctx.restore();
  }catch(error){
    warnings.push(`Remote image could not be loaded in Apexify Web (${remoteImageHost(source)}): ${error instanceof Error?error.message:'unknown browser image error'}.`);
  }finally{bitmap?.close();}
}
async function applyImageLayersInOrder(
  ctx: CanvasRenderingContext2D,
  value: Jsonish,
  generatedChartsBySource: Map<string, HTMLCanvasElement>,
  studioAssetsById: ReadonlyMap<string, WebVirtualAsset>,
  warnings: string[],
): Promise<Set<string>> {
  const list = Array.isArray(value) ? value : [value];
  const usedGeneratedSources = new Set<string>();
  let remoteCount = 0;

  for (const item of list) {
    if (!isRecord(item)) continue;
    const source = stringOf(item.source, '');

    if (SHAPES.has(source) || isUnresolvedPreviewValue(item.source)) {
      const used = applyImageShapes(ctx, item, generatedChartsBySource);
      for (const label of used) usedGeneratedSources.add(label);
      continue;
    }

    const studioAssetId = studioAssetIdFromReference(source);
    if (studioAssetId) {
      const asset = studioAssetsById.get(studioAssetId);
      if (!asset) {
        warnings.push(`Studio asset ${source} is not loaded in this session.`);
      } else {
        await drawStudioAssetImageLayer(ctx, item, asset, warnings);
      }
      continue;
    }

    if (remoteImageSource(source)) {
      remoteCount += 1;
      if (remoteCount <= MAX_REMOTE_IMAGE_COUNT) {
        await drawRemoteImageLayer(ctx, item, warnings);
      }
    }
  }

  if (remoteCount > MAX_REMOTE_IMAGE_COUNT) {
    warnings.push(
      `Apexify Web renders at most ${MAX_REMOTE_IMAGE_COUNT} remote image layers per createImage() call; extra remote layers were skipped.`,
    );
  }
  return usedGeneratedSources;
}

function readInitializerExpression(source: string, start: number, end: number): string {
  let paren = 0;
  let brace = 0;
  let bracket = 0;
  let quote: string | null = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = start; i < end; i += 1) {
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
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
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
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(') paren += 1;
    else if (ch === ')') paren -= 1;
    else if (ch === '{') brace += 1;
    else if (ch === '}') brace -= 1;
    else if (ch === '[') bracket += 1;
    else if (ch === ']') bracket -= 1;
    else if (ch === ';' && paren === 0 && brace === 0 && bracket === 0) {
      return source.slice(start, i).trim();
    }
  }

  return source.slice(start, end).trim();
}

function findInitializerBefore(source: string, name: string, beforeIndex: number): string | null {
  const prefix = source.slice(0, Math.max(0, beforeIndex));
  const escapedName = name.split('$').join('\\$');
  const re = new RegExp('\\b(?:const|let|var)\\s+' + escapedName + '\\s*=', 'g');
  let match: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((match = re.exec(prefix))) last = match;
  if (!last) return null;
  const expressionStart = last.index + last[0].length;
  return readInitializerExpression(source, expressionStart, beforeIndex) || null;
}
function resolveCallArgument(
  source: string,
  call: Call,
  expression: string | undefined,
  resolve: (expression: string, sourceIndex: number) => Jsonish,
): Jsonish {
  if (!expression) return null;
  let direct: Jsonish;
  try {
    direct = resolve(expression, call.index);
  } catch {
    direct = parseLiteral(expression);
  }

  if (!hasUnresolved(direct)) return direct;
  const identifier = expression.trim().match(/^[A-Za-z_$][\w$]*$/)?.[0];
  if (!identifier) return direct;
  const initializer = findInitializerBefore(source, identifier, call.index);
  if (!initializer) return direct;
  try {
    return resolve(initializer, call.index);
  } catch {
    return parseLiteral(initializer);
  }
}


function phase7ObjectProperty(
  raw: string,
  property: string,
): { expression: string; start: number; end: number } | null {
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;
  const bodyStart = firstBrace + 1;
  const bodyEnd = lastBrace;
  const body = raw.slice(bodyStart, bodyEnd);
  const re = new RegExp('(?:^|,)\\s*' + property + '\\s*(?::|(?=,|$))', 'g');
  let match: RegExpExecArray | null;

  while ((match = re.exec(body))) {
    const absoluteMatch = bodyStart + match.index;
    const colonInMatch = match[0].lastIndexOf(':');
    if (colonInMatch < 0) {
      const tokenStart = absoluteMatch + match[0].lastIndexOf(property);
      return {
        expression: property,
        start: tokenStart,
        end: tokenStart + property.length,
      };
    }

    const valueStart = absoluteMatch + colonInMatch + 1;
    let paren = 0;
    let brace = 0;
    let bracket = 0;
    let quote = '';
    let escaped = false;
    let lineComment = false;
    let blockComment = false;

    for (let i = valueStart; i < bodyEnd; i += 1) {
      const ch = raw[i];
      const next = raw[i + 1];
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
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === quote) quote = '';
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
      if (ch === '"' || ch === "'" || ch === String.fromCharCode(96)) {
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
        return {
          expression: raw.slice(valueStart, i).trim(),
          start: valueStart,
          end: i,
        };
      }
    }

    return {
      expression: raw.slice(valueStart, bodyEnd).trim(),
      start: valueStart,
      end: bodyEnd,
    };
  }

  return null;
}

function phase7ManipulationArgument(
  source: string,
  call: Call,
  resolve: (expression: string, sourceIndex: number) => Jsonish,
): { options: Jsonish; processorExpression: string | null } {
  const rawArgument = call.args[1] ?? '{}';
  const directIdentifier = rawArgument.trim().match(/^[A-Za-z_$][\w$]*$/)?.[0];
  const rawOptions = directIdentifier
    ? findInitializerBefore(source, directIdentifier, call.index) ?? rawArgument
    : rawArgument;
  const processor = phase7ObjectProperty(rawOptions, 'processor');

  if (!processor) {
    return {
      options: resolveCallArgument(source, call, rawArgument, resolve),
      processorExpression: null,
    };
  }

  const sanitized =
    processor.expression === 'processor'
      ? rawOptions.slice(0, processor.start) +
        'processor: null' +
        rawOptions.slice(processor.end)
      : rawOptions.slice(0, processor.start) +
        ' null' +
        rawOptions.slice(processor.end);

  let options: Jsonish;
  try {
    options = resolve(sanitized, call.index);
  } catch {
    options = parseLiteral(sanitized);
  }

  return { options, processorExpression: processor.expression };
}

function chartPadding(options: RecordValue) {
  const dimensions = isRecord(options.dimensions) ? options.dimensions : {};
  const padding = isRecord(dimensions.padding) ? dimensions.padding : {};
  return {
    top: Math.max(18, numberOf(padding.top, 46)),
    right: Math.max(18, numberOf(padding.right, 36)),
    bottom: Math.max(24, numberOf(padding.bottom, 52)),
    left: Math.max(28, numberOf(padding.left, 62)),
  };
}

function createChartCanvas(chartType: string, rawData: Jsonish, optionsValue: Jsonish): HTMLCanvasElement | null {
  const options = isRecord(optionsValue) ? optionsValue : {};
  const dimensions = isRecord(options.dimensions) ? options.dimensions : {};
  const width = Math.round(Math.min(4096, Math.max(120, numberOf(dimensions.width, 800))));
  const height = Math.round(Math.min(4096, Math.max(120, numberOf(dimensions.height, 520))));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return null;

  const appearance = isRecord(options.appearance) ? options.appearance : {};
  const backgroundGradient = isRecord(appearance.backgroundGradient) ? appearance.backgroundGradient : null;
  ctx.fillStyle = backgroundGradient
    ? createGradient(ctx, backgroundGradient, width, height)
    : stringOf(appearance.backgroundColor, '#0f172a');
  ctx.fillRect(0, 0, width, height);

  const appearanceLayers = Array.isArray(appearance.bgLayers) ? appearance.bgLayers : [];
  for (const layer of appearanceLayers) {
    if (!isRecord(layer)) continue;
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, numberOf(layer.opacity, 1)));
    const blend = stringOf(layer.blendMode, 'source-over');
    try {
      ctx.globalCompositeOperation = blend as GlobalCompositeOperation;
    } catch {
      ctx.globalCompositeOperation = 'source-over';
    }
    if (stringOf(layer.type, '') === 'gradient' && isRecord(layer.value)) {
      ctx.fillStyle = createGradient(ctx, layer.value, width, height);
      ctx.fillRect(0, 0, width, height);
    } else if (stringOf(layer.type, '') === 'presetPattern' && isRecord(layer.pattern)) {
      drawPattern(ctx, layer.pattern, width, height);
    }
    ctx.restore();
  }

  if (isRecord(appearance.patternBg)) {
    ctx.save();
    const blend = stringOf(appearance.patternBg.blendMode, 'source-over');
    try {
      ctx.globalCompositeOperation = blend as GlobalCompositeOperation;
    } catch {
      ctx.globalCompositeOperation = 'source-over';
    }
    drawPattern(ctx, appearance.patternBg, width, height);
    ctx.restore();
  }

  if (isRecord(appearance.noiseBg)) {
    drawNoise(ctx, width, height, Math.min(0.08, Math.max(0, numberOf(appearance.noiseBg.intensity, 0))));
  }

  const padding = chartPadding(options);
  const labels = isRecord(options.labels) ? options.labels : {};
  const title = isRecord(labels.title) ? labels.title : {};
  const titleText = stringOf(title.text, '');
  const titleSize = Math.max(12, numberOf(title.fontSize, 20));
  const titleColor = stringOf(title.color, '#f8fafc');
  if (titleText) {
    ctx.save();
    ctx.fillStyle = titleColor;
    ctx.font = `700 ${titleSize}px Arial`;
    ctx.textBaseline = 'top';
    ctx.fillText(titleText, padding.left, Math.max(10, padding.top * 0.35));
    ctx.restore();
    padding.top = Math.max(padding.top, titleSize + 30);
  }

  const plot = {
    x: padding.left,
    y: padding.top,
    w: Math.max(20, width - padding.left - padding.right),
    h: Math.max(20, height - padding.top - padding.bottom),
  };

  const axes = isRecord(options.axes) ? options.axes : {};
  const xAxis = isRecord(axes.x) ? axes.x : {};
  const yAxis = isRecord(axes.y) ? axes.y : {};
  const axisColor = stringOf(yAxis.color, stringOf(xAxis.color, stringOf(appearance.axisColor, '#cbd5e1')));
  const grid = isRecord(options.grid) ? options.grid : {};
  const data = Array.isArray(rawData) ? rawData.filter(isRecord) : [];

  const axisRange = (axis: RecordValue, values: number[], fallbackMin = 0) => {
    const range = isRecord(axis.range) ? axis.range : {};
    const finite = values.filter(Number.isFinite);
    const min = typeof range.min === 'number'
      ? range.min
      : finite.length
        ? Math.min(fallbackMin, ...finite)
        : fallbackMin;
    const maxRaw = typeof range.max === 'number'
      ? range.max
      : finite.length
        ? Math.max(...finite)
        : min + 1;
    const max = maxRaw === min ? min + 1 : maxRaw;
    return { min, max };
  };

  const drawCartesianFrame = (xRange: { min: number; max: number }, yRange: { min: number; max: number }) => {
    ctx.save();
    if (boolOf(grid.show, true)) {
      ctx.strokeStyle = stringOf(grid.color, 'rgba(148,163,184,.16)');
      ctx.lineWidth = Math.max(0.5, numberOf(grid.width, 1));
      for (let i = 0; i <= 5; i += 1) {
        const yy = plot.y + (plot.h * i) / 5;
        ctx.beginPath();
        ctx.moveTo(plot.x, yy);
        ctx.lineTo(plot.x + plot.w, yy);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = axisColor;
    ctx.lineWidth = Math.max(1, numberOf(appearance.axisWidth, 1.5));
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();

    ctx.fillStyle = stringOf(yAxis.tickColor, stringOf(yAxis.labelColor, axisColor));
    ctx.font = `${Math.max(9, numberOf(yAxis.tickFontSize, 11))}px Arial`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 5; i += 1) {
      const value = yRange.max - ((yRange.max - yRange.min) * i) / 5;
      const yy = plot.y + (plot.h * i) / 5;
      ctx.fillText(Number.isInteger(value) ? String(value) : value.toFixed(1), plot.x - 8, yy);
    }

    const xLabel = stringOf(xAxis.label, '');
    const yLabel = stringOf(yAxis.label, '');
    if (xLabel) {
      ctx.fillStyle = stringOf(xAxis.labelColor, axisColor);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.font = `600 ${Math.max(10, numberOf(xAxis.tickFontSize, 11))}px Arial`;
      ctx.fillText(xLabel, plot.x + plot.w / 2, height - 8);
    }
    if (yLabel) {
      ctx.save();
      ctx.fillStyle = stringOf(yAxis.labelColor, axisColor);
      ctx.translate(14, plot.y + plot.h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = `600 ${Math.max(10, numberOf(yAxis.tickFontSize, 11))}px Arial`;
      ctx.fillText(yLabel, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  };

  if (chartType === 'pie' || chartType === 'doughnut' || chartType === 'donut') {
    const values = data.map((item) => Math.max(0, numberOf(item.value, 0)));
    const total = values.reduce((sum, value) => sum + value, 0) || 1;
    const cx = plot.x + plot.w / 2;
    const cy = plot.y + plot.h / 2;
    const outer = Math.max(10, Math.min(plot.w, plot.h) * 0.42);
    const inner = chartType === 'pie' && stringOf(options.type, 'pie') !== 'donut' ? 0 : outer * 0.55;
    let angle = -Math.PI / 2;
    data.forEach((item, index) => {
      const next = angle + (values[index] / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.arc(cx, cy, outer, angle, next);
      if (inner > 0) {
        ctx.lineTo(cx + Math.cos(next) * inner, cy + Math.sin(next) * inner);
        ctx.arc(cx, cy, inner, next, angle, true);
      } else {
        ctx.lineTo(cx, cy);
      }
      ctx.closePath();
      ctx.fillStyle = stringOf(item.color, ['#38bdf8','#a78bfa','#fb7185','#34d399','#fbbf24','#60a5fa'][index % 6]);
      ctx.fill();
      angle = next;
    });
  } else if (chartType === 'polarArea') {
    const values = data.map((item) => Math.max(0, numberOf(item.value, 0)));
    const maxValue = Math.max(1, ...values);
    const polar = isRecord(options.polar) ? options.polar : {};
    const cx = plot.x + plot.w / 2;
    const cy = plot.y + plot.h / 2;
    const outer = Math.max(10, Math.min(plot.w, plot.h) * 0.43);
    const inner = outer * Math.min(0.9, Math.max(0, numberOf(polar.innerRadiusRatio, 0)));
    const start = (numberOf(polar.startAngleDeg, -90) * Math.PI) / 180;
    const sliceAngle = (Math.PI * 2) / Math.max(1, data.length);
    const areaScale = stringOf(options.scale, 'radius') === 'area';

    data.forEach((item, index) => {
      const ratio = Math.max(0, values[index] / maxValue);
      const radius = inner + (outer - inner) * (areaScale ? Math.sqrt(ratio) : ratio);
      const a0 = start + index * sliceAngle;
      const a1 = a0 + sliceAngle;
      ctx.save();
      ctx.globalAlpha = Math.min(
        1,
        Math.max(0, numberOf(polar.opacity, 1) * numberOf(item.opacity, 1)),
      );
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a0) * inner, cy + Math.sin(a0) * inner);
      ctx.arc(cx, cy, radius, a0, a1);
      if (inner > 0) {
        ctx.lineTo(cx + Math.cos(a1) * inner, cy + Math.sin(a1) * inner);
        ctx.arc(cx, cy, inner, a1, a0, true);
      } else {
        ctx.lineTo(cx, cy);
      }
      ctx.closePath();
      ctx.fillStyle = stringOf(
        item.color,
        ['#38bdf8','#a78bfa','#fb7185','#34d399','#fbbf24','#60a5fa'][index % 6],
      );
      ctx.fill();
      const strokeWidth = Math.max(0, numberOf(polar.sliceStrokeWidth, 1));
      if (strokeWidth > 0) {
        ctx.lineWidth = strokeWidth;
        ctx.strokeStyle = stringOf(polar.sliceStrokeColor, 'rgba(255,255,255,.28)');
        ctx.stroke();
      }
      ctx.restore();
    });
  } else if (chartType === 'radar') {
    const radar = isRecord(options.radar) ? options.radar : {};
    const categories = Array.isArray(radar.categories)
      ? radar.categories.map((value) => stringOf(value, ''))
      : [];
    const series = data.filter((item) => Array.isArray(item.values));
    const categoryCount = categories.length || Math.max(0, ...(series.map((item) => Array.isArray(item.values) ? item.values.length : 0)));
    if (categoryCount < 3) return null;

    const cx = plot.x + plot.w / 2;
    const cy = plot.y + plot.h / 2;
    const radius = Math.max(10, Math.min(plot.w, plot.h) * 0.38);
    const allValues = series.flatMap((item) =>
      Array.isArray(item.values) ? item.values.map((value) => numberOf(value, 0)) : [],
    );
    const maxValue = Math.max(1, numberOf(radar.maxValue, Math.max(1, ...allValues) * 1.05));
    const levels = Math.max(3, Math.min(10, Math.round(numberOf(radar.gridLevels, 5))));
    const gridColor = stringOf(radar.gridColor, 'rgba(148,163,184,.28)');
    const gridWidth = Math.max(0.5, numberOf(radar.gridWidth, 1));

    const pointAt = (index: number, valueRatio: number) => {
      const angle = -Math.PI / 2 + (index / categoryCount) * Math.PI * 2;
      return {
        x: cx + Math.cos(angle) * radius * valueRatio,
        y: cy + Math.sin(angle) * radius * valueRatio,
      };
    };

    ctx.save();
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = gridWidth;
    for (let level = 1; level <= levels; level += 1) {
      ctx.beginPath();
      for (let index = 0; index < categoryCount; index += 1) {
        const point = pointAt(index, level / levels);
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    for (let index = 0; index < categoryCount; index += 1) {
      const point = pointAt(index, 1);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }

    if (categories.length) {
      ctx.fillStyle = stringOf(radar.axisLabelColor, axisColor);
      ctx.font = `${Math.max(9, numberOf(radar.axisLabelFontSize, 11))}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      categories.forEach((label, index) => {
        const point = pointAt(index, 1.12);
        ctx.fillText(label, point.x, point.y);
      });
    }
    ctx.restore();

    series.forEach((seriesItem, seriesIndex) => {
      const values = Array.isArray(seriesItem.values) ? seriesItem.values : [];
      if (values.length < categoryCount) return;
      const color = stringOf(
        seriesItem.stroke,
        stringOf(seriesItem.color, ['#38bdf8','#a78bfa','#f472b6','#34d399','#fbbf24'][seriesIndex % 5]),
      );
      ctx.save();
      ctx.globalAlpha = Math.min(
        1,
        Math.max(0, numberOf(seriesItem.opacity, numberOf(radar.opacity, 1))),
      );
      ctx.beginPath();
      values.slice(0, categoryCount).forEach((rawValue, index) => {
        const point = pointAt(index, Math.max(0, numberOf(rawValue, 0)) / maxValue);
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
      if (boolOf(radar.fill, true)) {
        ctx.save();
        ctx.globalAlpha *= Math.min(1, Math.max(0, numberOf(seriesItem.fillOpacity, 0.24)));
        ctx.fillStyle = stringOf(seriesItem.color, color);
        ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, numberOf(seriesItem.lineWidth, 2));
      ctx.stroke();

      if (boolOf(radar.showPoints, false)) {
        values.slice(0, categoryCount).forEach((rawValue, index) => {
          const point = pointAt(index, Math.max(0, numberOf(rawValue, 0)) / maxValue);
          ctx.beginPath();
          ctx.arc(point.x, point.y, Math.max(1, numberOf(radar.pointRadius, 4)), 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        });
      }
      ctx.restore();
    });
  } else if (chartType === 'line' || chartType === 'scatter') {
    const series = data.length && Array.isArray(data[0].data) ? data : [{ label: '', color: '#38bdf8', data: rawData }];
    const points = series.flatMap((seriesItem) => Array.isArray(seriesItem.data) ? seriesItem.data.filter(isRecord) : []);
    const xValues = points.map((point) => numberOf(point.x, 0));
    const yValues = points.map((point) => numberOf(point.y, 0));
    const xRange = axisRange(xAxis, xValues, xValues.length ? Math.min(...xValues) : 0);
    const yRange = axisRange(yAxis, yValues, 0);
    drawCartesianFrame(xRange, yRange);

    const mapX = (value: number) => plot.x + ((value - xRange.min) / (xRange.max - xRange.min)) * plot.w;
    const mapY = (value: number) => plot.y + plot.h - ((value - yRange.min) / (yRange.max - yRange.min)) * plot.h;

    series.forEach((seriesItem, index) => {
      const seriesPoints = Array.isArray(seriesItem.data) ? seriesItem.data.filter(isRecord) : [];
      if (!seriesPoints.length) return;
      const stroke = stringOf(seriesItem.color, ['#38bdf8','#a78bfa','#fb7185','#34d399'][index % 4]);
      const lineWidth = Math.max(1, numberOf(seriesItem.lineWidth, 2.5));
      const area = isRecord(seriesItem.area) ? seriesItem.area : null;

      if (chartType === 'line' && area && boolOf(area.show, true)) {
        ctx.beginPath();
        seriesPoints.forEach((point, pointIndex) => {
          const x = mapX(numberOf(point.x, pointIndex));
          const y = mapY(numberOf(point.y, 0));
          if (pointIndex === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        const last = seriesPoints[seriesPoints.length - 1];
        const first = seriesPoints[0];
        ctx.lineTo(mapX(numberOf(last.x, seriesPoints.length - 1)), plot.y + plot.h);
        ctx.lineTo(mapX(numberOf(first.x, 0)), plot.y + plot.h);
        ctx.closePath();
        ctx.globalAlpha = Math.min(1, Math.max(0, numberOf(area.opacity, 0.2)));
        ctx.fillStyle = stringOf(area.color, stroke);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      if (chartType === 'line') {
        ctx.beginPath();
        seriesPoints.forEach((point, pointIndex) => {
          const x = mapX(numberOf(point.x, pointIndex));
          const y = mapY(numberOf(point.y, 0));
          if (pointIndex === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      for (const point of seriesPoints) {
        const x = mapX(numberOf(point.x, 0));
        const y = mapY(numberOf(point.y, 0));
        ctx.beginPath();
        ctx.arc(x, y, chartType === 'scatter' ? 4.5 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = stroke;
        ctx.fill();
      }
    });
  } else {
    const horizontal = chartType === 'horizontalBar';
    const grouped = data.some((item) => Array.isArray(item.values));
    const allValues = data.flatMap((item) =>
      Array.isArray(item.values)
        ? item.values.filter(isRecord).map((entry) => numberOf(entry.value, 0))
        : [numberOf(item.value, 0)],
    );
    const valueAxis = horizontal ? xAxis : yAxis;
    const valueRange = axisRange(valueAxis, allValues, Math.min(0, ...allValues));
    const explicitValueRange = isRecord(valueAxis.range) ? valueAxis.range : {};
    if (typeof explicitValueRange.min !== 'number') valueRange.min = Math.min(0, valueRange.min);
    if (typeof explicitValueRange.max !== 'number') valueRange.max = Math.max(0, valueRange.max);
    if (valueRange.max === valueRange.min) valueRange.max = valueRange.min + 1;
    const categoryRange = { min: 0, max: Math.max(1, data.length) };
    drawCartesianFrame(
      horizontal ? valueRange : categoryRange,
      horizontal ? categoryRange : valueRange,
    );

    const categoryStep = (horizontal ? plot.h : plot.w) / Math.max(1, data.length);
    data.forEach((item, categoryIndex) => {
      const entries = Array.isArray(item.values) ? item.values.filter(isRecord) : [item];
      const innerStep = categoryStep * 0.72 / Math.max(1, entries.length);
      entries.forEach((entry, entryIndex) => {
        const value = numberOf(entry.value, 0);
        const color = stringOf(entry.color, stringOf(item.color, ['#38bdf8','#a78bfa','#fb7185','#34d399'][entryIndex % 4]));
        const zeroRatio = (0 - valueRange.min) / (valueRange.max - valueRange.min);
        const valueRatio = (value - valueRange.min) / (valueRange.max - valueRange.min);

        if (horizontal) {
          const y = plot.y + categoryIndex * categoryStep + categoryStep * 0.14 + entryIndex * innerStep;
          const x0 = plot.x + zeroRatio * plot.w;
          const x1 = plot.x + valueRatio * plot.w;
          ctx.fillStyle = color;
          ctx.fillRect(Math.min(x0, x1), y, Math.abs(x1 - x0), Math.max(3, innerStep - 3));
        } else {
          const x = plot.x + categoryIndex * categoryStep + categoryStep * 0.14 + entryIndex * innerStep;
          const y0 = plot.y + plot.h - zeroRatio * plot.h;
          const y1 = plot.y + plot.h - valueRatio * plot.h;
          if (stringOf(options.type, '') === 'lollipop') {
            ctx.strokeStyle = color;
            ctx.lineWidth = Math.max(1, numberOf(isRecord(options.bars) ? options.bars.lineWidth : undefined, 2));
            ctx.beginPath();
            ctx.moveTo(x + innerStep / 2, y0);
            ctx.lineTo(x + innerStep / 2, y1);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x + innerStep / 2, y1, Math.max(4, numberOf(isRecord(options.bars) ? options.bars.dotSize : undefined, 8) / 2), 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
          } else {
            ctx.fillStyle = color;
            ctx.fillRect(x, Math.min(y0, y1), Math.max(3, innerStep - 3), Math.abs(y1 - y0));
          }
        }
      });

      const label = stringOf(item.label, String(categoryIndex + 1));
      ctx.save();
      ctx.fillStyle = stringOf(horizontal ? yAxis.tickColor : xAxis.tickColor, axisColor);
      ctx.font = `${Math.max(9, numberOf(horizontal ? yAxis.tickFontSize : xAxis.tickFontSize, 10))}px Arial`;
      if (horizontal) {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, plot.x - 8, plot.y + categoryIndex * categoryStep + categoryStep / 2);
      } else {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(label, plot.x + categoryIndex * categoryStep + categoryStep / 2, plot.y + plot.h + 8);
      }
      ctx.restore();
    });
    void grouped;
  }

  const borderWidth = Math.max(0, numberOf(appearance.borderWidth, 0));
  if (borderWidth > 0) {
    ctx.save();
    ctx.strokeStyle = stringOf(appearance.borderColor, axisColor);
    ctx.lineWidth = borderWidth;
    drawRoundedRect(ctx, borderWidth / 2, borderWidth / 2, width - borderWidth, height - borderWidth, numberOf(appearance.borderRadius, 0));
    ctx.stroke();
    ctx.restore();
  }

  return canvas;
}

function drawChartContain(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / source.width, height / source.height);
  const drawWidth = source.width * scale;
  const drawHeight = source.height * scale;
  ctx.drawImage(
    source,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function createComparisonChartCanvas(optionsValue: Jsonish): HTMLCanvasElement | null {
  if (!isRecord(optionsValue)) return null;
  const dimensions = isRecord(optionsValue.dimensions) ? optionsValue.dimensions : {};
  const width = Math.round(Math.min(4096, Math.max(240, numberOf(dimensions.width, 900))));
  const height = Math.round(Math.min(4096, Math.max(180, numberOf(dimensions.height, 480))));
  const chart1 = isRecord(optionsValue.chart1) ? optionsValue.chart1 : null;
  const chart2 = isRecord(optionsValue.chart2) ? optionsValue.chart2 : null;
  if (!chart1 || !chart2) return null;

  const renderChild = (config: RecordValue) => {
    const type = stringOf(config.type, 'bar');
    const childOptions = isRecord(config.options) ? { ...config.options } : {};
    if (type === 'donut') childOptions.type = 'donut';
    const title = isRecord(config.title) ? config.title : null;
    if (title) {
      const labels = isRecord(childOptions.labels) ? childOptions.labels : {};
      childOptions.labels = { ...labels, title };
    }
    return createChartCanvas(type === 'donut' ? 'pie' : type, config.data ?? [], childOptions);
  };

  const first = renderChild(chart1);
  const second = renderChild(chart2);
  if (!first || !second) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return null;

  const appearance = isRecord(optionsValue.appearance) ? optionsValue.appearance : {};
  ctx.fillStyle = stringOf(appearance.backgroundColor, '#0f172a');
  ctx.fillRect(0, 0, width, height);

  const padding = isRecord(dimensions.padding) ? dimensions.padding : {};
  const left = Math.max(12, numberOf(padding.left, 28));
  const right = Math.max(12, numberOf(padding.right, 28));
  const top = Math.max(12, numberOf(padding.top, 28));
  const bottom = Math.max(12, numberOf(padding.bottom, 28));
  const spacing = Math.max(0, numberOf(optionsValue.spacing, 18));
  const title = isRecord(optionsValue.generalTitle) ? optionsValue.generalTitle : {};
  const titleText = stringOf(title.text, '');
  const titleSize = Math.max(12, numberOf(title.fontSize, 22));
  const titleHeight = titleText ? titleSize + 18 : 0;

  if (titleText) {
    ctx.save();
    ctx.fillStyle = stringOf(title.color, '#f8fafc');
    ctx.font = `700 ${titleSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(titleText, width / 2, top * 0.35);
    ctx.restore();
  }

  const x = left;
  const y = top + titleHeight;
  const innerWidth = Math.max(40, width - left - right);
  const innerHeight = Math.max(40, height - y - bottom);
  const layout = stringOf(optionsValue.layout, 'sideBySide');
  if (layout === 'topBottom') {
    const cellHeight = Math.max(20, (innerHeight - spacing) / 2);
    drawChartContain(ctx, first, x, y, innerWidth, cellHeight);
    drawChartContain(ctx, second, x, y + cellHeight + spacing, innerWidth, cellHeight);
  } else {
    const cellWidth = Math.max(20, (innerWidth - spacing) / 2);
    drawChartContain(ctx, first, x, y, cellWidth, innerHeight);
    drawChartContain(ctx, second, x + cellWidth + spacing, y, cellWidth, innerHeight);
  }
  return canvas;
}

function createComboChartCanvas(optionsValue: Jsonish): HTMLCanvasElement | null {
  if (!isRecord(optionsValue)) return null;
  const bars = Array.isArray(optionsValue.bars) ? optionsValue.bars : [];
  const lines = Array.isArray(optionsValue.lines) ? optionsValue.lines : [];
  if (!bars.length || !lines.length) return null;

  const axes = isRecord(optionsValue.axes) ? optionsValue.axes : {};
  const primaryOptions: RecordValue = {
    ...optionsValue,
    axes: {
      ...axes,
      y: isRecord(axes.y) ? axes.y : {},
    },
  };
  delete primaryOptions.bars;
  delete primaryOptions.lines;
  delete primaryOptions.secondaryYAxis;
  delete primaryOptions.opacity;
  delete primaryOptions.barStyle;

  const base = createChartCanvas('bar', bars, primaryOptions);
  if (!base) return null;

  const transparentAppearance: RecordValue = {
    ...(isRecord(optionsValue.appearance) ? optionsValue.appearance : {}),
    backgroundColor: 'rgba(0,0,0,0)',
    bgLayers: [],
  };
  delete transparentAppearance.backgroundGradient;
  delete transparentAppearance.patternBg;
  delete transparentAppearance.noiseBg;

  const secondary = isRecord(axes.ySecondary)
    ? axes.ySecondary
    : isRecord(axes.y)
      ? axes.y
      : {};
  const lineOptions: RecordValue = {
    ...optionsValue,
    appearance: transparentAppearance,
    axes: {
      ...axes,
      y: {
        ...secondary,
        color: 'rgba(0,0,0,0)',
        labelColor: 'rgba(0,0,0,0)',
        tickColor: 'rgba(0,0,0,0)',
      },
      x: {
        ...(isRecord(axes.x) ? axes.x : {}),
        color: 'rgba(0,0,0,0)',
        labelColor: 'rgba(0,0,0,0)',
        tickColor: 'rgba(0,0,0,0)',
      },
    },
    grid: { show: false },
    labels: { title: { text: '' } },
    legend: { show: false },
  };
  delete lineOptions.bars;
  delete lineOptions.lines;
  delete lineOptions.secondaryYAxis;
  delete lineOptions.opacity;
  delete lineOptions.barStyle;

  const overlay = createChartCanvas('line', lines, lineOptions);
  if (!overlay) return base;
  const ctx = base.getContext('2d');
  ctx?.drawImage(overlay, 0, 0, base.width, base.height);
  return base;
}


function phase7PathCommands(value: Jsonish): RecordValue[] {
  if (!Array.isArray(value)) throw new Error('Path commands must resolve to an array.');
  const commands = value.filter(isRecord);
  if (commands.length !== value.length) throw new Error('Every path command must be an object.');
  if (commands.length > 10000) throw new Error('Apexify Web limits a path to 10,000 commands.');
  return commands;
}

function phase7Path(value: Jsonish): Path2D {
  const path = new Path2D();
  for (const command of phase7PathCommands(value)) {
    const type = stringOf(command.type, '');
    if (type === 'moveTo') path.moveTo(numberOf(command.x, 0), numberOf(command.y, 0));
    else if (type === 'lineTo') path.lineTo(numberOf(command.x, 0), numberOf(command.y, 0));
    else if (type === 'arc') path.arc(numberOf(command.x,0), numberOf(command.y,0), Math.max(0,numberOf(command.radius,0)), numberOf(command.startAngle,0), numberOf(command.endAngle,Math.PI*2), boolOf(command.counterclockwise,false));
    else if (type === 'arcTo') path.arcTo(numberOf(command.x1,0), numberOf(command.y1,0), numberOf(command.x2,0), numberOf(command.y2,0), Math.max(0,numberOf(command.radius,0)));
    else if (type === 'quadraticCurveTo') path.quadraticCurveTo(numberOf(command.cpx,0), numberOf(command.cpy,0), numberOf(command.x,0), numberOf(command.y,0));
    else if (type === 'bezierCurveTo') path.bezierCurveTo(numberOf(command.cp1x,0), numberOf(command.cp1y,0), numberOf(command.cp2x,0), numberOf(command.cp2y,0), numberOf(command.x,0), numberOf(command.y,0));
    else if (type === 'rect') path.rect(numberOf(command.x,0), numberOf(command.y,0), numberOf(command.width,0), numberOf(command.height,0));
    else if (type === 'ellipse') path.ellipse(numberOf(command.x,0), numberOf(command.y,0), Math.max(0,numberOf(command.radiusX,0)), Math.max(0,numberOf(command.radiusY,0)), numberOf(command.rotation,0), numberOf(command.startAngle,0), numberOf(command.endAngle,Math.PI*2), boolOf(command.counterclockwise,false));
    else if (type === 'closePath') path.closePath();
    else if (type === 'circle') path.arc(numberOf(command.x,0), numberOf(command.y,0), Math.max(0,numberOf(command.radius,0)), 0, Math.PI*2);
    else if (type === 'roundedRect') {
      const x=numberOf(command.x,0), y=numberOf(command.y,0), w=numberOf(command.width,0), h=numberOf(command.height,0);
      const maxRadius=Math.max(0,Math.min(Math.abs(w)/2,Math.abs(h)/2));
      const radius=isRecord(command.radius)?command.radius:null;
      const tl=radius?Math.min(Math.max(0,numberOf(radius.tl,0)),maxRadius):Math.min(Math.max(0,numberOf(command.radius,0)),maxRadius);
      const tr=radius?Math.min(Math.max(0,numberOf(radius.tr,0)),maxRadius):tl;
      const br=radius?Math.min(Math.max(0,numberOf(radius.br,0)),maxRadius):tl;
      const bl=radius?Math.min(Math.max(0,numberOf(radius.bl,0)),maxRadius):tl;
      path.moveTo(x+tl,y);
      path.lineTo(x+w-tr,y);
      path.quadraticCurveTo(x+w,y,x+w,y+tr);
      path.lineTo(x+w,y+h-br);
      path.quadraticCurveTo(x+w,y+h,x+w-br,y+h);
      path.lineTo(x+bl,y+h);
      path.quadraticCurveTo(x,y+h,x,y+h-bl);
      path.lineTo(x,y+tl);
      path.quadraticCurveTo(x,y,x+tl,y);
      path.closePath();
    } else if (type === 'polygon') {
      const points = Array.isArray(command.points) ? command.points.filter(isRecord) : [];
      if (points.length) {
        path.moveTo(numberOf(points[0].x,0), numberOf(points[0].y,0));
        for (let i=1;i<points.length;i+=1) path.lineTo(numberOf(points[i].x,0), numberOf(points[i].y,0));
        path.closePath();
      }
    } else if (type === 'star') {
      const cx=numberOf(command.x,0), cy=numberOf(command.y,0), outer=Math.max(0,numberOf(command.outerRadius,0)), inner=Math.max(0,numberOf(command.innerRadius,outer/2));
      const points=Math.max(2,Math.min(256,Math.round(numberOf(command.points,5))));
      for (let i=0;i<points*2;i+=1) {
        const angle=-Math.PI/2+(i*Math.PI)/points, radius=i%2===0?outer:inner, x=cx+Math.cos(angle)*radius, y=cy+Math.sin(angle)*radius;
        if (i===0) path.moveTo(x,y); else path.lineTo(x,y);
      }
      path.closePath();
    } else if (type === 'arrow') {
      const x=numberOf(command.x,0), y=numberOf(command.y,0), length=Math.max(0,numberOf(command.length,0));
      const rad=numberOf(command.angle,0)*Math.PI/180;
      const head=Math.max(0,numberOf(command.headLength,length*.3));
      const spread=numberOf(command.headAngle,45)*Math.PI/180;
      const ex=x+Math.cos(rad)*length, ey=y+Math.sin(rad)*length;
      path.moveTo(x,y); path.lineTo(ex,ey);
      path.moveTo(ex,ey); path.lineTo(ex-Math.cos(rad-spread)*head,ey-Math.sin(rad-spread)*head);
      path.moveTo(ex,ey); path.lineTo(ex-Math.cos(rad+spread)*head,ey-Math.sin(rad+spread)*head);
    } else throw new Error('Unsupported Apexify Web path command: '+type);
  }
  return path;
}


function phase7Gradient(
  ctx: CanvasRenderingContext2D,
  config: RecordValue,
  bounds: { x: number; y: number; w: number; h: number },
): CanvasGradient | CanvasPattern {
  const makeGradient = (
    target: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
  ): CanvasGradient => {
    const rotatePoint = (
      px: number,
      py: number,
      pivotX: number,
      pivotY: number,
      deg: number,
    ): [number, number] => {
      if (!deg) return [px, py];
      const a = (deg * Math.PI) / 180;
      const dx = px - pivotX;
      const dy = py - pivotY;
      return [
        pivotX + dx * Math.cos(a) - dy * Math.sin(a),
        pivotY + dx * Math.sin(a) + dy * Math.cos(a),
      ];
    };

    const type = stringOf(config.type, 'linear');
    let gradient: CanvasGradient;
    if (type === 'radial') {
      const rotate = numberOf(config.rotate, 0);
      const pivotX = numberOf(config.pivotX, w / 2);
      const pivotY = numberOf(config.pivotY, h / 2);
      const [sx, sy] = rotatePoint(
        numberOf(config.startX, w / 2),
        numberOf(config.startY, h / 2),
        pivotX,
        pivotY,
        rotate,
      );
      const [ex, ey] = rotatePoint(
        numberOf(config.endX, w / 2),
        numberOf(config.endY, h / 2),
        pivotX,
        pivotY,
        rotate,
      );
      gradient = target.createRadialGradient(
        x + sx,
        y + sy,
        Math.max(0, numberOf(config.startRadius, 0)),
        x + ex,
        y + ey,
        Math.max(0, numberOf(config.endRadius, Math.max(w, h) / 2)),
      );
    } else if (type === 'conic' && typeof target.createConicGradient === 'function') {
      const rotate = numberOf(config.rotate, 0);
      const pivotX = numberOf(config.pivotX, w / 2);
      const pivotY = numberOf(config.pivotY, h / 2);
      const [cx, cy] = rotatePoint(
        numberOf(config.centerX, w / 2),
        numberOf(config.centerY, h / 2),
        pivotX,
        pivotY,
        rotate,
      );
      gradient = target.createConicGradient(
        ((numberOf(config.startAngle, 0) + rotate) * Math.PI) / 180,
        x + cx,
        y + cy,
      );
    } else {
      const rotate = numberOf(config.rotate, 0);
      const pivotX = numberOf(config.pivotX, w / 2);
      const pivotY = numberOf(config.pivotY, h / 2);
      const [sx, sy] = rotatePoint(
        numberOf(config.startX, 0),
        numberOf(config.startY, 0),
        pivotX,
        pivotY,
        rotate,
      );
      const [ex, ey] = rotatePoint(
        numberOf(config.endX, w),
        numberOf(config.endY, 0),
        pivotX,
        pivotY,
        rotate,
      );
      gradient = target.createLinearGradient(x + sx, y + sy, x + ex, y + ey);
    }

    const colors = Array.isArray(config.colors)
      ? config.colors.filter(isRecord).slice().sort(
          (a, b) => numberOf(a.stop, 0) - numberOf(b.stop, 0),
        )
      : [];
    if (colors.length < 2) {
      throw new Error('Gradient colors must contain at least two stops.');
    }
    for (const stop of colors) {
      gradient.addColorStop(
        Math.min(1, Math.max(0, numberOf(stop.stop, 0))),
        stringOf(stop.color, '#ffffff'),
      );
    }
    return gradient;
  };

  const w = Math.max(1, bounds.w);
  const h = Math.max(1, bounds.h);
  const repeat = stringOf(config.repeat, 'no-repeat');
  if (repeat !== 'repeat' && repeat !== 'reflect') {
    return makeGradient(ctx, bounds.x, bounds.y, w, h);
  }

  const period = document.createElement('canvas');
  period.width = Math.max(1, Math.ceil(w));
  period.height = Math.max(1, Math.ceil(h));
  const periodCtx = period.getContext('2d');
  if (!periodCtx) throw new Error('Gradient period canvas is unavailable.');
  periodCtx.fillStyle = makeGradient(periodCtx, 0, 0, w, h);
  periodCtx.fillRect(0, 0, period.width, period.height);

  let source: CanvasImageSource = period;
  if (repeat === 'reflect') {
    const reflected = document.createElement('canvas');
    reflected.width = period.width * 2;
    reflected.height = period.height * 2;
    const reflectedCtx = reflected.getContext('2d');
    if (!reflectedCtx) throw new Error('Reflected gradient canvas is unavailable.');
    reflectedCtx.drawImage(period, 0, 0);
    reflectedCtx.save();
    reflectedCtx.translate(reflected.width, 0);
    reflectedCtx.scale(-1, 1);
    reflectedCtx.drawImage(period, 0, 0);
    reflectedCtx.restore();
    reflectedCtx.save();
    reflectedCtx.translate(0, reflected.height);
    reflectedCtx.scale(1, -1);
    reflectedCtx.drawImage(period, 0, 0);
    reflectedCtx.restore();
    reflectedCtx.save();
    reflectedCtx.translate(reflected.width, reflected.height);
    reflectedCtx.scale(-1, -1);
    reflectedCtx.drawImage(period, 0, 0);
    reflectedCtx.restore();
    source = reflected;
  }

  const pattern = ctx.createPattern(source, 'repeat');
  if (!pattern) throw new Error('Failed to create repeating gradient pattern.');
  if (typeof pattern.setTransform === 'function' && typeof DOMMatrix !== 'undefined') {
    pattern.setTransform(new DOMMatrix().translate(bounds.x, bounds.y));
  }
  return pattern;
}

function phase7DrawPath(ctx: CanvasRenderingContext2D, path: Path2D, raw: Jsonish, width: number, height: number) {
  const options=isRecord(raw)?raw:{}, transform=isRecord(options.transform)?options.transform:{};
  const stroke=isRecord(options.stroke)?options.stroke:null, fill=isRecord(options.fill)?options.fill:null, shadow=isRecord(options.shadow)?options.shadow:null;
  const gradientBounds=isRecord(options.gradientBounds)
    ? {
        x:numberOf(options.gradientBounds.x,0),
        y:numberOf(options.gradientBounds.y,0),
        w:Math.max(1,numberOf(options.gradientBounds.w,width)),
        h:Math.max(1,numberOf(options.gradientBounds.h,height)),
      }
    : {x:0,y:0,w:width,h:height};
  const opacity=Math.min(1,Math.max(0,numberOf(options.opacity,1)));
  ctx.save();
  const hasOrigin=typeof transform.originX==='number'&&typeof transform.originY==='number';
  const rotate=numberOf(transform.rotate,0);
  const scaleX=numberOf(transform.scaleX,1),scaleY=numberOf(transform.scaleY,1);
  const tx=numberOf(transform.translateX,0),ty=numberOf(transform.translateY,0);
  if(tx||ty)ctx.translate(tx,ty);
  if(hasOrigin){
    const ox=numberOf(transform.originX,0),oy=numberOf(transform.originY,0);
    ctx.translate(ox,oy);
    if(rotate)ctx.rotate(rotate*Math.PI/180);
    if(scaleX!==1||scaleY!==1)ctx.scale(scaleX,scaleY);
    ctx.translate(-ox,-oy);
  }else{
    if(rotate)ctx.rotate(rotate*Math.PI/180);
    if(scaleX!==1||scaleY!==1)ctx.scale(scaleX,scaleY);
  }
  const composite=stringOf(options.globalCompositeOperation,''); if (composite) { try { ctx.globalCompositeOperation=composite as GlobalCompositeOperation; } catch {} }
  if (shadow) { ctx.shadowColor=stringOf(shadow.color,'rgba(0,0,0,.45)'); ctx.shadowBlur=Math.max(0,numberOf(shadow.blur,0)); ctx.shadowOffsetX=numberOf(shadow.offsetX,0); ctx.shadowOffsetY=numberOf(shadow.offsetY,0); }
  if (stroke) {
    ctx.globalAlpha=opacity*Math.min(1,Math.max(0,numberOf(stroke.opacity,1)));
    ctx.strokeStyle=isRecord(stroke.gradient)?phase7Gradient(ctx,stroke.gradient,gradientBounds):stringOf(stroke.color,'black');
    ctx.lineWidth=Math.max(0,numberOf(stroke.width,1)); ctx.lineCap=stringOf(stroke.lineCap,'butt') as CanvasLineCap; ctx.lineJoin=stringOf(stroke.lineJoin,'miter') as CanvasLineJoin;
    const dash=Array.isArray(stroke.dashArray)?stroke.dashArray.filter((v):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0):stringOf(stroke.style,'')==='dashed'?[10,6]:stringOf(stroke.style,'')==='dotted'?[2,5]:[];
    ctx.setLineDash(dash); ctx.lineDashOffset=numberOf(stroke.dashOffset,0); ctx.stroke(path); ctx.setLineDash([]);
  }
  if (fill) {
    ctx.globalAlpha=opacity*Math.min(1,Math.max(0,numberOf(fill.opacity,1)));
    ctx.fillStyle=isRecord(fill.gradient)?phase7Gradient(ctx,fill.gradient,gradientBounds):stringOf(fill.color,'black');
    ctx.fill(path,stringOf(fill.rule,'nonzero') as CanvasFillRule);
  }
  ctx.restore();
}

function phase7Arrow(ctx: CanvasRenderingContext2D,x:number,y:number,angle:number,size:number,style:string,color:string) {
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle); ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-size,size*.48); ctx.lineTo(-size,-size*.48); ctx.closePath(); ctx.fillStyle=color; ctx.strokeStyle=color; if(style==='outline')ctx.stroke();else ctx.fill(); ctx.restore();
}

function phase7Custom(ctx: CanvasRenderingContext2D, raw: Jsonish) {
  const list=Array.isArray(raw)?raw:[raw];
  for(const item of list) {
    if(!isRecord(item))continue;
    const start=isRecord(item.startCoordinates)?item.startCoordinates:{}, end=isRecord(item.endCoordinates)?item.endCoordinates:{}, style=isRecord(item.lineStyle)?item.lineStyle:{}, arrow=isRecord(item.arrow)?item.arrow:null;
    const sx=numberOf(start.x,0), sy=numberOf(start.y,0), ex=numberOf(end.x,0), ey=numberOf(end.y,0);
    ctx.save(); ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.lineWidth=Math.max(0,numberOf(style.width,1)); ctx.strokeStyle=isRecord(style.gradient)?phase7Gradient(ctx,style.gradient,{x:sx,y:sy,w:ex-sx,h:ey-sy}):stringOf(style.color,'black'); ctx.lineJoin=stringOf(style.lineJoin,'miter') as CanvasLineJoin; ctx.lineCap=stringOf(style.lineCap,'butt') as CanvasLineCap;
    const dash=isRecord(style.lineDash)&&Array.isArray(style.lineDash.dashArray)?style.lineDash.dashArray.filter((v):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0):[];
    ctx.setLineDash(dash); if(isRecord(style.lineDash))ctx.lineDashOffset=numberOf(style.lineDash.offset,0); ctx.stroke();
    if(arrow){const angle=Math.atan2(ey-sy,ex-sx),size=Math.max(1,numberOf(arrow.size,10)),color=stringOf(arrow.color,stringOf(style.color,'black')),kind=stringOf(arrow.style,'filled');if(boolOf(arrow.start,false))phase7Arrow(ctx,sx,sy,angle+Math.PI,size,kind,color);if(boolOf(arrow.end,false))phase7Arrow(ctx,ex,ey,angle,size,kind,color);}
    if(Array.isArray(item.markers))for(const marker of item.markers){if(!isRecord(marker))continue;const t=Math.min(1,Math.max(0,numberOf(marker.position,0))),mx=sx+(ex-sx)*t,my=sy+(ey-sy)*t,size=Math.max(1,numberOf(marker.size,6)),shape=stringOf(marker.shape,'circle');ctx.beginPath();ctx.fillStyle=stringOf(marker.color,'#ffffff');if(shape==='square')ctx.rect(mx-size/2,my-size/2,size,size);else if(shape==='diamond'){ctx.moveTo(mx,my-size/2);ctx.lineTo(mx+size/2,my);ctx.lineTo(mx,my+size/2);ctx.lineTo(mx-size/2,my);ctx.closePath();}else ctx.arc(mx,my,size/2,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }
}

type Phase7PixelProcessor = (
  r: number,
  g: number,
  b: number,
  a: number,
  x: number,
  y: number,
) => Jsonish;

function phase7Manipulate(
  ctx: CanvasRenderingContext2D,
  raw: Jsonish,
  width: number,
  height: number,
  processor?: Phase7PixelProcessor,
) {
  const options=isRecord(raw)?raw:{}, region=isRecord(options.region)?options.region:{}, x=Math.max(0,Math.floor(numberOf(region.x,0))), y=Math.max(0,Math.floor(numberOf(region.y,0)));
  const w=Math.max(1,Math.min(width-x,Math.floor(numberOf(region.width,width-x)))), h=Math.max(1,Math.min(height-y,Math.floor(numberOf(region.height,height-y)))), filter=stringOf(options.filter,''), intensity=Math.min(1,Math.max(0,numberOf(options.intensity,1)));
  if(!processor&&!['grayscale','invert','sepia','brightness','contrast','saturate'].includes(filter))return;
  const image=ctx.getImageData(x,y,w,h),d=image.data,blend=(a:number,b:number)=>Math.round(a+(b-a)*intensity);
  for(let i=0;i<d.length;i+=4){
    const pixel=i/4,px=pixel%w,py=Math.floor(pixel/w),r=d[i],g=d[i+1],b=d[i+2],a=d[i+3];
    if(processor){
      const output=processor(r,g,b,a,x+px,y+py);
      if(!Array.isArray(output)||output.length!==4||output.some((value)=>typeof value!=='number'||!Number.isFinite(value))){
        throw new Error('pixels.manipulate processor must synchronously return four finite channel values.');
      }
      d[i]=output[0] as number;d[i+1]=output[1] as number;d[i+2]=output[2] as number;d[i+3]=output[3] as number;
      continue;
    }
    let nr=r,ng=g,nb=b;
    if(filter==='grayscale'){const q=.299*r+.587*g+.114*b;nr=ng=nb=q;}
    else if(filter==='invert'){nr=255-r;ng=255-g;nb=255-b;}
    else if(filter==='sepia'){nr=Math.min(255,.393*r+.769*g+.189*b);ng=Math.min(255,.349*r+.686*g+.168*b);nb=Math.min(255,.272*r+.534*g+.131*b);}
    else if(filter==='brightness'){nr=Math.min(255,r+128);ng=Math.min(255,g+128);nb=Math.min(255,b+128);}
    else if(filter==='contrast'){nr=Math.min(255,Math.max(0,(r-128)*2+128));ng=Math.min(255,Math.max(0,(g-128)*2+128));nb=Math.min(255,Math.max(0,(b-128)*2+128));}
    else if(filter==='saturate'){const q=.299*r+.587*g+.114*b;nr=Math.min(255,Math.max(0,q+(r-q)*2));ng=Math.min(255,Math.max(0,q+(g-q)*2));nb=Math.min(255,Math.max(0,q+(b-q)*2));}
    d[i]=blend(r,nr);d[i+1]=blend(g,ng);d[i+2]=blend(b,nb);
  }
  ctx.putImageData(image,x,y);
}

function phase7Color(ctx:CanvasRenderingContext2D,x:number,y:number){const d=ctx.getImageData(Math.max(0,Math.floor(x)),Math.max(0,Math.floor(y)),1,1).data;return{r:d[0],g:d[1],b:d[2],a:d[3]};}
function phase7SegmentDistance(px:number,py:number,x1:number,y1:number,x2:number,y2:number){const vx=x2-x1,vy=y2-y1,len=vx*vx+vy*vy;if(len===0)return Math.hypot(px-x1,py-y1);const t=Math.max(0,Math.min(1,((px-x1)*vx+(py-y1)*vy)/len));return Math.hypot(px-(x1+t*vx),py-(y1+t*vy));}
function phase7EllipseLocal(region:RecordValue,x:number,y:number){const cx=numberOf(region.x,0),cy=numberOf(region.y,0),rotation=numberOf(region.rotation,0),cos=Math.cos(-rotation),sin=Math.sin(-rotation),dx=x-cx,dy=y-cy;return{cx,cy,rotation,cos,sin,tx:dx*cos-dy*sin,ty:dx*sin+dy*cos,rx:Math.max(.000001,numberOf(region.radiusX,1)),ry:Math.max(.000001,numberOf(region.radiusY,1))};}
function phase7PolygonPoints(region:RecordValue){return Array.isArray(region.points)?region.points.filter(isRecord):[];}
function phase7PolygonHit(points:RecordValue[],x:number,y:number,tolerance:number){for(let i=0;i<points.length;i+=1){const a=points[i],b=points[(i+1)%points.length];if(phase7SegmentDistance(x,y,numberOf(a.x,0),numberOf(a.y,0),numberOf(b.x,0),numberOf(b.y,0))<=tolerance+1e-9)return true;}let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j],ax=numberOf(a.x,0),ay=numberOf(a.y,0),bx=numberOf(b.x,0),by=numberOf(b.y,0);if((ay>y)!==(by>y)&&x<((bx-ax)*(y-ay))/(by-ay)+ax)inside=!inside;}return inside;}
function phase7EllipseDistance(region:RecordValue,x:number,y:number){const q=phase7EllipseLocal(region,x,y);const angle=Math.atan2(q.ty*q.rx,q.tx*q.ry),lx=q.rx*Math.cos(angle),ly=q.ry*Math.sin(angle),ex=q.cx+lx*q.cos-ly*q.sin,ey=q.cy+lx*q.sin+ly*q.cos;return Math.hypot(x-ex,y-ey);}
function phase7Region(ctx:CanvasRenderingContext2D,region:RecordValue,x:number,y:number,options:RecordValue){
  const type=stringOf(region.type,'rect'),t=Math.max(0,numberOf(options.tolerance,0));
  let hit=false,stroke=false,distance: number | undefined;
  if(type==='rect'){const rx=numberOf(region.x,0),ry=numberOf(region.y,0),rw=numberOf(region.width,0),rh=numberOf(region.height,0);hit=x>=rx-t&&x<=rx+rw+t&&y>=ry-t&&y<=ry+rh+t;distance=hit?0:Math.hypot(Math.max(rx-x,0,x-(rx+rw)),Math.max(ry-y,0,y-(ry+rh)));if(hit&&boolOf(options.includeStroke,false)&&typeof options.strokeWidth==='number'){const half=numberOf(options.strokeWidth,1)/2+t,outer=x>=rx-half&&x<=rx+rw+half&&y>=ry-half&&y<=ry+rh+half,inner=x>rx+half&&x<rx+rw-half&&y>ry+half&&y<ry+rh-half;stroke=outer&&!inner;}}
  else if(type==='circle'){const radial=Math.hypot(x-numberOf(region.x,0),y-numberOf(region.y,0)),radius=Math.max(0,numberOf(region.radius,0));hit=radial<=radius+t;distance=hit?0:radial-radius;if(hit&&boolOf(options.includeStroke,false)&&typeof options.strokeWidth==='number')stroke=Math.abs(radial-radius)<=numberOf(options.strokeWidth,1)/2+t;}
  else if(type==='ellipse'){const q=phase7EllipseLocal(region,x,y),rx=q.rx+t,ry=q.ry+t;hit=(q.tx*q.tx)/(rx*rx)+(q.ty*q.ty)/(ry*ry)<=1+1e-9;distance=hit?0:phase7EllipseDistance(region,x,y);}
  else if(type==='polygon'){const points=phase7PolygonPoints(region);hit=points.length>=3&&phase7PolygonHit(points,x,y,t);if(hit)distance=0;else if(points.length>=2){let min=Infinity;for(let i=0;i<points.length;i+=1){const a=points[i],b=points[(i+1)%points.length];min=Math.min(min,phase7SegmentDistance(x,y,numberOf(a.x,0),numberOf(a.y,0),numberOf(b.x,0),numberOf(b.y,0)));}distance=Number.isFinite(min)?min:undefined;}}
  else if(type==='path'&&Array.isArray(region.path)){
    const path=phase7Path(region.path);
    hit=ctx.isPointInPath(path,x,y,stringOf(region.fillRule,stringOf(options.fillRule,'nonzero')) as CanvasFillRule);
    if(!hit&&boolOf(options.includeStroke,false)&&typeof options.strokeWidth==='number'){
      ctx.save();
      ctx.lineWidth=Math.max(.001,numberOf(options.strokeWidth,0)+2*t);
      stroke=ctx.isPointInStroke(path,x,y);
      ctx.restore();
      hit=stroke;
    }
  }
  return{hit,hitType:hit?(stroke?'stroke':'fill'):'outside',...(distance!==undefined?{distance}:{})};
}
function phase7Distance(region:RecordValue,x:number,y:number){
  const type=stringOf(region.type,'');
  if(type==='rect'){const rx=numberOf(region.x,0),ry=numberOf(region.y,0),rw=numberOf(region.width,0),rh=numberOf(region.height,0);return Math.hypot(Math.max(rx-x,0,x-(rx+rw)),Math.max(ry-y,0,y-(ry+rh)));}
  if(type==='circle')return Math.max(0,Math.hypot(x-numberOf(region.x,0),y-numberOf(region.y,0))-Math.max(0,numberOf(region.radius,0)));
  if(type==='ellipse'){const q=phase7EllipseLocal(region,x,y);return(q.tx*q.tx)/(q.rx*q.rx)+(q.ty*q.ty)/(q.ry*q.ry)<=1+1e-9?0:phase7EllipseDistance(region,x,y);}
  if(type==='polygon'){const points=phase7PolygonPoints(region);if(points.length<3)return null;if(phase7PolygonHit(points,x,y,0))return 0;let min=Infinity;for(let i=0;i<points.length;i+=1){const a=points[i],b=points[(i+1)%points.length];min=Math.min(min,phase7SegmentDistance(x,y,numberOf(a.x,0),numberOf(a.y,0),numberOf(b.x,0),numberOf(b.y,0)));}return Number.isFinite(min)?min:null;}
  return null;
}

export async function renderApexifyWebPreview(
  source: string,
  studioAssets: readonly WebVirtualAsset[] = [],
): Promise<WebStudioPreviewResult> {
  const started = performance.now();
  const studioAssetsById = new Map(studioAssets.map((asset) => [asset.id, asset] as const));
  const supportedApis = [
    'createCanvas', 'createText', 'createImage', 'createChart',
    'createComparisonChart', 'createComboChart',
    'path2d.create', 'path2d.draw', 'path2d.custom',
    'pixels.manipulate', 'pixels.getColor', 'pixels.setColor', 'pixels.getData',
    'detect.path', 'detect.region', 'detect.anyRegion', 'detect.distance',
  ];
  const warnings: string[] = [];

  if (
    /(?:node:fs|from\s+['"]fs['"]|require\(\s*['"](?:node:)?fs['"]\s*\)|\bfs\.)/.test(source)
  ) {
    warnings.push(
      'Filesystem calls are Node-only and are ignored by Apexify Web. The visual Apexify calls are still previewed.',
    );
  }

  if (/\bprocess\.(?:env|cwd|argv|platform)\b/.test(source)) {
    warnings.push(
      'Node process APIs are not executed by Apexify Web. Switch to the trusted-local Node target when available.',
    );
  }

  try {
    const calls = extractCalls(source, [...supportedApis, ...UNSUPPORTED_APIS]);
    const structuredResults: Record<string, Jsonish> = {};
    const resolver = createSafePreviewResolver(source);
    const resolve = (expression: string, sourceIndex: number): Jsonish => {
      try {
        return resolver.resolveAt(expression, sourceIndex);
      } catch {
        return parseLiteral(expression);
      }
    };

    const pathDefinitionsByIdentifier = new Map<string, Array<{ index: number; value: Jsonish }>>();
    for (const pathCall of calls.filter((item) => item.method === 'path2d.create' && item.args[0])) {
      const identifier = assignedIdentifierForCall(source, pathCall);
      if (!identifier) continue;
      const definitions = pathDefinitionsByIdentifier.get(identifier) ?? [];
      definitions.push({ index: pathCall.index, value: resolveCallArgument(source, pathCall, pathCall.args[0], resolve) });
      pathDefinitionsByIdentifier.set(identifier, definitions);
    }
    const resolvePathArgument = (call: Call, expression: string | undefined): Jsonish => {
      if (!expression) return [];
      const identifier = expression.trim().match(/^[A-Za-z_$][\w$]*$/)?.[0];
      if (identifier) {
        const definitions = pathDefinitionsByIdentifier.get(identifier) ?? [];
        for (let i = definitions.length - 1; i >= 0; i -= 1) {
          if (definitions[i].index < call.index) return definitions[i].value;
        }
      }
      return resolveCallArgument(source, call, expression, resolve);
    };


    const pathRegionIdentifiers = (
      call: Call,
      expression: string | undefined,
    ): string[] => {
      if (!expression) return [];
      const direct = expression.trim().match(/^[A-Za-z_$][\w$]*$/)?.[0];
      const raw = direct
        ? findInitializerBefore(source, direct, call.index) ?? expression
        : expression;
      const identifiers: string[] = [];
      const re = /\bpath\s*:\s*([A-Za-z_$][\w$]*)/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(raw))) identifiers.push(match[1]);
      return identifiers;
    };

    const resolveRegionPaths = (
      call: Call,
      value: Jsonish,
      resourceIdentifiers: string[],
    ): Jsonish => {
      let resourceIndex = 0;
      const resolveOne = (region: Jsonish): Jsonish => {
        if (!isRecord(region) || region.type !== 'path') return region;
        if (Array.isArray(region.path)) return region;
        const identifier = resourceIdentifiers[resourceIndex++];
        if (!identifier) return region;
        return {
          ...region,
          path: resolvePathArgument(call, identifier),
        };
      };
      return Array.isArray(value) ? value.map(resolveOne) : resolveOne(value);
    };

    const chartCalls = calls.filter((call) =>
      (call.method === 'createChart' ||
        call.method === 'createComparisonChart' ||
        call.method === 'createComboChart') &&
      call.args[0],
    );
    const chartRecords = chartCalls.map((call) => {
      let canvas: HTMLCanvasElement | null = null;
      if (call.method === 'createChart') {
        const typeValue = resolveCallArgument(source, call, call.args[0], resolve);
        const dataValue = resolveCallArgument(source, call, call.args[1], resolve);
        const optionsValue = resolveCallArgument(source, call, call.args[2], resolve);
        canvas =
          hasUnresolved(dataValue) || hasUnresolved(optionsValue)
            ? null
            : createChartCanvas(stringOf(typeValue, 'bar'), dataValue, optionsValue);
      } else {
        const optionsValue = resolveCallArgument(source, call, call.args[0], resolve);
        if (!hasUnresolved(optionsValue)) {
          canvas =
            call.method === 'createComparisonChart'
              ? createComparisonChartCanvas(optionsValue)
              : createComboChartCanvas(optionsValue);
        }
      }
      return {
        call,
        canvas,
        assignedIdentifier: assignedIdentifierForCall(source, call),
      };
    });

    const generatedCharts = chartRecords
      .map((record) => record.canvas)
      .filter((value): value is HTMLCanvasElement => Boolean(value));

    const generatedChartsBySource = new Map<string, HTMLCanvasElement>();
    const assignedCanvases = new Set<HTMLCanvasElement>();

    for (const record of chartRecords) {
      if (!record.canvas || !record.assignedIdentifier) continue;
      generatedChartsBySource.set(record.assignedIdentifier, record.canvas);
      assignedCanvases.add(record.canvas);
    }

    // Fallback for unusual expressions where a generated chart is passed through
    // another local identifier before createImage(). Direct assignment above is
    // authoritative and avoids the old positional chartBuf/chart mapping bug.
    const unresolvedChartLabels: string[] = [];
    for (const call of calls) {
      if (call.method !== 'createImage' || !call.args[0]) continue;
      const parsed = resolveCallArgument(source, call, call.args[0], resolve);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (!isRecord(item)) continue;
        const label = unresolvedPreviewLabel(item.source);
        if (!label || generatedChartsBySource.has(label) || unresolvedChartLabels.includes(label)) continue;
        unresolvedChartLabels.push(label);
      }
    }

    const fallbackCharts = generatedCharts.filter((chart) => !assignedCanvases.has(chart));
    unresolvedChartLabels.forEach((label, index) => {
      const chart = fallbackCharts[index];
      if (chart) generatedChartsBySource.set(label, chart);
    });

    const canvasCall = calls.find((call) => call.method === 'createCanvas');
    if (!canvasCall?.args[0]) {
      const chartOnly = generatedCharts[generatedCharts.length - 1];
      if (chartOnly) {
        const unresolved = resolver.unresolved().filter((name) => name !== 'painter');
        if (unresolved.length) {
          warnings.push(
            'Apexify Web rendered the chart and skipped unrelated runtime-only values: ' +
              unresolved.slice(0, 4).join(', ') +
              (unresolved.length > 4 ? '…' : ''),
          );
        }
        return {
          ok: true,
          dataUrl: chartOnly.toDataURL('image/png'),
          mime: 'image/png',
          width: chartOnly.width,
          height: chartOnly.height,
          elapsedMs: Math.round(performance.now() - started),
          supportedApis,
          warnings: [...new Set(warnings)],
        };
      }

      return {
        ok: false,
        elapsedMs: Math.round(performance.now() - started),
        error: 'Apexify Web needs a supported painter.createCanvas(...) or chart creation call before it can render a preview.',
        supportedApis,
      };
    }

    const canvasConfig = resolveCallArgument(source, canvasCall, canvasCall.args[0], resolve);
    if (!isRecord(canvasConfig)) {
      throw new Error('createCanvas() options must resolve to an object.');
    }

    let width = Math.round(numberOf(canvasConfig.width, 640));
    let height = Math.round(numberOf(canvasConfig.height, 360));

    // Match the Node/native CanvasCreator contract: customBg.inherit means the
    // output canvas adopts the source bitmap's natural pixel dimensions.
    // Without this, browser Studio silently fell back to 640×360 and stretched
    // large imported artwork, producing visibly soft/distorted previews.
    const inheritedBackground = isRecord(canvasConfig.customBg)
      ? canvasConfig.customBg
      : null;
    if (inheritedBackground && boolOf(inheritedBackground.inherit, false)) {
      const source = stringOf(inheritedBackground.source, '');
      if (!source) {
        throw new Error('customBg.inherit requires a resolvable image source.');
      }
      const bitmap = await previewBitmapFromSource(
        source,
        studioAssetsById,
        warnings,
        'customBg inherit',
      );
      if (!bitmap) {
        throw new Error('Apexify Web could not resolve customBg source dimensions.');
      }
      try {
        width = bitmap.width;
        height = bitmap.height;
      } finally {
        bitmap.close();
      }
    }

    if (width < 1 || height < 1 || width > 4096 || height > 4096 || width * height > 12_000_000) {
      throw new Error('Apexify Web limits output to 4096×4096 and 12 million pixels.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Canvas 2D is unavailable in this browser.');

    await applyBackground(
      ctx,
      canvasConfig,
      width,
      height,
      studioAssetsById,
      warnings,
    );


    for (const call of calls) {
      if (call.index <= canvasCall.index || !call.args[0]) continue;

      if (call.method === 'createText') {
        const parsed = resolveCallArgument(source, call, call.args[0], resolve);
        if (hasUnresolved(parsed)) {
          warnings.push('Some createText() values depend on runtime-only expressions and were skipped or defaulted in Apexify Web.');
        }
        applyText(ctx, parsed);
      } else if (call.method === 'createImage') {
        const parsed = resolveCallArgument(source, call, call.args[0], resolve);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        const usedGeneratedSources = await applyImageLayersInOrder(
          ctx,
          parsed,
          generatedChartsBySource,
          studioAssetsById,
          warnings,
        );

        const unresolvedSource = items.some((item) => {
          if (!isRecord(item)) return false;
          const label = unresolvedPreviewLabel(item.source);
          return Boolean(label && !usedGeneratedSources.has(label));
        });

        const unsupportedImage = items.some(
          (item) =>
            isRecord(item) &&
            typeof item.source === 'string' &&
            !isUnresolvedPreviewValue(item.source) &&
            !SHAPES.has(item.source) &&
            !remoteImageSource(item.source) &&
            !studioAssetIdFromReference(item.source),
        );

        if (unresolvedSource) {
          warnings.push('An image layer depends on a Node-only runtime value and was skipped; other browser-supported layers were still rendered.');
        }
        if (unsupportedImage) {
          warnings.push('Local/Node-only bitmap sources were skipped; Apexify Web rendered supported shapes, generated charts, and browser-fetchable HTTP(S) images.');
        }
      } else if (
        call.method === 'createChart' ||
        call.method === 'createComparisonChart' ||
        call.method === 'createComboChart'
      ) {
        // Charts are pre-rendered so their output can be used by later createImage() calls.
      } else if (call.method === 'path2d.create') {
        // Resource declaration only.
      } else if (call.method === 'path2d.draw') {
        phase7DrawPath(ctx, phase7Path(resolvePathArgument(call, call.args[1])), resolveCallArgument(source, call, call.args[2], resolve), width, height);
      } else if (call.method === 'path2d.custom') {
        phase7Custom(ctx, resolveCallArgument(source, call, call.args[0], resolve));
      } else if (call.method === 'pixels.manipulate') {
        const manipulation = phase7ManipulationArgument(source, call, resolve);
        phase7Manipulate(
          ctx,
          manipulation.options,
          width,
          height,
          manipulation.processorExpression
            ? (r, g, b, a, x, y) =>
                resolver.invokeAt(
                  manipulation.processorExpression!,
                  call.index,
                  [r, g, b, a, x, y],
                )
            : undefined,
        );
      } else if (call.method === 'pixels.setColor') {
        const x=numberOf(resolveCallArgument(source,call,call.args[1],resolve),0),y=numberOf(resolveCallArgument(source,call,call.args[2],resolve),0),color=resolveCallArgument(source,call,call.args[3],resolve);
        if(isRecord(color)){const d=ctx.createImageData(1,1);d.data[0]=Math.max(0,Math.min(255,numberOf(color.r,0)));d.data[1]=Math.max(0,Math.min(255,numberOf(color.g,0)));d.data[2]=Math.max(0,Math.min(255,numberOf(color.b,0)));d.data[3]=Math.max(0,Math.min(255,numberOf(color.a,255)));ctx.putImageData(d,Math.floor(x),Math.floor(y));}
      } else if (call.method === 'pixels.getColor') {
        const key=assignedIdentifierForCall(source,call)??'pixelColor';structuredResults[key]=phase7Color(ctx,numberOf(resolveCallArgument(source,call,call.args[1],resolve),0),numberOf(resolveCallArgument(source,call,call.args[2],resolve),0));
      } else if (call.method === 'pixels.getData') {
        const regionValue=resolveCallArgument(source,call,call.args[1],resolve),region=isRecord(regionValue)?regionValue:{},x=Math.max(0,Math.floor(numberOf(region.x,0))),y=Math.max(0,Math.floor(numberOf(region.y,0))),w=Math.max(1,Math.min(width-x,Math.floor(numberOf(region.width,width-x)))),h=Math.max(1,Math.min(height-y,Math.floor(numberOf(region.height,height-y)))),data=ctx.getImageData(x,y,w,h).data;
        structuredResults[assignedIdentifierForCall(source,call)??'pixelData']={width:w,height:h,sample:Array.from(data.slice(0,Math.min(64,data.length)))};
      } else if (call.method === 'detect.path') {
        const path=phase7Path(resolvePathArgument(call,call.args[0])),x=numberOf(resolveCallArgument(source,call,call.args[1],resolve),0),y=numberOf(resolveCallArgument(source,call,call.args[2],resolve),0),optionsValue=resolveCallArgument(source,call,call.args[3],resolve),options=isRecord(optionsValue)?optionsValue:{},fill=ctx.isPointInPath(path,x,y,stringOf(options.fillRule,'nonzero') as CanvasFillRule);let stroke=false;if(!fill&&boolOf(options.includeStroke,false)&&typeof options.strokeWidth==='number'){ctx.save();ctx.lineWidth=Math.max(.001,numberOf(options.strokeWidth,0)+2*Math.max(0,numberOf(options.tolerance,0)));stroke=ctx.isPointInStroke(path,x,y);ctx.restore();}structuredResults[assignedIdentifierForCall(source,call)??'pathHit']={hit:fill||stroke,hitType:fill?'fill':stroke?'stroke':'outside'};
      } else if (call.method === 'detect.region') {
        const rawRegion=resolveCallArgument(source,call,call.args[0],resolve),regionValue=resolveRegionPaths(call,rawRegion,pathRegionIdentifiers(call,call.args[0])),optionsValue=resolveCallArgument(source,call,call.args[3],resolve);structuredResults[assignedIdentifierForCall(source,call)??'regionHit']=phase7Region(ctx,isRecord(regionValue)?regionValue:{},numberOf(resolveCallArgument(source,call,call.args[1],resolve),0),numberOf(resolveCallArgument(source,call,call.args[2],resolve),0),isRecord(optionsValue)?optionsValue:{});
      } else if (call.method === 'detect.anyRegion') {
        const rawRegions=resolveCallArgument(source,call,call.args[0],resolve),regionsValue=resolveRegionPaths(call,rawRegions,pathRegionIdentifiers(call,call.args[0])),optionsValue=resolveCallArgument(source,call,call.args[3],resolve),regions=Array.isArray(regionsValue)?regionsValue.filter(isRecord):[],x=numberOf(resolveCallArgument(source,call,call.args[1],resolve),0),y=numberOf(resolveCallArgument(source,call,call.args[2],resolve),0),options=isRecord(optionsValue)?optionsValue:{};let result:RecordValue={hit:false,hitType:'outside'};for(let i=0;i<regions.length;i+=1){const candidate=phase7Region(ctx,regions[i],x,y,options);if(candidate.hit){result={...candidate,hitRegion:i};break;}}structuredResults[assignedIdentifierForCall(source,call)??'regionHit']=result;
      } else if (call.method === 'detect.distance') {
        const regionValue=resolveCallArgument(source,call,call.args[0],resolve);structuredResults[assignedIdentifierForCall(source,call)??'distance']=isRecord(regionValue)?phase7Distance(regionValue,numberOf(resolveCallArgument(source,call,call.args[1],resolve),0),numberOf(resolveCallArgument(source,call,call.args[2],resolve),0)):null;
      } else if (UNSUPPORTED_APIS.includes(call.method)) {
        warnings.push(`${call.method}() requires the Node renderer and was not executed by Apexify Web.`);
      }
    }

    const unresolved = resolver.unresolved().filter((name) => {
      if (name === 'painter') return false;
      if (generatedChartsBySource.has(name)) return false;
      return true;
    });
    if (unresolved.length) {
      warnings.push(
        'Apexify Web resolved the supported composition subset and skipped runtime-only values: ' +
          unresolved.slice(0, 4).join(', ') +
          (unresolved.length > 4 ? '…' : ''),
      );
    }

    const radius = numberOf(canvasConfig.borderRadius, 0);
    if (radius > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = '#000';
      drawRoundedRect(ctx, 0, 0, width, height, radius);
      ctx.fill();
      ctx.restore();
    }

    const outputCanvas = composeCanvasShadowOverflowPreview(
      canvas,
      canvasConfig,
      width,
      height,
    );

    return {
      ok: true,
      dataUrl: outputCanvas.toDataURL('image/png'),
      mime: 'image/png',
      width: outputCanvas.width,
      height: outputCanvas.height,
      elapsedMs: Math.round(performance.now() - started),
      supportedApis,
      warnings: [...new Set(warnings)],
      ...(Object.keys(structuredResults).length ? { results: structuredResults } : {}),
    };
  } catch (error) {
    return {
      ok: false,
      elapsedMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : 'Apexify Web could not render this snippet.',
      supportedApis,
    };
  }
}
