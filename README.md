# AI Editor Agent

## Environment Variables

Create a `.env.local` file with the following:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_N8N_WEBHOOK_URL=your_n8n_webhook_url
```

## Getting Started

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the AI Editor Agent.

## Tech Stack

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Supabase** - Database & Auth
- **n8n** - AI workflow orchestration
- **Claude 3.5** - AI model for code editing
