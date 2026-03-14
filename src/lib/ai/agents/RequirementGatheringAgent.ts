// Requirement Gathering Agent - Socratic questioning before implementation
// Analyzes user request for missing critical information
// Generates smart, contextual questions to fill gaps
// Returns structured questions as interactive form

import { generateText } from "ai";
import { selectModel } from "../router";

// --- Types ---

export type QuestionType = "text" | "select" | "multi-select" | "radio" | "textarea";

export interface Question {
  id: string;
  question: string;
  type: QuestionType;
  required: boolean;
  placeholder?: string;
  options?: string[];
  defaultValue?: string | string[];
  helpText?: string;
}

export interface RequirementGatheringResult {
  questions: Question[];
  detectedTaskType: string; // "ecommerce", "landing_page", "dashboard", "portfolio", etc.
  missingInfo: string[]; // What's missing from original request
  shouldGather: boolean; // True if questions are needed, false if request is complete
}

// --- System Prompt ---

const REQUIREMENT_GATHERING_PROMPT = `You are a requirements analyst. Your job is to identify missing critical information in user requests.

## YOUR ROLE
When a user asks to build something, analyze what specific details are missing that would result in hallucinated/invented content.

## CRITICAL RULES
1. **Don't ask obvious questions** - if the user said "build a dark theme ecom store", don't ask about theme
2. **Focus on identity info** - brand name, company name, product details, target audience
3. **Ask about specifics** - not "what features?" but "which of these features: [options]"
4. **Keep it short** - 3-5 questions max, only for truly missing info
5. **Don't ask if clear** - if request is complete, return shouldGather: false

## TASK TYPES & TYPICAL MISSING INFO

### Ecommerce
Missing usually: Brand name, product categories, color theme, required features
Questions:
- "What's your brand/store name?" (text, required)
- "What products will you sell?" (multi-select or text)
- "Preferred color theme?" (select: Dark Premium, Light Clean, Warm Earthy, Custom)
- "Required features?" (multi-select: Cart, Wishlist, Filters, Reviews, etc.)

### Landing Page
Missing usually: Brand/company name, services/products, target audience, CTA
Questions:
- "What's your company/product name?" (text, required)
- "What do you offer?" (textarea: describe services/products)
- "Who is your target audience?" (select or text)
- "Primary call-to-action?" (text: e.g., "Get Started", "Contact Us")

### Dashboard
Missing usually: App name, data types, user roles, key metrics
Questions:
- "What's your app/platform name?" (text, required)
- "What data will the dashboard show?" (multi-select or textarea)
- "User roles?" (multi-select: Admin, Manager, Analyst, etc.)

### Portfolio
Missing usually: Name, profession, project types, style preference
Questions:
- "Your name or brand?" (text, required)
- "Your profession/title?" (text: e.g., "Frontend Developer")
- "Types of projects to showcase?" (multi-select: Web Apps, Mobile, Design, etc.)

### Blog
Missing usually: Blog name, topics, author name, style
Questions:
- "Blog name?" (text, required)
- "Main topics/categories?" (multi-select or text)
- "Author name?" (text)

## EXAMPLE ANALYSIS

### Example 1: Complete Request
Input: "Build an ecommerce website for Furry Furniture selling living room and bedroom furniture with a dark luxury theme"
Analysis: Has brand (Furry Furniture), products (living/bedroom furniture), theme (dark luxury)
Output: { "shouldGather": false }

### Example 2: Incomplete Request
Input: "build me an ecom web"
Analysis: Missing brand name, product types, theme, features
Output: {
  "shouldGather": true,
  "detectedTaskType": "ecommerce",
  "missingInfo": ["brand name", "product categories", "color theme", "required features"],
  "questions": [
    {
      "id": "brand_name",
      "question": "What's your brand or store name?",
      "type": "text",
      "required": true,
      "placeholder": "e.g., Furry Furniture"
    },
    {
      "id": "product_category",
      "question": "What products will you sell?",
      "type": "textarea",
      "required": true,
      "placeholder": "Describe your products or select categories",
      "helpText": "Be specific - this helps create accurate product pages"
    },
    {
      "id": "color_theme",
      "question": "Preferred color theme?",
      "type": "select",
      "required": false,
      "options": ["Dark & Premium", "Light & Clean", "Warm & Earthy", "Vibrant & Bold", "Custom (I'll describe)"],
      "defaultValue": "Dark & Premium"
    },
    {
      "id": "required_features",
      "question": "Which features do you need?",
      "type": "multi-select",
      "required": true,
      "options": ["Shopping Cart", "Product Filters", "Wishlist", "User Reviews", "Search", "Related Products"]
    }
  ]
}

### Example 3: Landing Page
Input: "create a landing page for my saas"
Analysis: Missing company name, product description, target audience
Output: {
  "shouldGather": true,
  "detectedTaskType": "landing_page",
  "missingInfo": ["company name", "product description", "target audience"],
  "questions": [
    {
      "id": "company_name",
      "question": "What's your company or product name?",
      "type": "text",
      "required": true,
      "placeholder": "e.g., Acme Analytics"
    },
    {
      "id": "product_description",
      "question": "What does your SaaS do? (1-2 sentences)",
      "type": "textarea",
      "required": true,
      "placeholder": "We help businesses analyze customer data and predict trends using AI",
      "helpText": "This will be your hero section headline/subheadline"
    },
    {
      "id": "target_audience",
      "question": "Who is your target audience?",
      "type": "select",
      "required": false,
      "options": ["Startups", "Enterprise", "SMBs", "Developers", "Designers", "Marketers", "General"]
    }
  ]
}

## OUTPUT FORMAT (STRICT JSON)
You MUST output valid JSON in this exact structure:

\`\`\`json
{
  "shouldGather": true | false,
  "detectedTaskType": "ecommerce" | "landing_page" | "dashboard" | "portfolio" | "blog" | "other",
  "missingInfo": ["item 1", "item 2"],
  "questions": [
    {
      "id": "unique_id",
      "question": "The question to ask the user",
      "type": "text" | "select" | "multi-select" | "textarea",
      "required": true | false,
      "placeholder": "Example text",
      "options": ["Option 1", "Option 2"],
      "defaultValue": "Default option",
      "helpText": "Optional help text"
    }
  ]
}
\`\`\`

**CRITICAL**: If the request is already complete (has brand, specifics, theme), return:
\`\`\`json
{
  "shouldGather": false,
  "detectedTaskType": "ecommerce",
  "missingInfo": [],
  "questions": []
}
\`\`\`
`;

