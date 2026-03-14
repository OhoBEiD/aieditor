// Skills Loader - Parse and inject Superpowers-style skill files
// Supports YAML frontmatter + markdown content with dynamic string substitution

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

// --- Types ---

export interface SkillMetadata {
  name: string;
  description?: string;
  disableModelInvocation?: boolean;
  allowedTools?: string[];
  category?: 'tdd' | 'brainstorming' | 'debugging' | 'code-review' | 'reference';
  autoInject?: boolean; // Auto-inject for all requests vs. manual invocation
}

export interface Skill {
  metadata: SkillMetadata;
  content: string; // Markdown content after frontmatter
  rawContent: string; // Full file content including frontmatter
}

export interface SkillContext {
  sessionId?: string;
  projectId?: string;
  requestId?: string;
  complexity?: string;
  taskType?: string;
  [key: string]: any; // Allow arbitrary context variables
}

// --- Parsing ---

/**
 * Parse a skill file with YAML frontmatter
 * Format:
 * ---
 * name: my-skill
 * description: What this does
 * ---
 * # Markdown content...
 */
function parseSkillFile(filePath: string): Skill | null {
  try {
    const rawContent = readFileSync(filePath, 'utf-8');

    // Extract frontmatter (between --- markers)
    const frontmatterMatch = rawContent.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (!frontmatterMatch) {
      // No frontmatter - treat entire file as content with default metadata
      return {
        metadata: {
          name: filePath.split('/').pop()?.replace('.md', '') || 'unknown',
          autoInject: false,
        },
        content: rawContent,
        rawContent,
      };
    }

    const [, frontmatter, content] = frontmatterMatch;

    // Parse YAML frontmatter (simple key: value parser)
    const metadata: Partial<SkillMetadata> = {};
    frontmatter.split('\n').forEach(line => {
      const match = line.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        const camelKey = key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

        // Parse boolean values
        if (value === 'true') metadata[camelKey as keyof SkillMetadata] = true as any;
        else if (value === 'false') metadata[camelKey as keyof SkillMetadata] = false as any;
        // Parse array values (comma-separated)
        else if (key === 'allowed-tools') metadata.allowedTools = value.split(',').map(t => t.trim());
        else metadata[camelKey as keyof SkillMetadata] = value as any;
      }
    });

    return {
      metadata: {
        name: metadata.name || 'unknown',
        description: metadata.description,
        disableModelInvocation: metadata.disableModelInvocation,
        allowedTools: metadata.allowedTools,
        category: metadata.category,
        autoInject: metadata.autoInject ?? false,
      },
      content: content.trim(),
      rawContent,
    };
  } catch (error) {
    console.error(`[Skills] Failed to parse ${filePath}:`, error);
    return null;
  }
}

// --- Loading ---

/**
 * Load all skill files from the skills directory
 */
export function loadAllSkills(): Skill[] {
  const skillsDir = join(process.cwd(), 'src/lib/ai/skills');

  if (!existsSync(skillsDir)) {
    console.warn('[Skills] Skills directory not found:', skillsDir);
    return [];
  }

  const files = readdirSync(skillsDir).filter(f => f.endsWith('.md'));
  const skills: Skill[] = [];

  for (const file of files) {
    const skill = parseSkillFile(join(skillsDir, file));
    if (skill) skills.push(skill);
  }

  console.log(`[Skills] Loaded ${skills.length} skills: ${skills.map(s => s.metadata.name).join(', ')}`);
  return skills;
}

/**
 * Load a specific skill by name
 */
export function loadSkill(name: string): Skill | null {
  const skillsDir = join(process.cwd(), 'src/lib/ai/skills');
  const filePath = join(skillsDir, `${name}.md`);

  if (!existsSync(filePath)) {
    console.warn(`[Skills] Skill not found: ${name}`);
    return null;
  }

  return parseSkillFile(filePath);
}

// --- String Substitution ---

/**
 * Replace dynamic variables in skill content
 * Supports: ${VAR_NAME}, $VAR_NAME
 */
