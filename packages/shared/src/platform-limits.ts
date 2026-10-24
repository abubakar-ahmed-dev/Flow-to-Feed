import type { Platform } from "./types.js";

/**
 * Channel layout and validation defaults from the product spec.
 * These are application defaults, not universal platform requirements —
 * confirm provider-side limits during integration (Phase: channel lessons)
 * and update here. The backend enforces these, the UI mirrors them.
 */
export interface PlatformLimits {
  displayName: string;
  captionCharLimit?: number;
  slideCount?: { min: number; max: number };
  threadCount?: { min: number; max: number };
  /** Weighted character budget per X post; exact weighted counting is integrated separately. */
  xWeightedCharBudget?: number;
  visual: { width: number; height: number; format: "png" | "jpeg" };
}

export const PLATFORM_LIMITS: Record<Platform, PlatformLimits> = {
  instagram: {
    displayName: "Instagram",
    captionCharLimit: 2200,
    slideCount: { min: 4, max: 6 },
    visual: { width: 1080, height: 1350, format: "jpeg" },
  },
  facebook: {
    displayName: "Facebook",
    visual: { width: 1200, height: 1200, format: "jpeg" },
  },
  x: {
    displayName: "X",
    threadCount: { min: 3, max: 5 },
    xWeightedCharBudget: 280,
    visual: { width: 1200, height: 675, format: "png" },
  },
};

/** Practical input cap per generation request (characters). */
export const SOURCE_CHAR_LIMIT = 20_000;

/** Default diagram size guardrail; larger explanations should be split. */
export const MAX_DIAGRAM_COMPONENTS = 12;
