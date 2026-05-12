import { ApexPainter } from "./Canvas/ApexPainter";

import * as CanvasUtils from "./Canvas/utils/canvasUtils";
import * as CanvasTypes from "./Canvas/utils/types";

export { ApexPainter };
export type {
  SceneLayer,
  SceneRenderInput,
  SceneSurfacePlacement,
  SceneChartType,
  SceneRenderResult,
  SceneGifInputFrame,
  SceneVideoFrameSlot,
} from "./Canvas/services/SceneCreator";
export { SceneCreator, SceneBuilder, expandSceneGifFrames, expandSceneVideoFrames } from "./Canvas/services/SceneCreator";
export { CanvasUtils, CanvasTypes };

export { checkApexifyUpdates } from "./check-updates";
export type { ApexifyUpdateStatus } from "./check-updates";

export * from "./Canvas/utils/canvasUtils";
export type * from "./Canvas/utils/types";