export function substituteSkillVariables(content: string, context: SkillContext): string {
  let result = content;

  // Replace ${VAR_NAME} format
  result = result.replace(/\$\{([A-Z_]+)\}/g, (_, varName) => {
    const key = varName.toLowerCase().replace(/_([a-z])/g, (_: any, letter: string) => letter.toUpperCase());
    return context[key] !== undefined ? String(context[key]) : `\${${varName}}`;
  });

  // Replace $VAR_NAME format (without braces)
  result = result.replace(/\$([A-Z_]+)/g, (_, varName) => {
    const key = varName.toLowerCase().replace(/_([a-z])/g, (_: any, letter: string) => letter.toUpperCase());
    return context[key] !== undefined ? String(context[key]) : `$${varName}`;
  });

  return result;
}

// --- Skill Selection ---

/**
 * Select skills to inject based on context
 * Auto-inject skills marked with autoInject: true
 * Filter by category if specified
 */
export function selectSkills(
  allSkills: Skill[],
  options: {
    category?: SkillMetadata['category'];
    autoInjectOnly?: boolean;
    manualSkills?: string[]; // Explicitly requested skills by name
  } = {}
): Skill[] {
  let selected = allSkills;

  // Filter by category
  if (options.category) {
    selected = selected.filter(s => s.metadata.category === options.category);
  }

  // Filter by auto-inject
  if (options.autoInjectOnly) {
    selected = selected.filter(s => s.metadata.autoInject === true);
  }

  // Add manually requested skills
  if (options.manualSkills?.length) {
    const manual = allSkills.filter(s => options.manualSkills!.includes(s.metadata.name));
    selected = [...selected, ...manual];
  }

  // Deduplicate by name
  const seen = new Set<string>();
  return selected.filter(s => {
    if (seen.has(s.metadata.name)) return false;
    seen.add(s.metadata.name);
    return true;
  });
}

// --- Formatting for Prompts ---

/**
 * Format skills for injection into system prompts
 */
export function formatSkillsForPrompt(skills: Skill[], context: SkillContext = {}): string {
  if (skills.length === 0) return '';

  const sections = skills.map(skill => {
    const content = substituteSkillVariables(skill.content, context);
    return `## SKILL: ${skill.metadata.name.toUpperCase()}${skill.metadata.description ? ` — ${skill.metadata.description}` : ''}\n\n${content}`;
  });

  return `\n\n# 🦸 SUPERPOWERS (MANDATORY SKILLS - FOLLOW EXACTLY)\n\n${sections.join('\n\n---\n\n')}\n`;
}

// --- Public API ---

/**
 * Get skills to inject for a given request context
 */
export function getSkillsForContext(context: {
  taskType?: 'simple_edit' | 'complex_feature' | 'debug' | 'refactor' | 'question';
  complexity?: 'simple' | 'moderate' | 'complex';
  phase?: 'brainstorming' | 'planning' | 'executing' | 'reviewing';
  manualSkills?: string[];
}): string {
  const allSkills = loadAllSkills();

  // Determine which skills to inject based on context
  const skillsToInject: string[] = [];

  // Always include reference skills
  skillsToInject.push('reference');

  // TDD for complex features and refactors
  if (context.taskType === 'complex_feature' || context.taskType === 'refactor') {
    skillsToInject.push('tdd');
  }

  // Debugging for debug tasks
  if (context.taskType === 'debug') {
    skillsToInject.push('debugging');
  }

  // Brainstorming for planning phase
  if (context.phase === 'brainstorming') {
    skillsToInject.push('brainstorming');
  }

  // Code review for review phase
  if (context.phase === 'reviewing') {
    skillsToInject.push('code-review');
  }

  // Add manual skills
  if (context.manualSkills?.length) {
    skillsToInject.push(...context.manualSkills);
  }

  // Select and format
  const selected = selectSkills(allSkills, { manualSkills: skillsToInject });
  return formatSkillsForPrompt(selected, {
    taskType: context.taskType,
    complexity: context.complexity,
    phase: context.phase,
  });
}
