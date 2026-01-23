'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
    ChevronRight,
    ChevronDown,
    Folder,
    FolderOpen,
    File
} from 'lucide-react';

interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: FileNode[];
}

interface FileTreeProps {
    files: FileNode[];
    selectedFile?: string;
    onFileSelect: (path: string) => void;
    className?: string;
}

interface TreeNodeProps {
    node: FileNode;
    depth: number;
    selectedFile?: string;
    onFileSelect: (path: string) => void;
    expandedPaths: Set<string>;
    onToggleExpand: (path: string) => void;
}

const ICON_BASE_URL = 'https://raw.githubusercontent.com/material-extensions/vscode-material-icon-theme/main/icons';

// Comprehensive folder name to icon mapping
const FOLDER_ICON_MAP: Record<string, string> = {
    // Source & Core
    'src': 'folder-src',
    'source': 'folder-src',
    'lib': 'folder-lib',
    'libs': 'folder-lib',
    'library': 'folder-lib',

    // Components & UI
    'components': 'folder-components',
    'component': 'folder-components',
    'ui': 'folder-components',
    'widgets': 'folder-components',

    // App & Pages
    'app': 'folder-app',
    'application': 'folder-app',
    'pages': 'folder-views',
    'views': 'folder-views',
    'screens': 'folder-views',

    // API & Server
    'api': 'folder-api',
    'apis': 'folder-api',
    'server': 'folder-server',
    'servers': 'folder-server',
    'backend': 'folder-server',

    // Hooks & Utils
    'hooks': 'folder-hook',
    'hook': 'folder-hook',
    'utils': 'folder-utils',
    'util': 'folder-utils',
    'utilities': 'folder-utils',
    'helpers': 'folder-helper',
    'helper': 'folder-helper',

    // Public & Static
    'public': 'folder-public',
    'static': 'folder-public',
    'assets': 'folder-images',
    'images': 'folder-images',
    'img': 'folder-images',
    'icons': 'folder-images',
    'fonts': 'folder-font',
    'font': 'folder-font',

    // Styles
    'styles': 'folder-css',
    'style': 'folder-css',
    'css': 'folder-css',
    'scss': 'folder-sass',
    'sass': 'folder-sass',

    // Config & Settings
    'config': 'folder-config',
    'configs': 'folder-config',
    'configuration': 'folder-config',
    'settings': 'folder-config',

    // Build & Output
    '.next': 'folder-next',
    'next': 'folder-next',
    'dist': 'folder-dist',
    'build': 'folder-dist',
    'out': 'folder-dist',
    'output': 'folder-dist',

    // Cache & Temp
    'cache': 'folder-temp',
    '.cache': 'folder-temp',
    'temp': 'folder-temp',
    'tmp': 'folder-temp',

    // Node & Dependencies
    'node_modules': 'folder-node',
    'vendor': 'folder-node',
    'vendors': 'folder-node',
    'vendor-chunks': 'folder-node',
    'packages': 'folder-packages',

    // Webpack & Bundler
    'webpack': 'folder-webpack',
    'chunks': 'folder-webpack',

    // Tests
    'test': 'folder-test',
    'tests': 'folder-test',
    '__tests__': 'folder-test',
    'spec': 'folder-test',
    'specs': 'folder-test',
    '__mocks__': 'folder-mock',
    'mocks': 'folder-mock',
    'coverage': 'folder-coverage',

    // Types & Definitions
    'types': 'folder-typescript',
    'typings': 'folder-typescript',
    '@types': 'folder-typescript',
    'interfaces': 'folder-interface',

    // Documentation
    'docs': 'folder-docs',
    'doc': 'folder-docs',
    'documentation': 'folder-docs',

    // Database & Data
    'database': 'folder-database',
    'db': 'folder-database',
    'data': 'folder-database',
    'migrations': 'folder-database',
    'seeds': 'folder-database',
    'prisma': 'folder-prisma',
    'supabase': 'folder-supabase',

    // Context & State
    'context': 'folder-context',
    'contexts': 'folder-context',
    'store': 'folder-redux-store',
    'stores': 'folder-redux-store',
    'redux': 'folder-redux-store',
    'state': 'folder-redux-store',

    // Middleware & Routes
    'middleware': 'folder-middleware',
    'middlewares': 'folder-middleware',
    'routes': 'folder-routes',
    'router': 'folder-routes',

    // Services & Features
    'services': 'folder-core',
    'service': 'folder-core',
    'features': 'folder-core',
    'modules': 'folder-core',

    // Auth & Security
    'auth': 'folder-secure',
    'authentication': 'folder-secure',
    'security': 'folder-secure',

    // Logs & Debug
    'logs': 'folder-log',
    'log': 'folder-log',
    'debug': 'folder-debug',

    // Scripts & Tools
    'scripts': 'folder-scripts',
    'script': 'folder-scripts',
    'bin': 'folder-scripts',
    'tools': 'folder-tools',

    // GitHub & CI
    '.github': 'folder-github',
    'github': 'folder-github',
    '.gitlab': 'folder-gitlab',
    '.vscode': 'folder-vscode',

    // Docker & DevOps
    'docker': 'folder-docker',
    '.docker': 'folder-docker',
    'kubernetes': 'folder-kubernetes',
    'k8s': 'folder-kubernetes',

    // Environment
    'env': 'folder-environment',
    'environments': 'folder-environment',

    // Constants & Models
    'constants': 'folder-constant',
    'const': 'folder-constant',
    'models': 'folder-class',
    'entities': 'folder-class',
    'schemas': 'folder-class',

    // Functions & Lambda
    'functions': 'folder-functions',
    'lambda': 'folder-functions',
    'netlify': 'folder-functions',
    'vercel': 'folder-functions',

    // i18n & Localization
    'locales': 'folder-locale',
    'locale': 'folder-locale',
    'i18n': 'folder-locale',
    'translations': 'folder-locale',
    'lang': 'folder-locale',

    // Layout & Templates
    'layouts': 'folder-layout',
    'layout': 'folder-layout',
    'templates': 'folder-template',
    'template': 'folder-template',

    // Development
    'development': 'folder-debug',
    'dev': 'folder-debug',

    // GraphQL & Apollo
    'graphql': 'folder-graphql',
    'apollo': 'folder-apollo',

    // Error & Exception
    'errors': 'folder-error',
    'error': 'folder-error',
    'exceptions': 'folder-error',

    // Animation & Media
    'animations': 'folder-animation',
    'animation': 'folder-animation',
    'media': 'folder-video',
    'videos': 'folder-video',
    'audio': 'folder-audio',
    'sounds': 'folder-audio',
};

