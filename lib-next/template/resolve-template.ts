import type {
  TextMetrics,
  TextProperties,
  SceneLayer,
  SceneRenderInput,
  TemplateData,
  TemplateLayerInput,
  TemplateLayerInsertion,
  TemplateLayerOverrides,
  ResolveContext,
} from "../types";
import { coerceVisibleString, lookupData, resolvePlaceholderValue, resolvePlaceholdersInString } from "./placeholders";
import { resolveAssetRefsDeep } from "../assets/asset-strings";
import { cloneCompositionValue, isPlainCompositionObject } from "../composition/clone";
import { ApexifyInputError } from "../runtime/errors";
import { assertCollection, assertFiniteNumber } from "../runtime/validation";
import { validateSceneRenderInput } from "../scene/scene-validation";

const NUMERIC_KEYS = new Set([
  "x", "y", "width", "height", "fontSize", "opacity", "rotation", "scaleX", "scaleY",
  "globalAlpha", "gap", "padding", "paddingX", "paddingY", "radius", "borderRadius", "lineWidth",
  "duration", "repeat", "max", "value", "columns", "rows",
]);

export class TemplateResolveError extends ApexifyInputError {
  constructor(message: string, readonly token?: string, options: { cause?: unknown } = {}) {
    super(message, { cause: options.cause });
  }
}

export type { ResolveContext };

function throwMissing(key: string): never {
  throw new TemplateResolveError(`Template render failed: missing value for "{{${key}}}".`, key);
}

function resolveTemplatePlaceholdersDeep(input: unknown, data: TemplateData): unknown {
  const active = new WeakSet<object>();
  const walk = (value: unknown, path: string): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") return resolvePlaceholderValue(value, { data }, throwMissing);
    if (typeof value !== "object" || Buffer.isBuffer(value)) return value;
    if (!Array.isArray(value) && !isPlainCompositionObject(value)) return value;
    if (active.has(value)) throw new TemplateResolveError(`${path} contains a cyclic object graph.`);
    active.add(value);
    try {
      if (Array.isArray(value)) return value.map((item, index) => walk(item, `${path}[${index}]`));
      const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const [key, child] of Object.entries(value)) {
        if (key === "__proto__" || key === "prototype" || key === "constructor") {
          throw new TemplateResolveError(`${path} contains unsafe key "${key}".`);
        }
        out[key] = walk(child, `${path}.${key}`);
      }
      return out;
    } finally {
      active.delete(value);
    }
  };
  return walk(input, "template");
}

/** One authoritative pipeline: placeholders first, then the shared asset-reference engine. */
export function deepResolveStrings(input: unknown, ctx: ResolveContext): unknown {
  const placeholders = resolveTemplatePlaceholdersDeep(input, ctx.data);
  if (!ctx.resolveAssetRef) return placeholders;
  try {
    return resolveAssetRefsDeep(placeholders, ctx.resolveAssetRef);
  } catch (error) {
    if (error instanceof TemplateResolveError) throw error;
    throw new TemplateResolveError(error instanceof Error ? error.message : String(error), undefined, { cause: error });
  }
}

function coerceNumbers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(coerceNumbers);
  if (value === null || value === undefined || typeof value !== "object" || Buffer.isBuffer(value)) return value;
  if (!isPlainCompositionObject(value)) return value;
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [key, raw] of Object.entries(value)) {
    let next = coerceNumbers(raw);
    if (NUMERIC_KEYS.has(key) && typeof next === "string" && /^-?\d+(?:\.\d+)?$/.test(next.trim())) {
      next = Number(next);
    }
    out[key] = next;
  }
  return out;
}

