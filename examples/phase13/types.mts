import {
  ApexPainter,
  ApexifyResourceLimitError,
  configureApexifyRuntime,
  resetApexifyRuntimeConfig,
} from "apexify.js";
import type {
  ApexifyPlugin,
  CanvasConfig,
  CreateTextOptions,
  RenderLimits,
  SceneRenderInput,
} from "apexify.js";

const painter = new ApexPainter({ type: "buffer" });
const canvasConfig: CanvasConfig = { width: 320, height: 180, colorBg: "#111827" };
const canvas = await painter.createCanvas(canvasConfig);
const png: Buffer = await painter.createText(
  {
    text: "typed",
    x: 20,
    y: 40,
    font: { size: 24, family: "Arial" },
    fill: { color: "#ffffff" },
  },
  canvas
);

const advancedText: CreateTextOptions = {
  isGrouped: true,
  groupTransform: { rotation: 4, scaleX: 1.05, opacity: 0.9 },
};
const advancedPng: Buffer = await painter.createText(
  [
    { text: "typed", x: 20, y: 40, font: { size: 24, weight: 600, style: "oblique" } },
    { text: "group", x: 95, y: 40, font: { size: 24, family: "Arial" } },
  ],
  canvas,
  advancedText,
  { resolveAssetRefs: false }
);

const scene: SceneRenderInput = { width: 320, height: 180, layers: [] };
painter.validateSceneRenderInput(scene);

const plugin: ApexifyPlugin<ApexPainter> = {
  name: "phase13-example",
  async install() {},
};
const installation: Promise<ApexPainter> = painter.use(plugin);
await installation;

const config = configureApexifyRuntime({ limits: { maxBatchConcurrency: 2 } });
const limits: RenderLimits = config.limits;
resetApexifyRuntimeConfig();

const sample = new ApexifyResourceLimitError("maxBatchOperations", 256, 257);
if (sample.code !== "APEXIFY_RESOURCE_LIMIT") throw new Error("Unexpected error code.");

void png;
void advancedPng;
void limits;
