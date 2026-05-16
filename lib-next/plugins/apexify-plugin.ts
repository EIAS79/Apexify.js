/**
 * Install hook for optional features (QR, barcodes, …) without growing the core {@link ApexPainter} class.
 *
 * @example
 * ```ts
 * painter.use({
 *   name: "demo",
 *   install(p) {
 *     p.plugins.use("demo", { ping: () => "ok" });
 *   },
 * });
 * ```
 */
export interface ApexifyPlugin<T = unknown> {
  name: string;
  install(host: T): void | Promise<void>;
}
