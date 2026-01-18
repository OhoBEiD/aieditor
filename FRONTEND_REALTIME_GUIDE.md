# Supabase Realtime for Thinking Steps

## Frontend Setup (React/Next.js)

### 1. Install Supabase Client
```bash
npm install @supabase/supabase-js
```

### 2. Create Supabase Client
```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://jjrbnjubjiswvxeradzw.supabase.co',
  // Use the ANON key for frontend (not the service_role key!)
  'YOUR_SUPABASE_ANON_KEY'
)
```

### 3. Subscribe to Thinking Steps

```typescript
// In your chat component
import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'

function ChatPanel() {
  const [thinkingSteps, setThinkingSteps] = useState([])
  const [requestId, setRequestId] = useState(null)

  useEffect(() => {
    if (!requestId) return

    // Subscribe to new thinking steps for this request
    const channel = supabase
      .channel(`thinking-steps-${requestId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'thinking_steps',
          filter: `request_id=eq.${requestId}`
        },
        (payload) => {
          console.log('New step:', payload.new)

          setThinkingSteps(prev => [...prev, payload.new])

          // Check if complete
          if (payload.new.tool_name === 'complete' || payload.new.step_number === 999999) {
            console.log('Agent completed!')
            // Unsubscribe
            channel.unsubscribe()
          }
        }
      )
      .subscribe()

    // Cleanup on unmount
    return () => {
      channel.unsubscribe()
    }
  }, [requestId])

  const sendMessage = async (message: string) => {
    const response = await fetch('https://n8n-ai-editor.fly.dev/webhook/agent/edit-ui', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteId: 'your-site-id',
        message: message
      })
    })

    const data = await response.json()
    setRequestId(data.requestId) // This will trigger the subscription
  }

  return (
    <div>
      {/* Thinking steps display */}
      <div className="thinking-steps">
        {thinkingSteps.map((step, i) => (
          <div key={i} className="step">
            <span className="tool-name">{step.tool_name}</span>
            <span className="message">{step.message}</span>
            <span className={`status ${step.status}`}>{step.status}</span>
          </div>
        ))}
      </div>

      {/* Your chat UI */}
      <input onSubmit={(e) => sendMessage(e.target.value)} />
    </div>
  )
}
```

### 4. Enable Realtime on Supabase

Run this SQL in Supabase SQL Editor:

```sql
-- Enable realtime for thinking_steps table
ALTER PUBLICATION supabase_realtime ADD TABLE thinking_steps;

-- Optional: Add RLS policies if needed
ALTER TABLE thinking_steps ENABLE ROW LEVEL SECURITY;

-- Allow all users to read thinking steps
CREATE POLICY "Allow public read access"
  ON thinking_steps
  FOR SELECT
  USING (true);
```

### 5. UI Component Example

```tsx
// components/ThinkingSteps.tsx
export function ThinkingSteps({ steps }: { steps: ThinkingStep[] }) {
  const getIcon = (toolName: string) => {
    const icons = {
      'analyze': '🔍',
      'plan': '📋',
      'str_replace': '✏️',
      'write_file': '📝',
      'read_file': '📖',
      'run_build': '🔨',
      'complete': '✅'
    }
    return icons[toolName] || '⚙️'
  }

  const getStatusColor = (status: string) => {
    const colors = {
      'pending': 'text-gray-400',
      'running': 'text-blue-500',
      'complete': 'text-green-500',
      'error': 'text-red-500'
    }
    return colors[status] || 'text-gray-500'
  }

  return (
    <div className="space-y-2 p-4 bg-gray-50 rounded-lg">
      <h3 className="text-sm font-semibold text-gray-700">Agent Progress</h3>

      {steps.map((step, i) => (
        <div
          key={step.id}
          className="flex items-start gap-2 text-sm animate-fade-in"
        >
          <span className="text-lg">{getIcon(step.tool_name)}</span>

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{step.message}</span>
              <span className={`text-xs ${getStatusColor(step.status)}`}>
                {step.status}
              </span>
            </div>

            {step.details && (
              <pre className="text-xs text-gray-500 mt-1">
                {JSON.stringify(step.details, null, 2)}
              </pre>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
```

### 6. CSS Animation

```css
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fade-in 0.3s ease-out;
}
```

## TypeScript Types

```typescript
interface ThinkingStep {
  id: string
  request_id: string
  conversation_id?: string
  site_id: string
  step_number: number
  tool_name: string
  status: 'pending' | 'running' | 'complete' | 'error'
  message: string
  details?: Record<string, any>
  created_at: string
  updated_at: string
}
```

## Key Points

✅ **No n8n changes needed** - Workflow already writes to `thinking_steps` table
✅ **Real-time updates** - Frontend receives steps as they're inserted
✅ **Automatic cleanup** - Unsubscribe when complete
✅ **Scalable** - Supabase handles the WebSocket connections

## Troubleshooting

1. **Not receiving updates?**
   - Check that realtime is enabled: `ALTER PUBLICATION supabase_realtime ADD TABLE thinking_steps;`
   - Verify you're using the correct anon key (not service_role)
   - Check browser console for subscription errors

2. **Missing steps?**
   - Subscribe BEFORE sending the request to n8n
   - Or fetch initial steps then subscribe for new ones

3. **Permission errors?**
   - Add RLS policies to allow reading `thinking_steps`
