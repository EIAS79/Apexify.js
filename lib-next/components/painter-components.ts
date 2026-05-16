import { badgeToLayers } from "./badge";
import { progressBarToLayers } from "./progress-bar";
import { avatarToLayers } from "./avatar";
import { cardToLayers } from "./card";
import { watermarkToLayers } from "./watermark";

export function createPainterComponents() {
  return {
    badge: { toLayers: badgeToLayers },
    progressBar: { toLayers: progressBarToLayers },
    avatar: { toLayers: avatarToLayers },
    card: { toLayers: cardToLayers },
    watermark: { toLayers: watermarkToLayers },
  };
}

export type PainterComponents = ReturnType<typeof createPainterComponents>;

export type {
  BadgeToLayersOptions,
  ProgressBarToLayersOptions,
  AvatarToLayersOptions,
  CardToLayersOptions,
  WatermarkToLayersOptions,
} from "./types";
