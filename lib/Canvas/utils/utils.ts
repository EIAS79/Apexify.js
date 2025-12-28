/**
 * Exported utilities for handling canvas configurations and drawing operations.
 * @param CanvasConfig The configuration options for the canvas.
 * @param radiusBorder The function for applying a radius border to the canvas.
 * @param circularBorder The function for applying a circular border to the canvas.
 * @param drawBackgroundColor The function for drawing a solid background color on the canvas.
 * @param drawBackgroundGradient The function for drawing a gradient background on the canvas.
 * @param customBackground The function for drawing a custom background image on the canvas.
 */

import { OutputFormat, CanvasConfig, ImageProperties, TextObject, TextProperties, GIFOptions, GIFResults, CustomOptions, cropOptions, GradientConfig, Frame, PatternOptions, ExtractFramesOptions, ResizeOptions, CropOptions, MaskOptions, BlendOptions, ShapeType, ShapeProperties, ImageFilter, BatchOperation, ChainOperation, StitchOptions, CollageLayout, CompressionOptions, PaletteOptions, SaveOptions, SaveResult, CreateImageOptions, GroupTransformOptions, TextMetrics, PixelData, PixelManipulationOptions } from "./types";
import { drawBackgroundColor, drawBackgroundGradient, customBackground, applyCanvasZoom, drawPattern, applyNoise } from "./Background/bg";
import { buildPath, applyRotation, createGradientFill, fitInto, loadImageCached, applyStroke, drawBoxBackground, applyShadow } from './Image/imageProperties'
import { applyImageFilters } from './Image/imageFilters'
import { applyProfessionalImageFilters } from './Image/professionalImageFilters'
import { drawText, WrappedText } from "./Texts/textProperties";
import { loadImages, resizingImg, converter, applyColorFilters, imgEffects, cropOuter, cropInner, detectColors, removeColor, bgRemoval } from './General/general functions';
import { customLines } from "./Custom/customLines";
import { url, arrayBuffer, base64, dataURL, blob  } from "./General/conversion";
import { drawShape, isShapeSource, createShapePath } from "./Shapes/shapes";
import { applyImageMask, applyClipPath, applyPerspectiveDistortion, applyBulgeDistortion, applyMeshWarp } from "./Image/imageMasking";
import { applyVignette, applyLensFlare, applyChromaticAberration, applyFilmGrain } from "./Image/imageEffects";
import { renderTextOnPath } from "./Texts/textPathRenderer";
import { drawArrow, drawMarker, createSmoothPath, createCatmullRomPath, applyLinePattern, applyLineTexture, getPointOnLinePath } from "./Custom/advancedLines";
import { batchOperations, chainOperations } from "./General/batchOperations";
import { stitchImages, createCollage } from "./General/imageStitching";
import { compressImage, extractPalette } from "./General/imageCompression";
import * as Charts from "./Charts/index";
import { getErrorMessage, getCanvasContext } from "./errorUtils";

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
    CustomOptions,
    cropOptions,
    customLines,
    drawBackgroundColor,
    drawBackgroundGradient,
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

    renderTextOnPath,

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
export type { PathCommand, Path2DDrawOptions } from "../extended/Path2DCreator";
export type { HitRegion, HitDetectionOptions, HitDetectionResult } from "../extended/HitDetectionCreator";
