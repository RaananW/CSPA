/**
 * `@underglass/ui/tokens`: the Strata design tokens and their framework-neutral runtime. The token source is
 * W3C Design Tokens JSON (also exported as `@underglass/ui/tokens.json`); the stylesheet generated from it is
 * `@underglass/ui/css/tokens.css`.
 * It also holds the Strata rendering model (`docs/ui-library/rendering-model.md`): the scene format, its reference
 * implementation and the conformance suite.
 */
import { strataSource } from "./source.ts";
import type { TokenGroup } from "./model.ts";

/** The Strata token source (W3C Design Tokens format). */
export const strataTokens: TokenGroup = strataSource;

export { blend, flatten, namespace, numeric, resolve, themesOf, valueOf } from "./model.ts";
export type { ResolveOptions, ThemeInfo, Token, TokenGroup, TokenMeta, TokenNode, TokenValue } from "./model.ts";
export { contrast, luminance, nearBlack, onColour, parseHex, scale, textColour, toHex } from "./contrast.ts";
export type { Rgb } from "./contrast.ts";
export { validateTokens } from "./validate.ts";
export type { Issue } from "./validate.ts";
export { cssVariable, layerOrder, literal as tokenCssValue, tokensToCss } from "./css.ts";
export type { TokensCssOptions } from "./css.ts";
export { finish, finishGradient, finishRecipes } from "./finish.ts";
export type { FinishRecipe } from "./finish.ts";
export { StrataThemeError, createStrataTheme, loadStrataTheme, themeTokenPaths } from "./theme.ts";
export type { CreateThemeOptions, StrataTheme, StrataThemeInput, ThemedColour } from "./theme.ts";
export { sceneFaces, sceneObjects, bevelProfiles, isSceneObject, scenePrimitiveBudget, sceneSettings, validateScene } from "./scene.ts";
export type { BevelProfile, SceneEntry, SceneFace, SceneIssue, SceneMaterial, SceneObject, SceneObjectKind, ScenePrimitive, SceneSettings, SceneState, StrataReliefScene, StrataScene } from "./scene.ts";
export { cameraOf, domeHit, domeObjects, environmentTerm, objectDistance, objectDrawable, reliefEquivalent, resolveObject, sideNormal, solidObjects, studio } from "./objects.ts";
export type { DomeHit, ResolvedObject } from "./objects.ts";
export { bevelSlopeMax, drawnArea, guardRamp, lightVector, profileAngle, renderScene, roundedBoxDistance, shadePoint, shadingTerms } from "./shade.ts";
export type { CapturedColour, Rgb01, Rgba, ShadingTerms } from "./shade.ts";
export { buildConformance, buildObjectsConformance, capturedFrom, conformanceCases, conformanceTolerance, objectsCases } from "./conformance.ts";
export type { CapturePaint, ConformanceCase, ConformanceSample, ConformanceSuite } from "./conformance.ts";
