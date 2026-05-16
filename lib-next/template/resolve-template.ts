import type { TextMetrics, TextProperties } from "../types/text";
import type { SceneLayer, SceneRenderInput } from "../types/scene";
import type { TemplateData, TemplateLayerInput, TemplateLayerOverrides } from "../types/template";
import {
  coerceVisibleString,
  lookupData,
  resolvePlaceholdersInString,
} from "./placeholders";
import { resolveAssetStringLeaf } from "../assets/asset-strings";

/** Keys commonly stored as numbers in scene layers (string values coerced after resolve). */
const NUMERIC_KEYS = new Set([
  "x",
  "y",
  "width",
  "height",
  "fontSize",
  "opacity",
  "rotation",
  "scaleX",
  "scaleY",
  "globalAlpha",
  "gap",
  "padding",
  "paddingX",
  "paddingY",
  "radius",
  "borderRadius",
  "lineWidth",
  "duration",
  "repeat",
  "max",
  "value",
  "columns",
  "rows",
]);

export class TemplateResolveError extends Error {
  constructor(
    message: string,
    readonly token?: string
  ) {
    super(message);
    this.name = "TemplateResolveError";
  }
}

export interface ResolveContext {
  data: TemplateData;
  resolveAssetRef?: (refPath: string) => string | Buffer;
}

function throwMissing(key: string): never {
  throw new TemplateResolveError(`Template render failed: missing value for "{{${key}}}"`, key);
}

function resolveStringLeaf(s: string, ctx: ResolveContext): string | Buffer {
  const afterPh = resolvePlaceholdersInString(s, { data: ctx.data }, throwMissing);
  if (!ctx.resolveAssetRef) return afterPh;
  try {
    return resolveAssetStringLeaf(afterPh, ctx.resolveAssetRef);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new TemplateResolveError(msg);
  }
}

/** Deep-resolve `{{placeholders}}` then `$asset` refs in every string leaf. */
export function deepResolveStrings(input: unknown, ctx: ResolveContext): unknown {
  if (input === null || input === undefined) return input;
  if (typeof input === "string") return resolveStringLeaf(input, ctx);
  if (typeof input !== "object") return input;
  if (Buffer.isBuffer(input)) return input;
  if (Array.isArray(input)) return input.map((v) => deepResolveStrings(v, ctx));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = deepResolveStrings(v, ctx);
  }
  return out;
}

function coerceNumbers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(coerceNumbers);
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Buffer.isBuffer(value)) return value;
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    let next = coerceNumbers(v);
    if (NUMERIC_KEYS.has(k) && typeof next === "string" && /^-?\d+(\.\d+)?$/.test(next.trim())) {
      next = Number(next);
    }
    out[k] = next;
  }
  return out;
}

/** Map doc-style image/text layers to scene shapes. */
export function normalizeTemplateLayer(layer: TemplateLayerInput): TemplateLayerInput {
  const t = layer.type;
  if (t === "image" && layer.images === undefined && layer.source !== undefined) {
    const { source, type, ...rest } = layer;
    return {
      type: "image",
      images: { ...(rest as Record<string, unknown>), source } as Record<string, unknown>,
    };
  }
  if (t === "text" && layer.texts === undefined && typeof layer.text === "string") {
    const { type, text, ...rest } = layer;
    return {
      type: "text",
      texts: { ...(rest as Record<string, unknown>), text } as Record<string, unknown>,
    };
  }
  return layer;
}

/**
 * Before string resolution: `visible` may be `{{flag}}`; resolve using data lookup only (no defaults in visibility).
 */