export function normalizeTemplateLayer(layer: TemplateLayerInput): TemplateLayerInput {
  if (layer.type === "image" && layer.images === undefined && layer.source !== undefined) {
    const { source, type: _type, id, ...rest } = layer;
    return { type: "image", ...(id !== undefined ? { id } : {}), images: { ...rest, source } };
  }
  if (layer.type === "text" && layer.texts === undefined && layer.text !== undefined) {
    const { text, type: _type, id, ...rest } = layer;
    return { type: "text", ...(id !== undefined ? { id } : {}), texts: { ...rest, text } };
  }
  return layer;
}

function parseVisibilityExpression(raw: unknown, data: TemplateData): boolean {
  if (raw === undefined) return true;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  if (typeof raw !== "string") return Boolean(raw);

  const trimmed = raw.trim();
  const whole = /^\{\{\s*([^}|]+?)\s*(?:\|\s*([^}]*?))?\s*\}\}$/.exec(trimmed);
  if (whole) {
    const value = lookupData(data, whole[1]!.trim());
    if (value === undefined || value === null) {
      return whole[2] === undefined ? false : coerceVisibleString(whole[2].trim());
    }
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") return coerceVisibleString(value);
    return Boolean(value);
  }

  if (trimmed.includes("{{")) {
    return coerceVisibleString(resolvePlaceholdersInString(trimmed, { data }, throwMissing));
  }
  return coerceVisibleString(trimmed);
}

function filterVisibleTree(layers: TemplateLayerInput[], data: TemplateData): TemplateLayerInput[] {
  const out: TemplateLayerInput[] = [];
  for (const raw of layers) {
    if (!parseVisibilityExpression(raw.visible, data)) continue;
    const layer = cloneCompositionValue(raw, "template layer");
    delete layer.visible;
    if (layer.type === "surface" && Array.isArray(layer.layers)) {
      layer.layers = filterVisibleTree(layer.layers as TemplateLayerInput[], data);
    }
    if (layer.type === "layout" && Array.isArray(layer.children)) {
      layer.children = filterVisibleTree(layer.children as TemplateLayerInput[], data);
    }
    out.push(layer);
  }
  return out;
}

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out = cloneCompositionValue(base, "template override base");
  for (const [key, value] of Object.entries(patch)) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      throw new TemplateResolveError(`Template override contains unsafe key "${key}".`);
    }
    const previous = out[key];
    if (isPlainCompositionObject(value) && isPlainCompositionObject(previous)) {
      out[key] = deepMerge(previous, value);
    } else {
      out[key] = cloneCompositionValue(value, `template override.${key}`);
    }
  }
  return out;
}

function visitLayerLists(layers: TemplateLayerInput[], visitor: (layer: TemplateLayerInput) => void): void {
  for (const layer of layers) {
    visitor(layer);
    if (layer.type === "surface" && Array.isArray(layer.layers)) visitLayerLists(layer.layers as TemplateLayerInput[], visitor);
    if (layer.type === "layout" && Array.isArray(layer.children)) visitLayerLists(layer.children as TemplateLayerInput[], visitor);
  }
}

function collectIds(layers: TemplateLayerInput[]): Set<string> {
  const ids = new Set<string>();
  visitLayerLists(layers, (layer) => {
    if (layer.id === undefined) return;
    if (typeof layer.id !== "string" || layer.id.length === 0 || layer.id.includes("{{")) {
      throw new TemplateResolveError("Template layer id must be a non-empty literal string.");
    }
    if (ids.has(layer.id)) throw new TemplateResolveError(`Template layer id "${layer.id}" is duplicated.`);
    ids.add(layer.id);
  });
  return ids;
}

function applyOneInsertion(layers: TemplateLayerInput[], insertion: TemplateLayerInsertion): number {
  let matches = 0;
  const walk = (list: TemplateLayerInput[]): void => {
    for (let index = 0; index < list.length; index++) {
      const layer = list[index]!;
      if (layer.id === insertion.targetId) {
        matches += 1;
        const additions = cloneCompositionValue(
          Array.isArray(insertion.layers) ? insertion.layers : [insertion.layers],
          `template insertion ${insertion.targetId}`
        );
        const at = insertion.position === "before" ? index : index + 1;
        list.splice(at, 0, ...additions);
        index += additions.length;
      }
      if (layer.type === "surface" && Array.isArray(layer.layers)) walk(layer.layers as TemplateLayerInput[]);
      if (layer.type === "layout" && Array.isArray(layer.children)) walk(layer.children as TemplateLayerInput[]);
    }
  };
  walk(layers);
  return matches;
}

