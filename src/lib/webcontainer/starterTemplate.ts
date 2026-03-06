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
                    "react-dom": "18.3.1",
                    "gsap": "^3.12.5",
                    "lucide-react": "^0.344.0",
                    "motion": "^12.0.0",
                    "lenis": "^1.1.0"
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
    images: {
        remotePatterns: [
            { protocol: 'https', hostname: 'images.unsplash.com' },
            { protocol: 'https', hostname: 'randomuser.me' },
            { protocol: 'https', hostname: 'picsum.photos' },
            { protocol: 'https', hostname: 'fastly.picsum.photos' },
            { protocol: 'https', hostname: 'i.pravatar.cc' },
        ],
    },
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
        extend: {
            fontFamily: {
                sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
                space: ['var(--font-space)', 'system-ui', 'sans-serif'],
            },
            colors: {
                background: 'hsl(var(--background))',
                foreground: 'hsl(var(--foreground))',
                primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
                muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
                accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
                card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
                border: 'hsl(var(--border))',
            },
            borderRadius: {
                '2xl': '1rem',
                '3xl': '1.5rem',
            },
            animation: {
                'float': 'float 6s ease-in-out infinite',
                'float-slow': 'float 8s ease-in-out infinite',
            },
            keyframes: {
                float: {
                    '0%, 100%': { transform: 'translateY(0px)' },
                    '50%': { transform: 'translateY(-20px)' },
                },
            },
        },
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
import { Inter, Space_Grotesk } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space' })

export const metadata: Metadata = {
    title: 'My App',
    description: 'Created with Automate',
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en" className={[inter.variable, spaceGrotesk.variable].join(' ')}>
            <body className="font-sans antialiased bg-background text-foreground">
                {children}
                <div className="grain-overlay" />
            </body>
        </html>
    )
}`
                        }
                    },
                    'page.tsx': {
                        file: {
                            contents: `export default function Home() {
    return (
        <main className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background">
            <div className="fixed inset-0 -z-10 overflow-hidden">
                <div className="absolute top-1/4 -left-20 w-[500px] h-[500px] bg-gradient-to-r from-violet-600/20 to-indigo-600/20 rounded-full blur-[100px] animate-float" />
                <div className="absolute bottom-1/3 right-0 w-[400px] h-[400px] bg-gradient-to-r from-rose-500/15 to-orange-500/15 rounded-full blur-[80px] animate-float-slow" />
                <div className="absolute top-2/3 left-1/3 w-[300px] h-[300px] bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 rounded-full blur-[100px] animate-float" />
            </div>
            <div className="relative text-center">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full backdrop-blur-xl bg-white/[0.05] border border-white/[0.08] text-sm text-muted-foreground mb-8">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Ready to build
                </div>
                <h1 className="text-5xl md:text-7xl font-bold mb-6 font-space tracking-tight bg-gradient-to-b from-foreground to-foreground/50 bg-clip-text text-transparent">
                    Welcome to Automate
                </h1>
                <p className="text-xl text-muted-foreground max-w-md mx-auto">Tell me what to build and I'll create it with premium design, smooth animations, and pixel-perfect layouts.</p>
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

@layer base {
    :root {
        --background: 0 0% 100%;
        --foreground: 0 0% 5%;
        --primary: 262 83% 58%;
        --primary-foreground: 0 0% 100%;
        --muted: 0 0% 96%;
        --muted-foreground: 0 0% 40%;
        --accent: 262 83% 58%;
        --accent-foreground: 0 0% 100%;
        --card: 0 0% 100%;
        --card-foreground: 0 0% 5%;
        --border: 0 0% 90%;
    }
}

* {
    box-sizing: border-box;
    padding: 0;
    margin: 0;
}

html {
    scroll-behavior: smooth;
}

html, body {
    max-width: 100vw;
    overflow-x: hidden;
}

/* Glass morphism utility */
.glass {
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
}

.glass-light {
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    background: rgba(255, 255, 255, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.4);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
}

/* Grain texture overlay */
.grain-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    pointer-events: none;
    opacity: 0.03;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
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
