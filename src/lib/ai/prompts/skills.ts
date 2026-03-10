// Animation & UI Library Skills + Image Rules — shared knowledge for all agents
// Full reference for code-writing agents, brief version for planners/proposers

export const ANIMATION_SKILLS = `## AVAILABLE ANIMATION & UI LIBRARIES
Choose the best library for the task. Add to package.json dependencies if not already present, then run npm install.

### Lenis (Smooth Scroll)
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

### Motion (Framer Motion v12+)
\`npm: motion\`
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

### React Spring
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

### Anime.js
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

### GSAP + ScrollTrigger
\`npm: gsap\` (already in starter template)
\`\`\`tsx
"use client";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
// Register once: if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);
// In useEffect with useGSAP or manual cleanup:
gsap.from(".fade-up", { scrollTrigger: { trigger: ".fade-up", start: "top 80%" }, y: 40, opacity: 0, stagger: 0.15 });
\`\`\`
Best for: scroll-triggered animations, complex timelines, performant animations, counter animations.

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
- Always add \`"use client"\` to components using animation hooks or refs
- Guard SSR-incompatible code: \`if (typeof window !== "undefined") { ... }\`
- Clean up animations in useEffect return: \`return () => { lenis.destroy(); tl.kill(); }\`
- Prefer CSS transitions for simple hover/focus states (more performant)
- Use \`will-change: transform\` sparingly on animated elements
- When user doesn't specify a library, choose based on the task:
  - Simple component animations → Motion (lightest API)
  - Scroll-triggered reveals → GSAP ScrollTrigger
  - Smooth page scroll → Lenis
  - Physics/spring feel → React Spring
  - Complex timelines → GSAP or Anime.js`;

export const ANIMATION_SKILLS_BRIEF = `## AVAILABLE ANIMATION & UI LIBRARIES
When planning tasks involving animation or interactive UI, these libraries are available:
- **GSAP + ScrollTrigger** (pre-installed) — scroll animations, timelines, counters, stagger
- **Motion / Framer Motion** (npm: motion) — component animations, page transitions, gestures, layout animations
- **Lenis** (npm: lenis) — smooth scroll, scroll-linked effects, parallax
- **React Spring** (npm: @react-spring/web) — physics-based spring animations, list transitions
- **Anime.js** (npm: animejs) — timeline sequences, SVG morphing, stagger animations
- **UI-Layout / Cult-UI patterns** — copy-paste patterns for marquee, magnetic buttons, dock, animated tabs, text reveal

Choose the right library for each task. Add npm packages to package.json when needed.
All animation components need "use client" and typeof window guards for SSR.`;

export const IMAGE_RULES = `## IMAGE RULES (CRITICAL — all images must actually load)

**Use plain \`<img>\` tags for ALL external images.** Do NOT use next/image \`<Image>\` for picsum/pravatar/randomuser URLs — it breaks due to redirects.
NEVER use unsplash.com URLs — they require exact photo IDs and will break.

### Primary: picsum.photos (always works, no API key needed)
- General: \`https://picsum.photos/seed/{keyword}/{width}/{height}\`
- Hero/banner: \`https://picsum.photos/seed/hero-{topic}/1920/1080\`
- Cards/thumbnails: \`https://picsum.photos/seed/{product-name}/800/600\`
- Square: \`https://picsum.photos/seed/{keyword}/600/600\`

The {keyword} seed makes the URL return a consistent image every time.
Use descriptive seeds: "pet-bed", "running-shoes", "coffee-shop", "modern-office".
Each unique seed gives a different image, so vary the seed per image.

### Avatars & People
- Avatars: \`https://i.pravatar.cc/150?img={1-70}\`
- Team photos: \`https://randomuser.me/api/portraits/men/{n}.jpg\` or \`/women/{n}.jpg\` (n = 1-99)

### Rules
1. NEVER use images.unsplash.com or source.unsplash.com — these WILL break
2. ALWAYS use \`https://picsum.photos/seed/{keyword}/{w}/{h}\` — the /seed/ prefix is REQUIRED
3. ALWAYS use plain \`<img>\` tags with alt, width, and height attributes — NOT next/image \`<Image>\`
4. Vary the seed keyword for each image so they look different
5. For product images, use the product name as seed: \`/seed/memory-foam-bed/800/600\``;