// --- Agent ---

/**
 * Analyze user request and generate requirement gathering questions
 * Returns shouldGather: false if request is complete, true if questions needed
 */
export async function runRequirementGatheringAgent(
  userRequest: string,
): Promise<RequirementGatheringResult> {
  const config = selectModel("classify"); // Use fast model for analysis

  const prompt = `## User Request
"${userRequest}"

## Task
Analyze this request and determine:
1. Is critical information missing? (brand name, product details, theme, etc.)
2. If yes, generate 3-5 smart questions to gather the missing info
3. If no, return shouldGather: false

Output as JSON.`;

  try {
    const result = await generateText({
      model: config.model,
      system: REQUIREMENT_GATHERING_PROMPT,
      prompt,
      temperature: 0.3, // Low temperature for consistent structure
    });

    return parseRequirementGatheringOutput(result.text || "");
  } catch (error) {
    console.error("[RequirementGathering] Error:", error);
    // Fallback: skip gathering on error
    return {
      shouldGather: false,
      detectedTaskType: "other",
      missingInfo: [],
      questions: [],
    };
  }
}

// --- Parser ---

function parseRequirementGatheringOutput(text: string): RequirementGatheringResult {
  let parsed: any = null;

  try {
    parsed = JSON.parse(text);
  } catch {
    // Try markdown JSON block
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[1]);
      } catch { /* continue */ }
    }

    // Try finding JSON object in text
    if (!parsed) {
      const braceMatch = text.match(/\{[\s\S]*"shouldGather"[\s\S]*\}/);
      if (braceMatch) {
        try {
          parsed = JSON.parse(braceMatch[0]);
        } catch { /* continue */ }
      }
    }
  }

  if (parsed) {
    return {
      shouldGather: parsed.shouldGather ?? false,
      detectedTaskType: parsed.detectedTaskType || "other",
      missingInfo: Array.isArray(parsed.missingInfo) ? parsed.missingInfo : [],
      questions: Array.isArray(parsed.questions)
        ? parsed.questions.map((q: any) => ({
            id: q.id || `question_${Date.now()}`,
            question: q.question || "",
            type: q.type || "text",
            required: q.required ?? false,
            placeholder: q.placeholder,
            options: Array.isArray(q.options) ? q.options : undefined,
            defaultValue: q.defaultValue,
            helpText: q.helpText,
          }))
        : [],
    };
  }

  // Fallback: no gathering needed
  return {
    shouldGather: false,
    detectedTaskType: "other",
    missingInfo: [],
    questions: [],
  };
}