export function mergeOverridesIntoLayers(
  layers: TemplateLayerInput[],
  overrides: TemplateLayerOverrides | undefined
): TemplateLayerInput[] {
  if (!overrides) return cloneCompositionValue(layers, "template layers");
  const ids = collectIds(layers);
  for (const id of Object.keys(overrides)) {
    if (!ids.has(id)) throw new TemplateResolveError(`Template override targets unknown layer id "${id}".`);
  }
  const walk = (list: TemplateLayerInput[]): TemplateLayerInput[] => list.map((raw) => {
    let layer = cloneCompositionValue(raw, "template layer");
    if (typeof layer.id === "string" && overrides[layer.id]) {
      layer = deepMerge(layer, overrides[layer.id]!);
    }
    if (layer.type === "surface" && Array.isArray(layer.layers)) layer.layers = walk(layer.layers as TemplateLayerInput[]);
    if (layer.type === "layout" && Array.isArray(layer.children)) layer.children = walk(layer.children as TemplateLayerInput[]);
    return layer;
  });
  return walk(layers);
}

function applyInsertions(layers: TemplateLayerInput[], insertions: readonly TemplateLayerInsertion[] | undefined): TemplateLayerInput[] {
  const out = cloneCompositionValue(layers, "template layers");
  collectIds(out);
  if (!insertions) return out;
  assertCollection(insertions, "template.insertions");
  for (const insertion of insertions) {
    if (!insertion || typeof insertion !== "object") throw new TemplateResolveError("Template insertion must be an object.");
    if (typeof insertion.targetId !== "string" || insertion.targetId.length === 0) throw new TemplateResolveError("Template insertion targetId must be a non-empty string.");
    if (insertion.position !== "before" && insertion.position !== "after") throw new TemplateResolveError("Template insertion position must be before or after.");
    const matches = applyOneInsertion(out, insertion);
    if (matches !== 1) throw new TemplateResolveError(`Template insertion target "${insertion.targetId}" was not found exactly once.`);
    collectIds(out);
  }
  return out;
}

function finiteNonNegative(value: unknown, label: string): number {
  const number = Number(value ?? 0);
  assertFiniteNumber(number, label, { min: 0 });
  return number;
}

async function measureChildSize(
  child: TemplateLayerInput,
  measureText: (props: TextProperties) => Promise<TextMetrics>
): Promise<{ width: number; height: number }> {
  const normalized = normalizeTemplateLayer(cloneCompositionValue(child, "template layout child"));
  if (normalized.type === "image" && normalized.images) {
    const image = (Array.isArray(normalized.images) ? normalized.images[0] : normalized.images) as Record<string, unknown>;
    const width = Number(image?.width ?? 0);
    const height = Number(image?.height ?? 0);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) return { width, height };
    throw new TemplateResolveError("Template layout image child requires positive width and height.");
  }
  if (normalized.type === "text" && normalized.texts) {
    const texts = normalized.texts as TextProperties | TextProperties[];
    const props = Array.isArray(texts) ? texts[0] : texts;
    if (!props) throw new TemplateResolveError("Template layout text child is empty.");
    const metrics = await measureText(props);
    return { width: metrics.width, height: metrics.height };
  }
  if (normalized.type === "layout" || normalized.type === "surface") {
    const source = normalized.type === "surface" ? normalized.placement as Record<string, unknown> : normalized;
    const width = Number(source?.width ?? 0);
    const height = Number(source?.height ?? 0);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) return { width, height };
  }
  throw new TemplateResolveError(`Template layout: unsupported or unsized child type "${String(normalized.type)}".`);
}

