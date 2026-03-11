// Animation & UI Library Skills + Image Rules — shared knowledge for all agents
// Full reference for code-writing agents, brief version for planners/proposers

export const ANIMATION_SKILLS = `## AVAILABLE ANIMATION & UI LIBRARIES
PREFER pre-installed packages (marked ✅) to avoid missing dependency errors.
Libraries marked ⚠️ are NOT pre-installed — you MUST add them to package.json dependencies BEFORE importing.

### ✅ Lenis (Smooth Scroll) — PRE-INSTALLED
\`npm: lenis\`
\`\`\`tsx
"use client";
import { ReactLenis, useLenis } from "lenis/react";
// Wrap app or section:
<ReactLenis root options={{ lerp: 0.1, duration: 1.2, smoothWheel: true }}>
  {children}
</ReactLenis>
// Hook for scroll-linked effects:
useLenis((lenis) => { /* lenis.scroll, lenis.progress, lenis.velocity */ });
\`\`\`
Best for: smooth page scroll, parallax, scroll-linked animations. Requires "use client".
WRONG imports (cause webpack "Cannot read properties of undefined" crash):
- \`import { ReactLenis } from "lenis"\` → must use "lenis/react" subpath
- \`import ReactLenis from "lenis/react"\` → ReactLenis is a NAMED export, not default

### ✅ Motion (Framer Motion v12+) — PRE-INSTALLED
\`npm: motion\` (import from "motion/react", NOT "framer-motion")
\`\`\`tsx
"use client";
import { motion, AnimatePresence, useScroll, useTransform } from "motion/react";
// Animate on mount:
<motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
// Scroll-linked:
const { scrollYProgress } = useScroll();
const opacity = useTransform(scrollYProgress, [0, 1], [1, 0]);
// Exit animations:
<AnimatePresence mode="wait"><motion.div key={id} exit={{ opacity: 0 }} /></AnimatePresence>
// Layout animations:
<motion.div layout layoutId="shared-element" />
\`\`\`
Best for: component animations, page transitions, gestures, layout animations, scroll-linked effects.
WRONG imports (cause webpack "Cannot read properties of undefined" crash):
- \`import { motion } from "motion"\` → MUST use "motion/react" subpath
- \`import { motion } from "framer-motion"\` → framer-motion is NOT installed, use "motion/react"
- \`import motion from "motion/react"\` → motion is a NAMED export, not default

### ⚠️ React Spring — NOT PRE-INSTALLED (must add to package.json first)
\`npm: @react-spring/web\`
\`\`\`tsx
"use client";
import { useSpring, animated, useTransition, useTrail } from "@react-spring/web";
// Spring animation:
const styles = useSpring({ from: { opacity: 0 }, to: { opacity: 1 }, config: { tension: 200, friction: 20 } });
<animated.div style={styles}>Content</animated.div>
// List transitions:
const transitions = useTransition(items, { from: { opacity: 0 }, enter: { opacity: 1 }, leave: { opacity: 0 } });
// Trail (staggered):
const trail = useTrail(items.length, { from: { opacity: 0, y: 20 }, to: { opacity: 1, y: 0 } });
\`\`\`
Best for: physics-based animations, natural motion, spring dynamics, list transitions.

### ⚠️ Anime.js — NOT PRE-INSTALLED (must add to package.json first)
\`npm: animejs\` + \`@types/animejs\` (devDep)
\`\`\`tsx
"use client";
import anime from "animejs";
// In useEffect:
useEffect(() => {
  anime({ targets: ".stagger-item", translateY: [40, 0], opacity: [0, 1], delay: anime.stagger(100), easing: "easeOutQuart", duration: 800 });
  // Timeline:
  const tl = anime.timeline({ easing: "easeOutExpo" });
  tl.add({ targets: ".hero-title", opacity: [0, 1], translateY: [30, 0], duration: 1000 })
    .add({ targets: ".hero-subtitle", opacity: [0, 1], duration: 800 }, "-=600");
}, []);
\`\`\`
Best for: timeline sequences, stagger animations, SVG morphing, text reveals. Guard with typeof window.

### ✅ GSAP + ScrollTrigger — PRE-INSTALLED
\`npm: gsap\`
\`\`\`tsx
"use client";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
// ALL GSAP code MUST be inside useEffect:
useEffect(() => {
  gsap.registerPlugin(ScrollTrigger);
  gsap.from(".fade-up", { scrollTrigger: { trigger: ".fade-up", start: "top 80%" }, y: 40, opacity: 0, stagger: 0.15 });
  return () => { ScrollTrigger.getAll().forEach(t => t.kill()); };
}, []);
\`\`\`
Best for: scroll-triggered animations, complex timelines, performant animations, counter animations.
WRONG imports (cause webpack "Cannot read properties of undefined" crash):
- \`import { gsap } from "gsap"\` → gsap is a DEFAULT export, use \`import gsap from "gsap"\`
- \`import ScrollTrigger from "gsap/ScrollTrigger"\` → ScrollTrigger is a NAMED export, use \`import { ScrollTrigger } from "gsap/ScrollTrigger"\`

### UI-Layout / Cult-UI (Pre-built Animated Components)
These are NOT npm packages — they are copy-paste component patterns. When the user asks for these effects, implement them directly:
- **Marquee/Infinite scroll**: CSS animation with duplicated content, translateX keyframe
- **Magnetic buttons**: Track mouse position relative to button, apply transform
- **Dock (macOS style)**: Scale icons based on mouse proximity using motion or spring
- **Animated tabs**: Use motion layoutId for sliding indicator
- **Text reveal**: Split text into spans, stagger opacity/y with GSAP, motion, or anime.js
- **Parallax sections**: Use Lenis scroll progress or GSAP ScrollTrigger to drive transforms
- **Gradient mesh backgrounds**: Multiple radial-gradient layers with CSS animation
- **Spotlight/cursor glow**: Track mousemove, position radial gradient at cursor

## ANIMATION BEST PRACTICES
- ALWAYS add \`"use client"\` as the FIRST LINE of any component using animation hooks, refs, or event handlers
- Put ALL animation library code (gsap, lenis, anime) inside useEffect — NEVER in component body
- For GSAP registerPlugin: \`useEffect(() => { gsap.registerPlugin(ScrollTrigger); ... }, []);\`
- Clean up animations in useEffect return: \`return () => { lenis.destroy(); tl.kill(); }\`
- Prefer CSS transitions for simple hover/focus states (more performant)
- Use \`will-change: transform\` sparingly on animated elements
- PREFER pre-installed libraries (gsap, motion, lenis) — they work without package.json changes
- When user doesn't specify a library, choose based on the task:
  - Simple component animations → ✅ Motion (lightest API, pre-installed)
  - Scroll-triggered reveals → ✅ GSAP ScrollTrigger (pre-installed)
  - Smooth page scroll → ✅ Lenis (pre-installed)
  - Physics/spring feel → ⚠️ React Spring (needs package.json update)
  - Complex timelines → ✅ GSAP (pre-installed)`;

