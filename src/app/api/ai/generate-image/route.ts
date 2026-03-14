// AI Image Generation API Endpoint
// Supports text-to-image and img2img using Flux Schnell (cheap & fast)
// Cost: ~$0.003 per image via Replicate

import { NextRequest, NextResponse } from "next/server";
import {
  generateImageFromText,
  generateImageFromImage,
  extractLogoFromScreenshot,
  screenshotToDesign,
  estimateCost,
} from "@/lib/ai/image-generation";

export const maxDuration = 60; // Image generation can take up to 60 seconds

interface RequestBody {
  mode: "text-to-image" | "image-to-image" | "extract-logo" | "screenshot-to-design";
  prompt?: string;
  image?: string; // Base64 data URL for img2img modes
  options?: {
    width?: number;
    height?: number;
    strength?: number; // For img2img: 0-1
    guidanceScale?: number;
    numInferenceSteps?: number;
  };
}

export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json();
    const { mode, prompt, image, options = {} } = body;

    // Validate required fields
    if (!mode) {
      return NextResponse.json(
        { error: "Missing required field: mode" },
        { status: 400 }
      );
    }

    // Check API token
    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json(
        { error: "Replicate API token not configured. Set REPLICATE_API_TOKEN in environment variables." },
        { status: 500 }
      );
    }

    let result;

    switch (mode) {
      case "text-to-image": {
        if (!prompt) {
          return NextResponse.json(
            { error: "Missing required field: prompt" },
            { status: 400 }
          );
        }

        result = await generateImageFromText({
          prompt,
          width: options.width,
          height: options.height,
          guidanceScale: options.guidanceScale,
          numInferenceSteps: options.numInferenceSteps,
        });

        break;
      }

      case "image-to-image": {
        if (!prompt || !image) {
          return NextResponse.json(
            { error: "Missing required fields: prompt and image" },
            { status: 400 }
          );
        }

        result = await generateImageFromImage({
          prompt,
          image,
          strength: options.strength,
          width: options.width,
          height: options.height,
          guidanceScale: options.guidanceScale,
          numInferenceSteps: options.numInferenceSteps,
        });

        break;
      }

      case "extract-logo": {
        if (!image) {
          return NextResponse.json(
            { error: "Missing required field: image" },
            { status: 400 }
          );
        }

        result = await extractLogoFromScreenshot(image, prompt);
        break;
      }

      case "screenshot-to-design": {
        if (!image || !prompt) {
          return NextResponse.json(
            { error: "Missing required fields: image and prompt" },
            { status: 400 }
          );
        }

        result = await screenshotToDesign(image, prompt);
        break;
      }

      default:
        return NextResponse.json(
          { error: `Invalid mode: ${mode}` },
          { status: 400 }
        );
    }

    // Calculate cost
    const modelType = mode === "text-to-image" ? "flux-schnell" : "flux-dev";
    const estimatedCost = estimateCost(modelType, 1);

    return NextResponse.json({
      success: true,
      result,
      metadata: {
        mode,
        model: result.model,
        estimatedCost: `$${estimatedCost.toFixed(4)}`,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("[API] Image generation error:", error);
    return NextResponse.json(
      {
        error: error.message || "Image generation failed",
        details: error.toString(),
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check API status and pricing
export async function GET() {
  const hasApiToken = !!process.env.REPLICATE_API_TOKEN;

  return NextResponse.json({
    status: hasApiToken ? "ready" : "not_configured",
    models: {
      "flux-schnell": {
        description: "Fast text-to-image (4 steps)",
        costPerImage: "$0.003",
        speed: "3-10 seconds",
        license: "Apache 2.0",
      },
      "flux-dev": {
        description: "Image-to-image transformation",
        costPerImage: "$0.025",
        speed: "10-20 seconds",
        license: "Non-commercial (dev)",
      },
    },
    modes: [
      {
        mode: "text-to-image",
        description: "Generate image from text prompt",
        model: "flux-schnell",
      },
      {
        mode: "image-to-image",
        description: "Transform existing image based on prompt",
        model: "flux-dev",
      },
      {
        mode: "extract-logo",
        description: "Extract and enhance logo from screenshot",
        model: "flux-dev",
      },
      {
        mode: "screenshot-to-design",
        description: "Convert screenshot to polished design",
        model: "flux-dev",
      },
    ],
  });
}