// --- Helper: Build Enriched Prompt from User Answers ---

/**
 * Combine original request with user answers to create enriched prompt
 * Example:
 *   Original: "build me an ecom web"
 *   Answers: { brand_name: "Furry", product_category: "Furniture", color_theme: "Dark & Premium" }
 *   Enriched: "Build an ecommerce website for 'Furry' selling Furniture with a Dark & Premium color theme"
 */
export function buildEnrichedPrompt(
  originalRequest: string,
  userAnswers: Record<string, any>,
  detectedTaskType: string,
): string {
  let enriched = originalRequest;

  // Extract answers
  const brandName = userAnswers.brand_name || userAnswers.company_name || userAnswers.name;
  const productCategory = userAnswers.product_category || userAnswers.products;
  const colorTheme = userAnswers.color_theme || userAnswers.theme;
  const features = Array.isArray(userAnswers.required_features)
    ? userAnswers.required_features.join(", ")
    : userAnswers.required_features;
  const description = userAnswers.product_description || userAnswers.description;
  const targetAudience = userAnswers.target_audience;

  // Build enriched prompt based on task type
  switch (detectedTaskType) {
    case "ecommerce":
      enriched = `Build an ecommerce website`;
      if (brandName) enriched += ` for "${brandName}"`;
      if (productCategory) enriched += ` selling ${productCategory}`;
      if (colorTheme) enriched += ` with a ${colorTheme} color theme`;
      if (features) enriched += `. Required features: ${features}`;
      break;

    case "landing_page":
      enriched = `Create a landing page`;
      if (brandName) enriched += ` for "${brandName}"`;
      if (description) enriched += `. Product: ${description}`;
      if (targetAudience) enriched += ` targeting ${targetAudience}`;
      if (colorTheme) enriched += ` with ${colorTheme} styling`;
      break;

    case "dashboard":
      enriched = `Build a dashboard`;
      if (brandName) enriched += ` for "${brandName}"`;
      if (description) enriched += `. Purpose: ${description}`;
      if (features) enriched += `. Key features: ${features}`;
      break;

    case "portfolio":
      enriched = `Create a portfolio website`;
      if (brandName) enriched += ` for ${brandName}`;
      if (userAnswers.profession) enriched += ` (${userAnswers.profession})`;
      if (userAnswers.project_types) enriched += ` showcasing ${userAnswers.project_types}`;
      if (colorTheme) enriched += ` with ${colorTheme} design`;
      break;

    case "blog":
      enriched = `Build a blog`;
      if (brandName) enriched += ` called "${brandName}"`;
      if (userAnswers.topics) enriched += ` about ${userAnswers.topics}`;
      if (userAnswers.author_name) enriched += ` by ${userAnswers.author_name}`;
      break;

    default:
      // Generic: append all non-empty answers
      const details = Object.entries(userAnswers)
        .filter(([_, value]) => value && value !== "")
        .map(([key, value]) => {
          if (Array.isArray(value)) return `${key}: ${value.join(", ")}`;
          return `${key}: ${value}`;
        })
        .join(", ");
      if (details) enriched += `. Details: ${details}`;
  }

  return enriched;
}

// --- Helper: Check if Request Needs Gathering ---

/**
 * Quick heuristic to decide if requirement gathering is needed
 * Based on request length, complexity, and presence of specific details
 */
export function shouldGatherRequirements(
  message: string,
  classification: { type: string; complexity: string },
): boolean {
  // Skip for simple edits, questions, and debug tasks
  if (
    classification.type === "simple_edit" ||
    classification.type === "question" ||
    classification.type === "debug"
  ) {
    return false;
  }

  // Skip if message is very detailed (>100 words with specifics)
  const wordCount = message.split(/\s+/).length;
  const hasSpecifics =
    /\b(called|named|for|brand|company)\b/i.test(message) &&
    /\b(theme|color|style|design)\b/i.test(message);

  if (wordCount > 100 && hasSpecifics) {
    return false; // Likely already detailed
  }

  // Gather for moderate+ complex features
  if (
    (classification.type === "complex_feature" || classification.type === "ui_task") &&
    (classification.complexity === "moderate" || classification.complexity === "complex")
  ) {
    return true;
  }

  return false;
}