export const ANIMATION_SKILLS_BRIEF = `## AVAILABLE ANIMATION & UI LIBRARIES
PREFER pre-installed packages to avoid missing dependency errors.

### Pre-installed (✅ no package.json changes needed):
- **GSAP + ScrollTrigger** (gsap) — scroll animations, timelines, counters, stagger
- **Motion** (motion, import from "motion/react") — component animations, page transitions, gestures, layout animations
- **Lenis** (lenis) — smooth scroll, scroll-linked effects, parallax
- **Lucide React** (lucide-react) — icons

### Requires package.json update (⚠️):
- **React Spring** (@react-spring/web) — physics-based spring animations
- **Anime.js** (animejs) — timeline sequences, SVG morphing

### Copy-paste patterns (no package needed):
- Marquee, magnetic buttons, dock, animated tabs, text reveal, parallax, gradient mesh, spotlight

CRITICAL RULES:
- If a task uses ⚠️ libraries, include an early task to update package.json
- ALL animation components MUST have "use client" as line 1
- ALL animation code MUST be inside useEffect — never in component body
- Use \`motion\` not \`framer-motion\` — motion is the installed package`;

export const IMPORT_REFERENCE = `## IMPORT REFERENCE (CRITICAL — use EXACTLY these patterns)
Wrong import paths cause "Cannot read properties of undefined (reading 'call')" webpack crashes at runtime.

### gsap
\`\`\`tsx
import gsap from "gsap";                              // DEFAULT import — NOT { gsap }
import { ScrollTrigger } from "gsap/ScrollTrigger";   // NAMED import from subpath
import { Flip } from "gsap/Flip";
import { TextPlugin } from "gsap/TextPlugin";
\`\`\`

### motion (Framer Motion v12+)
\`\`\`tsx
import { motion, AnimatePresence, useScroll, useTransform, useMotionValue, useSpring } from "motion/react";
\`\`\`
MUST use "motion/react" subpath. NEVER import from "motion" or "framer-motion".
motion is a NAMED export — never use default import.

### lenis (Smooth Scroll)
\`\`\`tsx
import { ReactLenis, useLenis } from "lenis/react";   // React bindings — NAMED exports
import Lenis from "lenis";                             // Core class — DEFAULT export (rarely needed)
\`\`\`

### lucide-react (Icons)
\`\`\`tsx
import { ArrowRight, Menu, X, Check, Star } from "lucide-react";  // NAMED exports only
\`\`\`

### next
\`\`\`tsx
import Link from "next/link";                                      // DEFAULT import
import { useRouter, usePathname } from "next/navigation";          // NAMED — use "next/navigation" NOT "next/router"
import { Inter, Space_Grotesk } from "next/font/google";           // NAMED
\`\`\`
`;