function parseVisibilityExpression(raw: unknown, data: TemplateData): boolean {
  if (raw === undefined) return true;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  if (typeof raw === "string") {
    const s = raw.trim();
    const m = /^\{\{\s*([^}|]+?)\s*\}\}$/.exec(s);
    if (m) {
      const key = m[1]!.trim();
      const v = lookupData(data, key);
      if (v === undefined || v === null) return false;
      if (typeof v === "boolean") return v;
      if (typeof v === "string") return coerceVisibleString(v);
      return Boolean(v);
    }
    if (s.startsWith("{{")) {
      const resolved = resolvePlaceholdersInString(s, { data }, throwMissing);
      return coerceVisibleString(resolved);
    }
    return coerceVisibleString(s);
  }
  return Boolean(raw);
}

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Buffer)) {
      const prev = out[k];
      out[k] =
        prev !== null && typeof prev === "object" && !Array.isArray(prev) && !(prev instanceof Buffer)
          ? deepMerge(prev as Record<string, unknown>, v as Record<string, unknown>)
          : v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function mergeOverridesIntoLayers(
  layers: TemplateLayerInput[],
  overrides: TemplateLayerOverrides | undefined
): TemplateLayerInput[] {
  if (!overrides) return layers;
  return layers.map((layer) => {
    let next: TemplateLayerInput = { ...layer };
    const id = next.id;
    if (typeof id === "string" && id && overrides[id]) {
      next = deepMerge(next as Record<string, unknown>, overrides[id]!) as TemplateLayerInput;
    }
    if (next.type === "surface" && Array.isArray(next.layers)) {
      next = {
        ...next,
        layers: mergeOverridesIntoLayers(next.layers as TemplateLayerInput[], overrides),
      };
    }
    if (next.type === "layout" && Array.isArray(next.children)) {
      next = {
        ...next,
        children: mergeOverridesIntoLayers(next.children as TemplateLayerInput[], overrides),
      };
    }
    return next;
  });
}

async function measureChildSize(
  child: TemplateLayerInput,
  measureText: (p: TextProperties) => Promise<TextMetrics>
): Promise<{ width: number; height: number }> {
  const n = normalizeTemplateLayer({ ...(child as TemplateLayerInput) });
  if (n.type === "image" && n.images) {
    const img = Array.isArray(n.images) ? n.images[0] : n.images;
    const ip = img as Record<string, unknown>;
    const w = Number(ip.width ?? 0);
    const h = Number(ip.height ?? 0);
    if (w > 0 && h > 0) return { width: w, height: h };
    throw new TemplateResolveError(
      "Template layout: image child must have width and height for layout measurement"
    );
  }
  if (n.type === "text" && n.texts) {
    const texts = n.texts as TextProperties | TextProperties[];
    const tp = Array.isArray(texts) ? texts[0]! : texts;
    const m = await measureText(tp);
    return { width: m.width, height: m.height };
  }
  if (n.type === "layout") {
    const w = Number(n.width ?? 0);
    const h = Number(n.height ?? 0);
    if (w > 0 && h > 0) return { width: w, height: h };
  }
  throw new TemplateResolveError(
    `Template layout: unsupported or unsized child type "${String(n.type)}"`
  );
}

function offsetLayerBy(
  layer: TemplateLayerInput,
  dx: number,
  dy: number
): TemplateLayerInput {
  const n = normalizeTemplateLayer({ ...layer } as TemplateLayerInput);
  if (n.type === "image" && n.images) {
    const one = (Array.isArray(n.images) ? n.images[0] : n.images) as Record<string, unknown>;
    return {
      ...n,
      images: {
        ...one,
        x: Number(one.x ?? 0) + dx,
        y: Number(one.y ?? 0) + dy,
      },
    };
  }
  if (n.type === "text" && n.texts) {
    const texts = n.texts as TextProperties | TextProperties[];
    if (Array.isArray(texts)) {
      return {
        ...n,
        texts: texts.map((t) => ({
          ...t,
          x: Number(t.x ?? 0) + dx,
          y: Number(t.y ?? 0) + dy,
        })),
      };
    }
    return {
      ...n,
      texts: {
        ...texts,
        x: Number(texts.x ?? 0) + dx,
        y: Number(texts.y ?? 0) + dy,
      },
    };
  }
  if (n.type === "surface" && Array.isArray(n.layers)) {
    return {
      ...n,
      placement: {
        ...(n.placement as Record<string, unknown>),
        x: Number((n.placement as Record<string, unknown>)?.x ?? 0) + dx,
        y: Number((n.placement as Record<string, unknown>)?.y ?? 0) + dy,
      },
    };
  }
  return n;
}

/**
 * Expands flex layout nodes into absolutely positioned layers (same coordinate space as parent).
 */
export async function expandFlexLayoutNode(
  node: TemplateLayerInput,
  measureText: (p: TextProperties) => Promise<TextMetrics>
): Promise<TemplateLayerInput[]> {
  const layout = node.layout as Record<string, unknown> | undefined;
  if (!layout || layout.type !== "flex") {
    throw new TemplateResolveError(
      `Template layout: expected layout.type "flex", got "${String(layout?.type)}"`
    );
  }
  const direction = (layout.direction as string) === "column" ? "column" : "row";
  const gap = Number(layout.gap ?? 0);
  const padding = Number(layout.padding ?? 0);
  const align = (layout.align as string) ?? "start";
  const justify = (layout.justify as string) ?? "start";

  const containerX = Number(node.x ?? 0);
  const containerY = Number(node.y ?? 0);
  const containerW = Number(node.width ?? 0);
  const containerH = Number(node.height ?? 0);
  if (!(containerW > 0) || !(containerH > 0)) {
    throw new TemplateResolveError("Template layout: flex container requires positive width and height");
  }

  const children = (node.children as TemplateLayerInput[]) ?? [];
  const innerW = containerW - 2 * padding;
  const innerH = containerH - 2 * padding;

  const sizes: { width: number; height: number }[] = [];
  for (const c of children) {
    sizes.push(await measureChildSize(c, measureText));
  }

  if (direction === "row") {
    const totalW = sizes.reduce((a, s) => a + s.width, 0) + gap * Math.max(0, children.length - 1);
    let startX = padding;
    if (justify === "center") startX = padding + Math.max(0, (innerW - totalW) / 2);
    else if (justify === "end") startX = padding + Math.max(0, innerW - totalW);

    const extraBetween =
      justify === "space-between" && children.length > 1
        ? Math.max(0, innerW - totalW) / (children.length - 1)
        : 0;

    const out: TemplateLayerInput[] = [];
    let x = justify === "space-between" ? padding : startX;
    for (let i = 0; i < children.length; i++) {
      const { width: cw, height: ch } = sizes[i]!;
      let y = padding;
      if (align === "center") y += Math.max(0, (innerH - ch) / 2);
      else if (align === "end") y += Math.max(0, innerH - ch);
      out.push(offsetLayerBy(children[i]!, containerX + x, containerY + y));
      if (justify === "space-between") {
        x += cw + (i < children.length - 1 ? gap + extraBetween : 0);
      } else {
        x += cw + (i < children.length - 1 ? gap : 0);
      }
    }
    return out;
  }

  /* column */
  const totalH = sizes.reduce((a, s) => a + s.height, 0) + gap * Math.max(0, children.length - 1);
  let startY = padding;
  if (justify === "center") startY = padding + Math.max(0, (innerH - totalH) / 2);
  else if (justify === "end") startY = padding + Math.max(0, innerH - totalH);

  const out: TemplateLayerInput[] = [];
  let y = startY;
  for (let i = 0; i < children.length; i++) {
    const { width: cw, height: ch } = sizes[i]!;
    let x = padding;
    if (align === "center") x += Math.max(0, (innerW - cw) / 2);
    else if (align === "end") x += Math.max(0, innerW - cw);
    out.push(offsetLayerBy(children[i]!, containerX + x, containerY + y));
    y += ch + (i < children.length - 1 ? gap : 0);
  }
  return out;
}

/**
 * Grid layout: **`layout.type: "grid"`**, **`columns`**, **`gap`**, **`padding`**, optional **`align`** / **`justify`** per cell.
 */
export async function expandGridLayoutNode(
  node: TemplateLayerInput,
  measureText: (p: TextProperties) => Promise<TextMetrics>
): Promise<TemplateLayerInput[]> {
  const layout = node.layout as Record<string, unknown> | undefined;
  if (!layout || layout.type !== "grid") {
    throw new TemplateResolveError(`Template layout: expected layout.type "grid"`);
  }
  const columns = Math.max(1, Math.floor(Number(layout.columns ?? 1)));
  const gap = Number(layout.gap ?? 0);
  const padding = Number(layout.padding ?? 0);
  const align = (layout.align as string) ?? "start";
  const justify = (layout.justify as string) ?? "start";

  const containerX = Number(node.x ?? 0);
  const containerY = Number(node.y ?? 0);
  const containerW = Number(node.width ?? 0);
  const containerH = Number(node.height ?? 0);
  if (!(containerW > 0) || !(containerH > 0)) {
    throw new TemplateResolveError("Template layout: grid container requires positive width and height");
  }

  const children = (node.children as TemplateLayerInput[]) ?? [];
  if (children.length === 0) return [];

  const innerW = containerW - 2 * padding;

  const sizes: { width: number; height: number }[] = [];
  for (const c of children) {
    sizes.push(await measureChildSize(c, measureText));
  }

  const n = children.length;
  const cols = columns;
  const rows = Math.max(1, Math.ceil(n / cols));

  const cellW = (innerW - gap * (cols - 1)) / cols;

  const rowHeights: number[] = [];
  for (let r = 0; r < rows; r++) {
    let mh = 0;
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx < n) mh = Math.max(mh, sizes[idx]!.height);
    }
    rowHeights.push(mh);
  }

  const out: TemplateLayerInput[] = [];
  let yCursor = padding;
  for (let r = 0; r < rows; r++) {
    const rowH = rowHeights[r] ?? 0;
    let xCursor = padding;
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx >= n) break;
      const { width: cw, height: ch } = sizes[idx]!;
      let dx = 0;
      let dy = 0;
      if (justify === "center") dx = Math.max(0, (cellW - cw) / 2);
      else if (justify === "end") dx = Math.max(0, cellW - cw);

      if (align === "center") dy = Math.max(0, (rowH - ch) / 2);
      else if (align === "end") dy = Math.max(0, rowH - ch);

      out.push(
        offsetLayerBy(children[idx]!, containerX + xCursor + dx, containerY + yCursor + dy)
      );
      xCursor += cellW + gap;
    }
    yCursor += rowH + (r < rows - 1 ? gap : 0);
  }

  return out;
}