function offsetLayerBy(layer: TemplateLayerInput, dx: number, dy: number): TemplateLayerInput {
  const normalized = normalizeTemplateLayer(cloneCompositionValue(layer, "template layout offset"));
  if (normalized.type === "image" && normalized.images) {
    const images = Array.isArray(normalized.images) ? normalized.images : [normalized.images];
    normalized.images = images.map((image) => ({
      ...(image as Record<string, unknown>),
      x: Number((image as Record<string, unknown>).x ?? 0) + dx,
      y: Number((image as Record<string, unknown>).y ?? 0) + dy,
    }));
    if (!Array.isArray(layer.images)) normalized.images = (normalized.images as unknown[])[0];
    return normalized;
  }
  if (normalized.type === "text" && normalized.texts) {
    const texts = Array.isArray(normalized.texts) ? normalized.texts : [normalized.texts];
    normalized.texts = texts.map((text) => ({
      ...(text as Record<string, unknown>),
      x: Number((text as Record<string, unknown>).x ?? 0) + dx,
      y: Number((text as Record<string, unknown>).y ?? 0) + dy,
    }));
    if (!Array.isArray(layer.texts)) normalized.texts = (normalized.texts as unknown[])[0];
    return normalized;
  }
  if (normalized.type === "surface") {
    const placement = normalized.placement as Record<string, unknown>;
    normalized.placement = { ...placement, x: Number(placement?.x ?? 0) + dx, y: Number(placement?.y ?? 0) + dy };
    return normalized;
  }
  if (normalized.type === "layout") {
    normalized.x = Number(normalized.x ?? 0) + dx;
    normalized.y = Number(normalized.y ?? 0) + dy;
  }
  return normalized;
}

export async function expandFlexLayoutNode(
  node: TemplateLayerInput,
  measureText: (props: TextProperties) => Promise<TextMetrics>
): Promise<TemplateLayerInput[]> {
  const layout = node.layout as Record<string, unknown> | undefined;
  if (!layout || layout.type !== "flex") throw new TemplateResolveError('Template layout: expected layout.type "flex".');
  const direction = layout.direction === "column" ? "column" : "row";
  if (layout.direction !== undefined && layout.direction !== "row" && layout.direction !== "column") throw new TemplateResolveError("Template flex direction must be row or column.");
  const gap = finiteNonNegative(layout.gap, "template.flex.gap");
  const padding = finiteNonNegative(layout.padding, "template.flex.padding");
  const align = layout.align ?? "start";
  const justify = layout.justify ?? "start";
  if (!["start", "center", "end"].includes(String(align))) throw new TemplateResolveError("Template flex align must be start, center, or end.");
  if (!["start", "center", "end", "space-between"].includes(String(justify))) throw new TemplateResolveError("Template flex justify is invalid.");

  const x = Number(node.x ?? 0), y = Number(node.y ?? 0), width = Number(node.width), height = Number(node.height);
  assertFiniteNumber(x, "template.flex.x"); assertFiniteNumber(y, "template.flex.y");
  assertFiniteNumber(width, "template.flex.width", { min: 0, exclusiveMin: true });
  assertFiniteNumber(height, "template.flex.height", { min: 0, exclusiveMin: true });
  if (padding * 2 >= width || padding * 2 >= height) throw new TemplateResolveError("Template flex padding leaves no positive inner area.");
  const children = (node.children as TemplateLayerInput[] | undefined) ?? [];
  assertCollection(children, "template.flex.children");
  const sizes = await Promise.all(children.map((child) => measureChildSize(child, measureText)));
  const innerW = width - 2 * padding, innerH = height - 2 * padding;
  const out: TemplateLayerInput[] = [];

  if (direction === "row") {
    const baseTotal = sizes.reduce((sum, size) => sum + size.width, 0) + gap * Math.max(0, children.length - 1);
    let cursor = padding;
    if (justify === "center") cursor += Math.max(0, (innerW - baseTotal) / 2);
    else if (justify === "end") cursor += Math.max(0, innerW - baseTotal);
    const extra = justify === "space-between" && children.length > 1 ? Math.max(0, innerW - baseTotal) / (children.length - 1) : 0;
    for (let index = 0; index < children.length; index++) {
      const size = sizes[index]!;
      let cross = padding;
      if (align === "center") cross += Math.max(0, (innerH - size.height) / 2);
      else if (align === "end") cross += Math.max(0, innerH - size.height);
      out.push(offsetLayerBy(children[index]!, x + cursor, y + cross));
      cursor += size.width + (index < children.length - 1 ? gap + extra : 0);
    }
  } else {
    const baseTotal = sizes.reduce((sum, size) => sum + size.height, 0) + gap * Math.max(0, children.length - 1);
    let cursor = padding;
    if (justify === "center") cursor += Math.max(0, (innerH - baseTotal) / 2);
    else if (justify === "end") cursor += Math.max(0, innerH - baseTotal);
    const extra = justify === "space-between" && children.length > 1 ? Math.max(0, innerH - baseTotal) / (children.length - 1) : 0;
    for (let index = 0; index < children.length; index++) {
      const size = sizes[index]!;
      let cross = padding;
      if (align === "center") cross += Math.max(0, (innerW - size.width) / 2);
      else if (align === "end") cross += Math.max(0, innerW - size.width);
      out.push(offsetLayerBy(children[index]!, x + cross, y + cursor));
      cursor += size.height + (index < children.length - 1 ? gap + extra : 0);
    }
  }
  return out;
}

