import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  server: {
    port: 5182,
    open: true,
    watch: {
      // Watch all source files for full-reload on change
      include: ['**/*.html', '**/*.css', '**/*.js'],
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
    },
  },
})
