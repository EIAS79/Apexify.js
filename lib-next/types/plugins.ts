/**
 * Install hook for optional features without growing the core {@link ApexPainter} class.
 */
export interface ApexifyPlugin<T = unknown> {
  name: string;
  install(host: T): void | Promise<void>;
}
