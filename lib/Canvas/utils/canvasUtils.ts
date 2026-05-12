/**
 * Exported utilities for handling canvas configurations and drawing operations.
 * @param CanvasConfig The configuration options for the canvas.
 * @param radiusBorder The function for applying a radius border to the canvas.
 * @param circularBorder The function for applying a circular border to the canvas.
 * @param drawBackgroundColor The function for drawing a solid background color on the canvas.
 * @param drawBackgroundGradient The function for drawing a gradient background on the canvas.
 * @param customBackground The function for drawing a custom background image on the canvas.
 */

import { OutputFormat, CanvasConfig, ImageProperties, TextObject, TextProperties, GIFOptions, GIFResults, GIFInputFrame, GIFEncodedFrame, GIFDisposalMethod, GIFWatermarkSpec, CustomOptions, cropOptions, GradientConfig, Frame, PatternOptions, ExtractFramesOptions, ResizeOptions, CropOptions, MaskOptions, BlendOptions, ShapeType, ShapeProperties, ImageFilter, BatchOperation, ChainOperation, StitchOptions, CollageLayout, CompressionOptions, PaletteOptions, SaveOptions, SaveResult, CreateImageOptions, GroupTransformOptions, TextMetrics, PixelData, PixelManipulationOptions, BackgroundLayer, BackgroundPatternRepeat, BackgroundImageAlign } from "./types";
import { drawBackgroundColor, drawBackgroundGradient, customBackground, applyCanvasZoom, drawPattern, applyNoise, drawBackgroundLayers, resolveMediaPath } from "./background/bg";
import { buildPath, applyRotation, createGradientFill, fitInto, loadImageCached, applyStroke, drawBoxBackground, applyShadow } from './image/imageProperties'
import { applyImageFilters } from './image/imageFilters'
import { applyProfessionalImageFilters } from './image/professionalImageFilters'
import { drawText, WrappedText } from "./text/textProperties";
import { loadImages, resizingImg, converter, applyColorFilters, imgEffects, cropOuter, cropInner, detectColors, removeColor, bgRemoval } from "./ops/generalFunctions";
import { customLines } from "./drawing/customLines";
import { url, arrayBuffer, base64, dataURL, blob  } from "./ops/conversion";
import { drawShape, isShapeSource, createShapePath } from "./shape/shapes";
import { applyImageMask, applyClipPath, applyPerspectiveDistortion, applyBulgeDistortion, applyMeshWarp } from "./image/imageMasking";
import { applyVignette, applyLensFlare, applyChromaticAberration, applyFilmGrain } from "./image/imageEffects";
import { drawArrow, drawMarker, createSmoothPath, createCatmullRomPath, applyLinePattern, applyLineTexture, getPointOnLinePath } from "./drawing/advancedLines";
import { batchOperations, chainOperations } from "./ops/batchOperations";
import { stitchImages, createCollage } from "./ops/imageStitching";
import { compressImage, extractPalette } from "./ops/imageCompression";
import * as Charts from "./chart/index";
import { getErrorMessage, getCanvasContext } from "./foundation/errorUtils";

export {
    url,
    OutputFormat,
    arrayBuffer,
    base64,
    dataURL,
    blob,
    CanvasConfig,
    ImageProperties,
    TextObject,
    TextProperties,
    GIFOptions,
    GIFResults,
    GIFInputFrame,
    GIFEncodedFrame,
    GIFDisposalMethod,
    GIFWatermarkSpec,
    CustomOptions,
    cropOptions,
    customLines,
    drawBackgroundColor,
    drawBackgroundGradient,
    drawBackgroundLayers,
    customBackground,
    drawText,
    WrappedText,
    loadImages,
    resizingImg,
    converter,
    applyColorFilters,
    imgEffects,
    cropInner,
    cropOuter,
    detectColors,
    removeColor,
    bgRemoval,
    GradientConfig,
    Frame,
    PatternOptions,
    BackgroundLayer,
    BackgroundPatternRepeat,
    BackgroundImageAlign,
    ExtractFramesOptions,
    ResizeOptions,
    CropOptions,
    buildPath,
    applyRotation,
    createGradientFill,
    fitInto, loadImageCached,
    applyStroke,
    applyShadow,
    drawBoxBackground,
    MaskOptions,
    BlendOptions,
    applyCanvasZoom,
    drawPattern,
    applyNoise,
    resolveMediaPath,
    ShapeType,
    ShapeProperties,
    ImageFilter,
    drawShape,
    isShapeSource,
    createShapePath,
    applyImageFilters,
    applyProfessionalImageFilters,

    applyImageMask,
    applyClipPath,
    applyPerspectiveDistortion,
    applyBulgeDistortion,
    applyMeshWarp,

    applyVignette,
    applyLensFlare,
    applyChromaticAberration,
    applyFilmGrain,

    drawArrow,
    drawMarker,
    createSmoothPath,
    createCatmullRomPath,
    applyLinePattern,
    applyLineTexture,
    getPointOnLinePath,
    // Batch operations
    batchOperations,
    chainOperations,
    // Image stitching and collage
    stitchImages,
    createCollage,
    // Image compression and palette
    compressImage,
    extractPalette,

    BatchOperation,
    ChainOperation,
    StitchOptions,
    CollageLayout,
    CompressionOptions,
    PaletteOptions,
    // Save options
    SaveOptions,
    SaveResult,
    // Error utilities
    getErrorMessage,
    getCanvasContext,
    // Charts
    Charts,
    // Group transform options
    CreateImageOptions,
    GroupTransformOptions,
    // Text metrics
    TextMetrics,
    // Pixel data
    PixelData,
    PixelManipulationOptions
};

// Export Path2D and Hit Detection types
export type { PathCommand } from "./foundation/pathCmd";
export type { Path2DDrawOptions } from "../services/Path2DCreator";
export type { HitRegion, HitDetectionOptions, HitDetectionResult } from "../services/HitDetectionCreator";
