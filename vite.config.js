import { defineConfig } from 'vite'
import path from 'path'
import fs   from 'fs'

// Vite plugin: copy classic (non-module) scripts to dist/ after every build.
// Vite intentionally skips bundling <script src> without type="module",
// so we copy them verbatim so they're available at file:// in Electron.
// Each entry can be:
//   'relative/path.js'              → copied to dist/path.js
//   { src: 'some/path.js', dst: 'name.js' } → copied to dist/name.js
function copyClassicScripts(files) {
  return {
    name: 'copy-classic-scripts',
    apply: 'build',
    closeBundle() {
      for (const entry of files) {
        const src = path.resolve(typeof entry === 'string' ? entry : entry.src);
        const dstName = typeof entry === 'string' ? path.basename(entry) : entry.dst;
        const dst = path.resolve('dist', dstName);
        fs.copyFileSync(src, dst);
        console.log(`[copy-classic-scripts] ${src} → dist/${dstName}`);
      }
    },
  };
}

export default defineConfig({
  root: '.',
  // base: './' is REQUIRED so all asset paths in dist/index.html are relative —
  // Electron loads via file:// and absolute /assets/... paths break.
  base: './',
  plugins: [
    copyClassicScripts(['icons.js', 'workspace.js', 'app.js']),
    // tailwind.css is a Vite-processed stylesheet (not a classic script) —
    // Vite handles it automatically via the <link> in index.html.
  ],
  server: {
    port: 5182,
    watch: {
      include: ['**/*.html', '**/*.css', '**/*.js'],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'index.html',
    },
  },
})