// Map extensions/names to icon filenames
function getIconUrl(filename: string, isDirectory: boolean, isOpen: boolean): string {
    if (isDirectory) {
        const name = filename.toLowerCase();
        const iconName = FOLDER_ICON_MAP[name];

        if (iconName) {
            return `${ICON_BASE_URL}/${iconName}${isOpen ? '-open' : ''}.svg`;
        }

        // Default folder
        return `${ICON_BASE_URL}/folder${isOpen ? '-open' : ''}.svg`;
    }

    const name = filename.toLowerCase();
    const ext = name.split('.').pop();
    const baseName = name.replace(/\.[^/.]+$/, ''); // filename without extension

    // Specific filenames (full match)
    const fileNameMap: Record<string, string> = {
        'package.json': 'nodejs',
        'package-lock.json': 'nodejs',
        'tsconfig.json': 'tsconfig',
        'jsconfig.json': 'jsconfig',
        'readme.md': 'readme',
        'readme': 'readme',
        'changelog.md': 'changelog',
        'changelog': 'changelog',
        'license': 'certificate',
        'license.md': 'certificate',
        'license.txt': 'certificate',
        '.gitignore': 'git',
        '.gitattributes': 'git',
        '.gitmodules': 'git',
        'next.config.js': 'next',
        'next.config.mjs': 'next',
        'next.config.ts': 'next',
        'tailwind.config.js': 'tailwindcss',
        'tailwind.config.ts': 'tailwindcss',
        'tailwind.config.cjs': 'tailwindcss',
        'postcss.config.js': 'postcss',
        'postcss.config.cjs': 'postcss',
        'postcss.config.mjs': 'postcss',
        'webpack.config.js': 'webpack',
        'webpack.config.ts': 'webpack',
        'vite.config.js': 'vite',
        'vite.config.ts': 'vite',
        'rollup.config.js': 'rollup',
        'babel.config.js': 'babel',
        'babel.config.json': 'babel',
        '.babelrc': 'babel',
        '.babelrc.js': 'babel',
        'eslint.config.js': 'eslint',
        'eslint.config.mjs': 'eslint',
        '.eslintrc': 'eslint',
        '.eslintrc.js': 'eslint',
        '.eslintrc.json': 'eslint',
        '.eslintrc.cjs': 'eslint',
        '.prettierrc': 'prettier',
        '.prettierrc.js': 'prettier',
        '.prettierrc.json': 'prettier',
        'prettier.config.js': 'prettier',
        'docker-compose.yml': 'docker',
        'docker-compose.yaml': 'docker',
        'dockerfile': 'docker',
        'compose.yml': 'docker',
        'compose.yaml': 'docker',
        '.dockerignore': 'docker',
        '.env': 'tune',
        '.env.local': 'tune',
        '.env.development': 'tune',
        '.env.production': 'tune',
        '.env.example': 'tune',
        '.env.sample': 'tune',
        'jest.config.js': 'jest',
        'jest.config.ts': 'jest',
        'jest.setup.js': 'jest',
        'vitest.config.ts': 'vitest',
        'playwright.config.ts': 'playwright',
        'cypress.config.js': 'cypress',
        'cypress.config.ts': 'cypress',
        'vercel.json': 'vercel',
        'netlify.toml': 'netlify',
        'fly.toml': 'fly',
        'railway.json': 'railway',
        'prisma.schema': 'prisma',
        'schema.prisma': 'prisma',
        '.npmrc': 'npm',
        '.npmignore': 'npm',
        '.yarnrc': 'yarn',
        '.yarnrc.yml': 'yarn',
        'yarn.lock': 'yarn',
        'pnpm-lock.yaml': 'pnpm',
        'pnpm-workspace.yaml': 'pnpm',
        '.editorconfig': 'editorconfig',
        'turbo.json': 'turbo',
        'nx.json': 'nx',
        'lerna.json': 'lerna',
        'commitlint.config.js': 'commitlint',
        '.commitlintrc': 'commitlint',
        '.huskyrc': 'husky',
        'robots.txt': 'robots',
        'sitemap.xml': 'xml',
        'manifest.json': 'json',
        'app.json': 'json',
        'contentlayer.config.ts': 'contentlayer',
        'middleware.ts': 'routing',
        'middleware.js': 'routing',
        'instrumentation.ts': 'tune',
        'global-error.tsx': 'error',
        'global-error.jsx': 'error',
        'error.tsx': 'error',
        'error.jsx': 'error',
        'not-found.tsx': 'tune',
        'not-found.jsx': 'tune',
        'loading.tsx': 'tune',
        'loading.jsx': 'tune',
        'layout.tsx': 'layout',
        'layout.jsx': 'layout',
        'page.tsx': 'react_ts',
        'page.jsx': 'react',
        'route.ts': 'routing',
        'route.js': 'routing',
    };

    // Check for exact filename match
    if (fileNameMap[name]) {
        return `${ICON_BASE_URL}/${fileNameMap[name]}.svg`;
    }

    // Check for pattern matches
    if (name.startsWith('.env')) return `${ICON_BASE_URL}/tune.svg`;
    if (name.endsWith('.lock')) return `${ICON_BASE_URL}/lock.svg`;
    if (name.endsWith('.config.js') || name.endsWith('.config.ts') || name.endsWith('.config.mjs')) {
        return `${ICON_BASE_URL}/settings.svg`;
    }
    if (name.includes('.d.ts')) return `${ICON_BASE_URL}/typescript-def.svg`;
    if (name.includes('.test.') || name.includes('.spec.')) return `${ICON_BASE_URL}/test-ts.svg`;
    if (name.includes('.stories.')) return `${ICON_BASE_URL}/storybook.svg`;
    if (name.endsWith('-manifest.json') || name.endsWith('.manifest.json')) return `${ICON_BASE_URL}/json.svg`;

    // Extension-based mapping
    const extMap: Record<string, string> = {
        // JavaScript & TypeScript
        'js': 'javascript',
        'mjs': 'javascript',
        'cjs': 'javascript',
        'jsx': 'react',
        'ts': 'typescript',
        'tsx': 'react_ts',
        'mts': 'typescript',
        'cts': 'typescript',

        // Styles
        'css': 'css',
        'scss': 'sass',
        'sass': 'sass',
        'less': 'less',
        'styl': 'stylus',
        'stylus': 'stylus',

        // Markup & Templates
        'html': 'html',
        'htm': 'html',
        'xhtml': 'html',
        'vue': 'vue',
        'svelte': 'svelte',
        'astro': 'astro',

        // Data formats
        'json': 'json',
        'jsonc': 'json',
        'json5': 'json',
        'yaml': 'yaml',
        'yml': 'yaml',
        'xml': 'xml',
        'toml': 'toml',
        'csv': 'csv',
        'tsv': 'csv',

        // Documentation
        'md': 'markdown',
        'mdx': 'mdx',
        'markdown': 'markdown',
        'txt': 'document',
        'text': 'document',
        'rtf': 'document',
        'pdf': 'pdf',

        // Images
        'svg': 'svg',
        'png': 'image',
        'jpg': 'image',
        'jpeg': 'image',
        'gif': 'image',
        'webp': 'image',
        'ico': 'image',
        'bmp': 'image',
        'tiff': 'image',
        'avif': 'image',

        // Database & Query
        'sql': 'database',
        'sqlite': 'database',
        'prisma': 'prisma',
        'graphql': 'graphql',
        'gql': 'graphql',

        // Shell & Scripts
        'sh': 'console',
        'bash': 'console',
        'zsh': 'console',
        'fish': 'console',
        'ps1': 'powershell',
        'bat': 'console',
        'cmd': 'console',

        // Other languages
        'py': 'python',
        'rb': 'ruby',
        'php': 'php',
        'java': 'java',
        'kt': 'kotlin',
        'go': 'go',
        'rs': 'rust',
        'c': 'c',
        'cpp': 'cpp',
        'h': 'h',
        'hpp': 'hpp',
        'cs': 'csharp',
        'swift': 'swift',
        'dart': 'dart',
        'r': 'r',
        'lua': 'lua',
        'ex': 'elixir',
        'exs': 'elixir',
        'erl': 'erlang',
        'clj': 'clojure',
        'scala': 'scala',
        'hs': 'haskell',

        // Config & Build
        'lock': 'lock',
        'log': 'log',
        'env': 'tune',

        // Fonts
        'woff': 'font',
        'woff2': 'font',
        'ttf': 'font',
        'otf': 'font',
        'eot': 'font',

        // Audio & Video
        'mp3': 'audio',
        'wav': 'audio',
        'ogg': 'audio',
        'mp4': 'video',
        'webm': 'video',
        'avi': 'video',
        'mov': 'video',

        // Archives
        'zip': 'zip',
        'tar': 'zip',
        'gz': 'zip',
        'rar': 'zip',
        '7z': 'zip',
    };

    if (ext && extMap[ext]) {
        return `${ICON_BASE_URL}/${extMap[ext]}.svg`;
    }

    // Default file icon
    return `${ICON_BASE_URL}/file.svg`;
}

