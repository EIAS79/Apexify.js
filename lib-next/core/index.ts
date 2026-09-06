export * from "./errors";
export { validHex } from "./color";
export * from "./geometry";

/** @deprecated Import image utilities from the image domain or use `painter.image`. */
export { applyColorFilters, imgEffects, detectColors, removeColor, bgRemoval } from "../image/image-utilities";
