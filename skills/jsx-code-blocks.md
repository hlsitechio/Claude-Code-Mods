# Skill: JSX Code Blocks

When generating `jsx` / `tsx` / `react` code blocks in this app, follow these rules exactly.

## Viewport dimensions

| Context | Width | Height |
|---------|-------|--------|
| Inline preview (eye icon) | ~700 px | ~420 px |
| Aperçu panel (right panel) | 1280 px | 900 px (scaled down to fit) |

Design for **700 px wide** by default. The Aperçu panel scales the 1280 px viewport down proportionally, so it will look correct there too. Never hard-code `100vw`/`100vh` expecting a large screen — the inline preview is narrow.

## Available globals — NO import statements needed

All of the following are pre-imported and available as top-level names:

```
// React
React, useState, useEffect, useRef, useCallback, useMemo,
useContext, createContext, useReducer, useLayoutEffect,
useImperativeHandle, forwardRef, Fragment, memo, lazy, Suspense

// React DOM
createRoot   ← available but prefer mountApp() below

// Framer Motion
motion, AnimatePresence, LayoutGroup, Reorder,
useAnimation, useMotionValue, useTransform, useSpring,
useScroll, useVelocity, useInView, useDragControls,
useMotionTemplate, useMotionValueEvent, LazyMotion, domAnimation,
animate, stagger, m

// Helpers
mountApp(element)          ← mounts to #root (preferred over createRoot)
render(element, container) ← React 17-style shim
ReactDOM                   ← { render, createRoot, unmountComponentAtNode }
```

## Mounting rules

**NEVER** call `createRoot(document.getElementById('root'))` manually — the system auto-mounts the last detected component. If you need explicit control, use `mountApp(<App />)` once at the end.

✅ Correct:
```jsx
function Hero() { return <div>...</div>; }
// system auto-mounts Hero — nothing else needed
```

✅ Also correct (explicit):
```jsx
function App() { return <div>...</div>; }
mountApp(<App />);
```

❌ Never do this (causes React #299 double-mount):
```jsx
function App() { ... }
createRoot(document.getElementById('root')).render(<App />);
```

## CSS / style object rules

**Always wrap CSS values in strings.** Dynamic values need template literals (backticks).

✅ Correct:
```jsx
style={{
  background: `radial-gradient(circle, ${color}88 0%, transparent 70%)`,
  width: `${size}px`,
  transform: `translate(-50%, -50%)`,
}}
```

❌ Wrong (Babel parse error):
```jsx
style={{
  background: radial-gradient(circle, ${color}88 0%, transparent 70%),
  width: ${size}px,
}}
```

Rule: if a CSS property value contains ANY expression `${}` or any non-number characters (spaces, parens, commas, %), it MUST be in a string.
