// Artifact System — Structured deliverables from the AI pipeline
// Inspired by Antigravity's artifact-centered collaboration

// --- Artifact Types ---

export type ArtifactType =
  | "plan"
  | "component_preview"
  | "quality_report"
  | "screenshot"
  | "test_result"
  | "brain_update"
  | "diff"
  | "branch_comparison"
  | "proposal";

export interface Artifact {
  id: string;
  type: ArtifactType;
  title: string;
  data: ArtifactData;
  timestamp: number;
}

// --- Per-Type Data Shapes ---

export type ArtifactData =
  | PlanArtifactData
  | ComponentPreviewData
  | QualityReportData
  | ScreenshotData
  | TestResultData
  | BrainUpdateData
  | DiffData
  | BranchComparisonData
  | ProposalData;

export interface PlanArtifactData {
  tasks: Array<{
    id: string;
    description: string;
    status: "pending" | "in_progress" | "completed" | "failed";
    dependencies: string[];
    complexity: string;
  }>;
  totalTasks: number;
}

export interface ComponentPreviewData {
  filePath: string;
  componentName: string;
  snippet: string; // First ~30 lines
  lineCount: number;
}

export interface QualityReportData {
  overall: number; // 0-10
  fileScores: Array<{
    path: string;
    score: number;
    issues: string[];
    suggestions: string[];
  }>;
  criticalIssues: string[];
}

export interface ScreenshotData {
  image?: string; // base64 (optional, may be large)
  passed: boolean;
  issues: string[];
  suggestions: string[];
}

export interface TestResultData {
  testsGenerated: number;
  testFiles: Array<{
    path: string;
    testCount: number;
    coverageEstimate: number; // 0-100
  }>;
}

export interface BrainUpdateData {
  entriesAdded: number;
  entries: Array<{
    category: string;
    content: string;
    confidence: number;
  }>;
}

export interface DiffData {
  filePath: string;
  additions: number;
  deletions: number;
  snippet: string;
}

export interface BranchComparisonData {
  branches: Array<{
    id: number;
    strategy: string;
    qualityScore: number;
    errorCount: number;
    selected: boolean;
  }>;
  selectedBranch: number;
  reason: string;
}

export interface ProposalData {
  options: Array<{
    id: number;
    title: string;
    description: string;
    complexity: string;
    estimatedFiles: number;
    pros: string[];
    cons: string[];
  }>;
  recommendation: number;
  recommendationReason: string;
  researchSummary: string;
}
