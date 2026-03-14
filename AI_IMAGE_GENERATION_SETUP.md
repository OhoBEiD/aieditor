# AI Image Generation Setup Guide

This project supports cheap, high-quality AI image generation using **Flux Schnell** via Replicate API.

## 🎯 Features

- **Text-to-Image**: Generate images from text prompts
- **Image-to-Image**: Transform existing images based on prompts
- **Logo Extraction**: Extract and enhance logos from screenshots
- **Screenshot-to-Design**: Convert rough mockups into polished designs

## 💰 Pricing

- **Flux Schnell** (text-to-image): ~$0.003 per image
- **Flux Dev** (img2img): ~$0.025 per image
- **Free Tier**: 50 generations/month during trial
- **License**: Apache 2.0 (commercial use allowed for Flux Schnell)

## 🚀 Setup Instructions

### 1. Get Replicate API Token

1. Go to [Replicate](https://replicate.com)
2. Sign up for a free account
3. Navigate to [Account Settings → API Tokens](https://replicate.com/account/api-tokens)
4. Copy your API token

### 2. Configure Environment Variable

Add to your `.env.local`:

```bash
REPLICATE_API_TOKEN=r8_your_token_here
```

### 3. Install Dependencies

```bash
npm install
```

This will install the `replicate` SDK package.

### 4. Restart Development Server

```bash
npm run dev
```

## 📖 Usage

### Via UI Modal

1. Open the editor
2. Click the "Generate Image" button
3. Select generation mode:
   - **Text to Image**: Describe what you want
   - **Image to Image**: Upload image + describe transformation
   - **Extract Logo**: Upload screenshot with logo
   - **Screenshot → Design**: Upload mockup + describe style
4. Click "Generate"
5. Download or copy the generated image URL

### Via API

#### Text-to-Image

```typescript
const response = await fetch('/api/ai/generate-image', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mode: 'text-to-image',
    prompt: 'A modern minimalist logo for a tech startup, blue gradient',
    options: {
      width: 1024,
      height: 1024,
    },
  }),
});

const data = await response.json();
console.log(data.result.url); // Generated image URL
```

#### Image-to-Image

```typescript
const response = await fetch('/api/ai/generate-image', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mode: 'image-to-image',
    prompt: 'Transform this into a professional design with gradient background',
    image: 'data:image/png;base64,...', // Base64 data URL
    options: {
      strength: 0.7, // 0-1, higher = more transformation
    },
  }),
});
```

#### Extract Logo

```typescript
const response = await fetch('/api/ai/generate-image', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mode: 'extract-logo',
    image: 'data:image/png;base64,...', // Screenshot with logo
  }),
});
```

## 🔍 Check API Status

```bash
curl http://localhost:3000/api/ai/generate-image
```

Response:
```json
{
  "status": "ready",
  "models": {
    "flux-schnell": {
      "costPerImage": "$0.003",
      "speed": "3-10 seconds"
    }
  }
}
```

## 💡 Tips

1. **Cost Optimization**:
   - Use Flux Schnell for text-to-image (3x cheaper)
   - Use Flux Dev only for img2img tasks
   - Monitor usage on Replicate dashboard

2. **Quality Tips**:
   - Be specific in prompts: "modern minimalist logo" > "logo"
   - For img2img, adjust `strength`: 0.5 = subtle, 0.8 = major changes
   - Use 1024x1024 for best quality

3. **Alternative Free Option**:
   - Consider [Together AI](https://together.ai) for 3 months unlimited free
   - Or [Hugging Face](https://huggingface.co) for free tier with limits

## 🐛 Troubleshooting

**Error: "Replicate API token not configured"**
- Add `REPLICATE_API_TOKEN` to `.env.local`
- Restart dev server

**Error: "Image generation failed"**
- Check Replicate dashboard for quota/billing
- Verify API token is valid
- Check console logs for detailed error

**Slow generation (>30 seconds)**
- Normal for first run (model cold start)
- Subsequent runs are faster (3-10 seconds)

## 📚 Resources

- [Replicate Docs](https://replicate.com/docs)
- [Flux Schnell Model](https://replicate.com/black-forest-labs/flux-schnell)
- [API Pricing](https://replicate.com/pricing)
