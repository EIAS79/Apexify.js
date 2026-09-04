import { ApexPainter as ApexPainterCore } from "./main";
import type { ApexifyPlugin } from "../types";

/**
 * Public ApexPainter composition contract. Plugin installation is promise-based and is complete only after `await use()`.
 */
export class ApexPainter extends ApexPainterCore {
  override async use(plugin: ApexifyPlugin<ApexPainterCore>): Promise<this> {
    await this.plugins.install(plugin, this);
    return this;
  }
}
