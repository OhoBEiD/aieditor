// AI Image Generation Service
// Supports Flux Schnell via Replicate API for cheap, high-quality image generation
// Use cases: logo extraction, screenshot-to-design conversion, text-to-image

import Replicate from "replicate";

// Initialize Replicate client
// API key should be set in REPLICATE_API_TOKEN environment variable
function getReplicateClient() {
  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) {
    throw new Error("REPLICATE_API_TOKEN environment variable is not set");
  }
  return new Replicate({ auth: apiToken });
}

// --- Types ---

export interface TextToImageOptions {
  prompt: string;
  width?: number;
  height?: number;
  numOutputs?: number;
  guidanceScale?: number;
  numInferenceSteps?: number;
}

export interface ImageToImageOptions {
  prompt: string;
  image: string; // Base64 data URL or public URL
  strength?: number; // 0-1, how much to transform (0 = keep original, 1 = completely new)
  width?: number;
  height?: number;
  guidanceScale?: number;
  numInferenceSteps?: number;
}

export interface ImageGenerationResult {
  url: string;
  width: number;
  height: number;
  model: string;
}

// --- Flux Schnell (Fast & Cheap) ---

/**
 * Generate image from text using Flux Schnell
 * Cost: ~$0.003 per image on Replicate
 * Speed: 3-10 seconds
 * License: Apache 2.0 (commercial use allowed)
 */
export async function generateImageFromText(
  options: TextToImageOptions
): Promise<ImageGenerationResult> {
  const replicate = getReplicateClient();

  const {
    prompt,
    width = 1024,
    height = 1024,
    numOutputs = 1,
    guidanceScale = 7.5,
    numInferenceSteps = 4, // Flux Schnell is optimized for 4 steps
  } = options;

  try {
    const output = await replicate.run(
      "black-forest-labs/flux-schnell" as any,
      {
        input: {
          prompt,
          width,
          height,
          num_outputs: numOutputs,
          guidance_scale: guidanceScale,
          num_inference_steps: numInferenceSteps,
        },
      }
    );

    // Replicate returns an array of image URLs
    const imageUrl = Array.isArray(output) ? output[0] : output;

    return {
      url: imageUrl as string,
      width,
      height,
      model: "flux-schnell",
    };
  } catch (error: any) {
    console.error("[ImageGeneration] Flux Schnell error:", error);
    throw new Error(`Image generation failed: ${error.message}`);
  }
}

/**
 * Generate image from image (img2img) using Flux Schnell
 * Use case: Screenshot to polished design, logo extraction/enhancement
 * Cost: ~$0.003 per image on Replicate
 */
export async function generateImageFromImage(
  options: ImageToImageOptions
): Promise<ImageGenerationResult> {
  const replicate = getReplicateClient();

  const {
    prompt,
    image,
    strength = 0.7, // Default: moderate transformation
    width = 1024,
    height = 1024,
    guidanceScale = 7.5,
    numInferenceSteps = 4,
  } = options;

  try {
    // Flux Schnell img2img (if supported by model, otherwise use Flux Dev)
    // For img2img, we use Flux Dev which has better img2img support
    const output = await replicate.run(
      "black-forest-labs/flux-dev" as any,
      {
        input: {
          prompt,
          image, // Can be data URL or public URL
          prompt_strength: strength,
          width,
          height,
          guidance_scale: guidanceScale,
          num_inference_steps: numInferenceSteps,
        },
      }
    );

    const imageUrl = Array.isArray(output) ? output[0] : output;

    return {
      url: imageUrl as string,
      width,
      height,
      model: "flux-dev",
    };
  } catch (error: any) {
    console.error("[ImageGeneration] Flux Dev img2img error:", error);
    throw new Error(`Image-to-image generation failed: ${error.message}`);
  }
}

/**
 * Extract logo or design elements from a screenshot and generate variations
 * Use case: "Extract the logo from this screenshot and give me a clean version"
 */
export async function extractLogoFromScreenshot(
  screenshotBase64: string,
  enhancementPrompt?: string
): Promise<ImageGenerationResult> {
  const defaultPrompt = enhancementPrompt ||
    "Clean, professional logo with transparent background, high resolution, vector-style, isolated on white background";

  return generateImageFromImage({
    prompt: defaultPrompt,
    image: screenshotBase64,
    strength: 0.5, // Moderate transformation - keep logo recognizable
    width: 512,
    height: 512,
  });
}

/**
 * Convert screenshot to polished design
 * Use case: User uploads rough mockup, AI generates production-ready version
 */
export async function screenshotToDesign(
  screenshotBase64: string,
  designPrompt: string
): Promise<ImageGenerationResult> {
  return generateImageFromImage({
    prompt: designPrompt,
    image: screenshotBase64,
    strength: 0.6, // Keep layout but polish visuals
  });
}

// --- Cost Estimation ---

/**
 * Estimate cost for image generation
 * Replicate charges ~$0.003 per Flux Schnell image
 * Flux Dev (for img2img) costs ~$0.025 per image
 */
export function estimateCost(
  modelType: "flux-schnell" | "flux-dev",
  numImages: number
): number {
  const costs = {
    "flux-schnell": 0.003,
    "flux-dev": 0.025,
  };

  return costs[modelType] * numImages;
}
