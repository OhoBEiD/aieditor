/**
 * Starter template files for WebContainer new projects
 * These are mounted when a new project is created
 */

export const STARTER_TEMPLATE = {
    'package.json': {
        file: {
            contents: JSON.stringify({
                "name": "webcontainer-next-app",
                "version": "0.1.0",
                "private": true,
                "scripts": {
                    "dev": "next dev",
                    "build": "next build",
                    "start": "next start"
                },
                "dependencies": {
                    "next": "14.2.5",
                    "react": "18.3.1",
                    "react-dom": "18.3.1"
                },
                "devDependencies": {
                    "typescript": "5.4.5",
                    "@types/node": "20.12.7",
                    "@types/react": "18.3.1",
                    "@types/react-dom": "18.3.0",
                    "autoprefixer": "10.4.19",
                    "postcss": "8.4.38",
                    "tailwindcss": "3.4.3"
                }
            }, null, 2)
        }
    },
    'next.config.js': {
        file: {
            contents: `/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
}
module.exports = nextConfig`
        }
    },
    'tsconfig.json': {
        file: {
            contents: JSON.stringify({
                "compilerOptions": {
                    "lib": ["dom", "dom.iterable", "esnext"],
                    "allowJs": true,
                    "skipLibCheck": true,
                    "strict": true,
                    "noEmit": true,
                    "esModuleInterop": true,
                    "module": "esnext",
                    "moduleResolution": "bundler",
                    "resolveJsonModule": true,
                    "isolatedModules": true,
                    "jsx": "preserve",
                    "incremental": true,
                    "plugins": [{ "name": "next" }],
                    "paths": { "@/*": ["./src/*"] }
                },
                "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
                "exclude": ["node_modules"]
            }, null, 2)
        }
    },
    'tailwind.config.js': {
        file: {
            contents: `/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './src/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {},
    },
    plugins: [],
}`
        }
    },
    'postcss.config.js': {
        file: {
            contents: `module.exports = {
    plugins: {
        tailwindcss: {},
        autoprefixer: {},
    },
}`
        }
    },
    'src': {
        directory: {
            'app': {
                directory: {
                    'layout.tsx': {
                        file: {
                            contents: `import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'My App',
    description: 'Created with AutoMate',
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    )
}`
                        }
                    },
                    'page.tsx': {
                        file: {
                            contents: `export default function Home() {
    return (
        <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-500 to-blue-600">
            <div className="text-center text-white">
                <h1 className="text-5xl font-bold mb-4">Welcome to AutoMate</h1>
                <p className="text-xl opacity-80">Tell me what to build! ✨</p>
            </div>
        </main>
    )
}`
                        }
                    },
                    'globals.css': {
                        file: {
                            contents: `@tailwind base;
@tailwind components;
@tailwind utilities;

* {
    box-sizing: border-box;
    padding: 0;
    margin: 0;
}

html, body {
    max-width: 100vw;
    overflow-x: hidden;
}
`
                        }
                    }
                }
            }
        }
    }
};

/**
 * Flatten the template into path -> content map for easier use
 */
export function flattenTemplate(template: any, prefix = ''): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(template)) {
        const fullPath = prefix ? `${prefix}/${key}` : key;

        if ((value as any).file) {
            result[fullPath] = (value as any).file.contents;
        } else if ((value as any).directory) {
            Object.assign(result, flattenTemplate((value as any).directory, fullPath));
        }
    }

    return result;
}