import { UNSPLASH_IMAGE_BANK } from './unsplash-images';

export const IMAGE_RULES = `## IMAGE RULES (CRITICAL — all images must actually load)

**Use plain \`<img>\` tags for ALL external images.** Do NOT use next/image \`<Image>\` — it breaks with external URLs in WebContainer.

### Primary: Unsplash (real photos, no API key needed)
Format: \`https://images.unsplash.com/photo-{ID}?w={width}&h={height}&fit=crop\`
- Hero/banner: \`?w=1920&h=1080&fit=crop\`
- Cards/thumbnails: \`?w=800&h=600&fit=crop\`
- Square: \`?w=600&h=600&fit=crop\`

Pick photo IDs from the CURATED UNSPLASH IMAGE BANK below. Match the category to your content.
NEVER invent photo IDs — only use IDs from the bank. Each ID is a verified real photo.
NEVER use \`source.unsplash.com\` — it is DEAD (returns 503).

### Avatars & People
- Avatars: \`https://i.pravatar.cc/150?img={1-70}\`
- Team photos: \`https://randomuser.me/api/portraits/men/{n}.jpg\` or \`/women/{n}.jpg\` (n = 1-99)

### Rules
1. ONLY use photo IDs listed in the CURATED IMAGE BANK below. Copy-paste the exact ID. NEVER guess or invent an ID — invented IDs return 404 and show blank images.
2. NEVER use source.unsplash.com (dead) or picsum.photos (unreliable in WebContainer)
3. ALWAYS use plain \`<img>\` tags with alt, width, height — NOT next/image \`<Image>\`
4. Vary the photo ID across images so they look different
5. Match the photo category to the content (furniture IDs for furniture sites, etc.)
6. ALWAYS add an onerror fallback so broken images show a placeholder instead of blank space (use inline SVG data URI — external placeholder services like placehold.co are blocked by COEP):
   \`<img src="https://images.unsplash.com/photo-{ID}?w=800&h=600&fit=crop" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='600'%3E%3Crect fill='%231a1a2e' width='800' height='600'/%3E%3Ctext x='50%25' y='50%25' fill='%23ffffff' font-size='24' text-anchor='middle' dy='.3em'%3EImage%3C/text%3E%3C/svg%3E"; }} alt="..." />\`

${UNSPLASH_IMAGE_BANK}`;