async function expandLayoutNode(
  node: TemplateLayerInput,
  measureText: (p: TextProperties) => Promise<TextMetrics>
): Promise<TemplateLayerInput[]> {
  const layout = node.layout as Record<string, unknown> | undefined;
  const t = layout?.type;
  if (t === "flex") return expandFlexLayoutNode(node, measureText);
  if (t === "grid") return expandGridLayoutNode(node, measureText);
  throw new TemplateResolveError(
    `Template layout: unsupported layout.type "${String(t)}" (use "flex" or "grid")`
  );
}

/**
 * Recursively processes layers: visibility, overrides, layout expansion, surface children.
 */
export async function processTemplateLayers(
  layers: TemplateLayerInput[],
  ctx: ResolveContext,
  measureText: (p: TextProperties) => Promise<TextMetrics>
): Promise<TemplateLayerInput[]> {
  const result: TemplateLayerInput[] = [];

  for (const raw of layers) {
    if (!parseVisibilityExpression(raw.visible, ctx.data)) {
      continue;
    }
    const layer = { ...raw };
    delete layer.visible;

    if (layer.type === "layout") {
      const expanded = await expandLayoutNode(layer, measureText);
      result.push(...expanded);
      continue;
    }

    if (layer.type === "surface" && Array.isArray(layer.layers)) {
      const inner = await processTemplateLayers(
        layer.layers as TemplateLayerInput[],
        ctx,
        measureText
      );
      result.push({ ...layer, layers: inner } as TemplateLayerInput);
      continue;
    }

    result.push(layer);
  }

  return result;
}

