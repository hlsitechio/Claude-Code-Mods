import { defineConfig } from 'vite'
import path from 'path'
import fs   from 'fs'

// Vite plugin: copy classic (non-module) scripts to dist/ after every build.
// Vite intentionally skips bundling <script src> without type="module",
// so we copy them verbatim so they're available at file:// in Electron.
function copyClassicScripts(files) {
  return {
    name: 'copy-classic-scripts',
    apply: 'build',
    closeBundle() {
      for (const file of files) {
        const src = path.resolve(file);
        const dst = path.resolve('dist', path.basename(file));
        fs.copyFileSync(src, dst);
        console.log(`[copy-classic-scripts] ${file} → dist/${path.basename(file)}`);
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
    copyClassicScripts(['icons.js', 'app.js']),
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