export async function expandGridLayoutNode(
  node: TemplateLayerInput,
  measureText: (props: TextProperties) => Promise<TextMetrics>
): Promise<TemplateLayerInput[]> {
  const layout = node.layout as Record<string, unknown> | undefined;
  if (!layout || layout.type !== "grid") throw new TemplateResolveError('Template layout: expected layout.type "grid".');
  const columns = Number(layout.columns ?? 1);
  assertFiniteNumber(columns, "template.grid.columns", { min: 1, integer: true });
  const gap = finiteNonNegative(layout.gap, "template.grid.gap");
  const padding = finiteNonNegative(layout.padding, "template.grid.padding");
  const align = layout.align ?? "start", justify = layout.justify ?? "start";
  if (!["start", "center", "end"].includes(String(align)) || !["start", "center", "end"].includes(String(justify))) {
    throw new TemplateResolveError("Template grid align/justify must be start, center, or end.");
  }
  const x = Number(node.x ?? 0), y = Number(node.y ?? 0), width = Number(node.width), height = Number(node.height);
  assertFiniteNumber(x, "template.grid.x"); assertFiniteNumber(y, "template.grid.y");
  assertFiniteNumber(width, "template.grid.width", { min: 0, exclusiveMin: true });
  assertFiniteNumber(height, "template.grid.height", { min: 0, exclusiveMin: true });
  if (padding * 2 >= width || padding * 2 >= height) throw new TemplateResolveError("Template grid padding leaves no positive inner area.");
  const children = (node.children as TemplateLayerInput[] | undefined) ?? [];
  assertCollection(children, "template.grid.children");
  if (children.length === 0) return [];
  const sizes = await Promise.all(children.map((child) => measureChildSize(child, measureText)));
  const cellW = (width - 2 * padding - gap * (columns - 1)) / columns;
  if (!(cellW > 0)) throw new TemplateResolveError("Template grid columns/gap leave no positive cell width.");
  const rows = Math.ceil(children.length / columns);
  const rowHeights = Array.from({ length: rows }, (_, row) => {
    let max = 0;
    for (let column = 0; column < columns; column++) {
      const item = sizes[row * columns + column];
      if (item) max = Math.max(max, item.height);
    }
    return max;
  });
  const out: TemplateLayerInput[] = [];
  let yCursor = padding;
  for (let row = 0; row < rows; row++) {
    let xCursor = padding;
    const rowH = rowHeights[row]!;
    for (let column = 0; column < columns; column++) {
      const index = row * columns + column;
      if (index >= children.length) break;
      const size = sizes[index]!;
      let dx = 0, dy = 0;
      if (justify === "center") dx = Math.max(0, (cellW - size.width) / 2);
      else if (justify === "end") dx = Math.max(0, cellW - size.width);
      if (align === "center") dy = Math.max(0, (rowH - size.height) / 2);
      else if (align === "end") dy = Math.max(0, rowH - size.height);
      out.push(offsetLayerBy(children[index]!, x + xCursor + dx, y + yCursor + dy));
      xCursor += cellW + gap;
    }
    yCursor += rowH + (row < rows - 1 ? gap : 0);
  }
  return out;
}

