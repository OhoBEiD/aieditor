/**
 * PreviewLoader Usage Examples
 *
 * This shows how to integrate the PreviewLoader with your workflow
 */

import { PreviewPanel } from './editor/PreviewPanel';
import { useState, useEffect } from 'react';

// Example 1: Basic usage with loading state
export function Example1() {
  const [isLoading, setIsLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    // Simulate preview initialization
    setTimeout(() => {
      setPreviewUrl('https://your-preview-url.com');
      setIsLoading(false);
    }, 2000);
  }, []);

  return (
    <PreviewPanel
      previewUrl={previewUrl}
      isLoading={isLoading}
      loadingStage="initializing"
      loadingMessage="Starting preview environment..."
    />
  );
}

// Example 2: With workflow stages
export function Example2() {
  const [stage, setStage] = useState<'initializing' | 'applying' | 'building' | 'ready'>('initializing');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stages: Array<typeof stage> = ['initializing', 'applying', 'building', 'ready'];
    let currentIndex = 0;

    const interval = setInterval(() => {
      currentIndex++;
      if (currentIndex < stages.length) {
        setStage(stages[currentIndex]);
      } else {
        setIsLoading(false);
        clearInterval(interval);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  return (
    <PreviewPanel
      previewUrl="https://preview.example.com"
      isLoading={isLoading}
      loadingStage={stage}
      loadingMessage={getMessageForStage(stage)}
    />
  );
}

function getMessageForStage(stage: 'initializing' | 'applying' | 'building' | 'ready'): string {
  const messages = {
    initializing: 'Setting up preview environment...',
    applying: 'Applying your changes to the code...',
    building: 'Building and compiling your project...',
    ready: 'Preview is ready!',
  };
  return messages[stage];
}

// Example 3: Integration with n8n workflow
export function Example3WithN8N() {
  const [workflowState, setWorkflowState] = useState({
    isLoading: false,
    stage: 'initializing' as const,
    previewUrl: '',
  });

  const handleEditRequest = async (message: string) => {
    setWorkflowState({ isLoading: true, stage: 'initializing', previewUrl: '' });

    try {
      // Call your n8n webhook
      const response = await fetch('https://daveisgm05.app.n8n.cloud/webhook/agent/edit-ui', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: 'your-site-id',
          conversationId: 'conv-123',
          userId: 'user-456',
          message,
        }),
      });

      // Update stage as workflow progresses
      setWorkflowState(prev => ({ ...prev, stage: 'applying' }));

      const data = await response.json();

      setWorkflowState(prev => ({ ...prev, stage: 'building' }));

      // Simulate build time
      await new Promise(resolve => setTimeout(resolve, 2000));

      setWorkflowState({
        isLoading: false,
        stage: 'ready',
        previewUrl: data.previewUrl,
      });
    } catch (error) {
      console.error('Preview failed:', error);
      setWorkflowState(prev => ({ ...prev, isLoading: false }));
    }
  };

  return (
    <div>
      <button onClick={() => handleEditRequest('Make the button blue')}>
        Apply Change
      </button>

      <PreviewPanel
        previewUrl={workflowState.previewUrl}
        isLoading={workflowState.isLoading}
        loadingStage={workflowState.stage}
        loadingMessage={getMessageForStage(workflowState.stage)}
      />
    </div>
  );
}
