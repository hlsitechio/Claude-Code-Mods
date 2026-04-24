# Skill: Design System

This app uses a consistent dark design language. Match it in all generated code blocks.

## Color palette

```
// Backgrounds
#0b0b0c   — page / body background (near-black)
#141416   — card / code block surface
#1a1a1d   — slightly elevated surface
#1e1e24   — border / divider
#27272c   — subtle border / scrollbar thumb

// Text
#e7e7ea   — primary text
#d4d4d8   — secondary text
#8a8a92   — muted / placeholder
#5a5a63   — very muted / label
#4a4a52   — disabled

// Accent
#d97757   — warm orange (Claude brand, primary CTA glow)
#7c3aed   — violet / purple (badge, feature highlight)
#a78bfa   — light violet (text on purple bg)
#7ab389   — sage green (success, live indicator)
#c96442   — error / warning red-orange

// Gradient presets
linear-gradient(130deg, #d97757 0%, #c084fc 55%, #818cf8 100%)  ← headline gradient
```

## Typography

```
font-family: ui-sans-serif, system-ui, -apple-system, sans-serif
font-family: ui-monospace, SFMono-Regular, monospace   ← code

// Scale
72px  font-weight:800  letter-spacing:-0.04em  ← hero headline (clamp to 42px min)
17px  font-weight:700                           ← section heading
15px  font-weight:500                           ← body / button
13px  font-weight:400                           ← small / meta
11px  font-weight:600  text-transform:uppercase ← label / tag
```

## Spacing & radius

```
Border radius: 8–12px for cards, 999px for pills/badges, 6px for buttons
Padding: 22–24px for sections, 14–16px for cards, 8–12px for buttons
Gap: 8–12px between inline items, 24–32px between sections
```

## Motion defaults (Framer Motion)

```jsx
// Entrance stagger pattern
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.11, delayChildren: 0.15 } } };
const fade    = { hidden: { opacity: 0, y: 32 }, show: { opacity: 1, y: 0,
  transition: { type: 'spring', stiffness: 240, damping: 24 } } };

// Hover button
whileHover={{ scale: 1.04 }}
whileTap={{ scale: 0.97 }}
```

## Component patterns

```jsx
// Badge / pill
<div style={{
  display: 'inline-flex', alignItems: 'center', gap: 8,
  background: 'rgba(124,58,237,.1)', border: '1px solid rgba(124,58,237,.22)',
  borderRadius: 999, padding: '5px 14px',
}}>

// Primary button
<motion.button
  whileHover={{ scale: 1.04, boxShadow: '0 8px 32px rgba(124,58,237,.5)' }}
  whileTap={{ scale: 0.97 }}
  style={{ background: '#7c3aed', color: '#fff', border: 'none',
           borderRadius: 10, padding: '13px 30px', fontSize: 15, fontWeight: 600 }}>

// Ghost button
<motion.button
  whileHover={{ scale: 1.03, color: '#e7e7ea', borderColor: '#4a4a52' }}
  style={{ background: 'transparent', color: '#8a8a92',
           border: '1px solid #2e2e34', borderRadius: 10, padding: '13px 28px' }}>

// Subtle grid overlay
<div style={{
  position: 'absolute', inset: 0, pointerEvents: 'none',
  backgroundImage:
    'linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px),' +
    'linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)',
  backgroundSize: '48px 48px',
  maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)',
}} />
```