async function expandResolvedLayers(
  layers: TemplateLayerInput[],
  measureText: (props: TextProperties) => Promise<TextMetrics>
): Promise<TemplateLayerInput[]> {
  const out: TemplateLayerInput[] = [];
  for (const raw of layers) {
    const layer = normalizeTemplateLayer(raw);
    if (layer.type === "layout") {
      const layout = layer.layout as Record<string, unknown> | undefined;
      const expanded = layout?.type === "flex"
        ? await expandFlexLayoutNode(layer, measureText)
        : layout?.type === "grid"
          ? await expandGridLayoutNode(layer, measureText)
          : (() => { throw new TemplateResolveError(`Template layout: unsupported layout.type "${String(layout?.type)}".`); })();
      out.push(...await expandResolvedLayers(expanded, measureText));
      continue;
    }
    if (layer.type === "surface" && Array.isArray(layer.layers)) {
      layer.layers = await expandResolvedLayers(layer.layers as TemplateLayerInput[], measureText);
    }
    out.push(layer);
  }
  return out;
}

function stripTemplateMeta(layer: TemplateLayerInput): TemplateLayerInput {
  const { id: _id, visible: _visible, ...rest } = layer;
  if (rest.type === "surface" && Array.isArray(rest.layers)) {
    return { ...rest, layers: (rest.layers as TemplateLayerInput[]).map(stripTemplateMeta) };
  }
  return rest;
}

/** Full immutable template pipeline with deterministic insertion/override/visibility/layout semantics. */
export async function resolveTemplateToSceneInput(
  definition: Omit<SceneRenderInput, "layers"> & { layers: TemplateLayerInput[] },
  ctx: ResolveContext,
  overrides: TemplateLayerOverrides | undefined,
  measureText: (props: TextProperties) => Promise<TextMetrics>,
  insertions?: readonly TemplateLayerInsertion[]
): Promise<SceneRenderInput> {
  const snapshot = cloneCompositionValue(definition, "template definition");
  let layers = applyInsertions(snapshot.layers, insertions);
  collectIds(layers);
  layers = mergeOverridesIntoLayers(layers, overrides);
  layers = filterVisibleTree(layers, ctx.data);

  const resolvedTree = deepResolveStrings(
    { width: snapshot.width, height: snapshot.height, background: snapshot.background, layers },
    ctx
  ) as Record<string, unknown>;
  const coerced = coerceNumbers(resolvedTree) as Record<string, unknown>;
  const expanded = await expandResolvedLayers(coerced.layers as TemplateLayerInput[], measureText);
  const finalLayers = expanded.map((layer) => stripTemplateMeta(coerceNumbers(layer) as TemplateLayerInput)) as unknown as SceneLayer[];
  const scene: SceneRenderInput = {
    width: Number(coerced.width),
    height: Number(coerced.height),
    ...(coerced.background !== undefined ? { background: coerced.background as SceneRenderInput["background"] } : {}),
    layers: finalLayers,
  };
  validateSceneRenderInput(scene);
  return scene;
}