// Icon component with fallback
function FileIcon({ url, alt, className }: { url: string; alt: string; className?: string }) {
    const [hasError, setHasError] = useState(false);

    if (hasError) {
        // Fallback to lucide icon
        return <File className={cn("w-4 h-4 text-gray-500", className)} />;
    }

    return (
        <img
            src={url}
            alt={alt}
            className={cn("w-4 h-4 object-contain", className)}
            onError={() => setHasError(true)}
        />
    );
}

function FolderIcon({ url, alt, isOpen, className }: { url: string; alt: string; isOpen: boolean; className?: string }) {
    const [hasError, setHasError] = useState(false);

    if (hasError) {
        // Fallback to lucide folder icon
        return isOpen
            ? <FolderOpen className={cn("w-4 h-4 text-amber-500", className)} />
            : <Folder className={cn("w-4 h-4 text-amber-500", className)} />;
    }

    return (
        <img
            src={url}
            alt={alt}
            className={cn("w-4 h-4 object-contain", className)}
            onError={() => setHasError(true)}
        />
    );
}

function TreeNode({ node, depth, selectedFile, onFileSelect, expandedPaths, onToggleExpand }: TreeNodeProps) {
    const isDirectory = node.type === 'directory';
    const isSelected = selectedFile === node.path;
    const isExpanded = expandedPaths.has(node.path);

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isDirectory) {
            onToggleExpand(node.path);
        } else {
            onFileSelect(node.path);
        }
    };

    const iconUrl = getIconUrl(node.name, isDirectory, isExpanded);

    return (
        <div>
            <div
                className={cn(
                    "group flex items-center gap-1.5 py-1 cursor-pointer transition-all font-medium text-[13px] relative w-max min-w-full hover:bg-black/5 rounded-r-lg pr-4",
                )}
                style={{ paddingLeft: `${depth * 16 + 12}px` }}
                onClick={handleClick}
            >
                {/* Selection Background Pill */}
                {isSelected && (
                    <div className="absolute inset-y-0 left-0 right-0 bg-blue-100/50 rounded-r-lg -z-10 border-l-2 border-blue-500" />
                )}

                {isDirectory ? (
                    <div className="flex items-center gap-1.5">
                        <span className="text-gray-400 group-hover:text-gray-600 transition-colors w-3.5 flex justify-center">
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </span>
                        <FolderIcon
                            url={iconUrl}
                            alt="folder"
                            isOpen={isExpanded}
                            className="opacity-90"
                        />
                        <span className={cn("truncate", isSelected ? "text-blue-700 font-semibold" : "text-gray-700")}>
                            {node.name}
                        </span>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 ml-[20px]"> {/* Indent to align with folder content */}
                        <FileIcon
                            url={iconUrl}
                            alt="file"
                            className="opacity-90"
                        />
                        <span className={cn("truncate", isSelected ? "text-blue-700 font-semibold" : "text-gray-700")}>
                            {node.name}
                        </span>
                    </div>
                )}
            </div>

            {isDirectory && isExpanded && node.children && (
                <div>
                    {node.children.map((child) => (
                        <TreeNode
                            key={child.path}
                            node={child}
                            depth={depth + 1}
                            selectedFile={selectedFile}
                            onFileSelect={onFileSelect}
                            expandedPaths={expandedPaths}
                            onToggleExpand={onToggleExpand}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// Helper to get all parent folder paths for a file
function getParentPaths(filePath: string): string[] {
    if (!filePath) return [];
    const parts = filePath.split('/');
    const paths: string[] = [];
    for (let i = 1; i < parts.length; i++) {
        paths.push(parts.slice(0, i).join('/'));
    }
    return paths;
}

export function FileTree({ files, selectedFile, onFileSelect, className }: FileTreeProps) {
    // Compute initial expanded paths based on selected file
    const initialExpandedPaths = useMemo(() => {
        const paths = new Set<string>();
        if (selectedFile) {
            // Expand all parent folders of the selected file
            getParentPaths(selectedFile).forEach(p => paths.add(p));
        }
        return paths;
    }, []); // Only compute once on mount

    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(initialExpandedPaths);

    // When selected file changes, ensure its parent folders are expanded
    useEffect(() => {
        if (selectedFile) {
            const parentPaths = getParentPaths(selectedFile);
            setExpandedPaths(prev => {
                const newSet = new Set(prev);
                let changed = false;
                parentPaths.forEach(p => {
                    if (!newSet.has(p)) {
                        newSet.add(p);
                        changed = true;
                    }
                });
                return changed ? newSet : prev;
            });
        }
    }, [selectedFile]);

    const handleToggleExpand = (path: string) => {
        setExpandedPaths(prev => {
            const newSet = new Set(prev);
            if (newSet.has(path)) {
                newSet.delete(path);
            } else {
                newSet.add(path);
            }
            return newSet;
        });
    };

    return (
        <div className={cn("h-full overflow-auto py-2", className)}>
            <div className="flex flex-col min-w-max">
                {files.map((node) => (
                    <TreeNode
                        key={node.path}
                        node={node}
                        depth={0}
                        selectedFile={selectedFile}
                        onFileSelect={onFileSelect}
                        expandedPaths={expandedPaths}
                        onToggleExpand={handleToggleExpand}
                    />
                ))}
            </div>
        </div>
    );
}
