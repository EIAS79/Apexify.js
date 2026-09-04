/**
 * Install hook for optional features without growing the core {@link ApexPainter} class.
 *
 * Installation may be synchronous or asynchronous. `ApexPainter.use(plugin)` always returns a Promise and must be
 * awaited before plugin APIs are considered installed. Plugin names are unique per painter. Registrations made through
 * `painter.plugins` during a failed installation are rolled back.
 */
export interface ApexifyPlugin<T = unknown> {
  /** Stable unique name used for duplicate-install protection. */
  name: string;
  /** Configure the host. Returning/rejecting a Promise is fully supported by the installation lifecycle. */
  install(host: T): void | Promise<void>;
}