/**
 * Full pipeline: defaults/overrides hooks are left to caller; this resolves strings, expands layouts, coerces numbers.
 */
function stripTemplateMeta(layer: TemplateLayerInput): TemplateLayerInput {
  const { id: _i, visible: _v, ...rest } = layer;
  if (rest.type === "surface" && Array.isArray(rest.layers)) {
    return {
      ...rest,
      layers: (rest.layers as TemplateLayerInput[]).map(stripTemplateMeta),
    } as TemplateLayerInput;
  }
  return rest as TemplateLayerInput;
}

export async function resolveTemplateToSceneInput(
  definition: Omit<SceneRenderInput, "layers"> & { layers: TemplateLayerInput[] },
  ctx: ResolveContext,
  overrides: TemplateLayerOverrides | undefined,
  measureText: (p: TextProperties) => Promise<TextMetrics>
): Promise<SceneRenderInput> {
  const { width, height, background, layers: layerList } = definition;

  const withOverrides = mergeOverridesIntoLayers([...layerList], overrides);

  const resolvedTree = deepResolveStrings(
    { width, height, background, layers: withOverrides },
    ctx
  ) as Record<string, unknown>;

  const coerced = coerceNumbers(resolvedTree) as Record<string, unknown>;
  const list = coerced.layers as TemplateLayerInput[];

  const normalized = list.map((l) => normalizeTemplateLayer(l as TemplateLayerInput));
  const processed = await processTemplateLayers(normalized, ctx, measureText);

  const finalLayers = processed.map((l) =>
    stripTemplateMeta(coerceNumbers(l) as TemplateLayerInput)
  ) as unknown as SceneLayer[];

  return {
    width: Number(coerced.width),
    height: Number(coerced.height),
    ...(coerced.background !== undefined ? { background: coerced.background as SceneRenderInput["background"] } : {}),
    layers: finalLayers,
  };
}
