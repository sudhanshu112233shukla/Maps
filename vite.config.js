import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: { main: './index.html' },
      output: {
        manualChunks(id) {
          if (id.includes('@xenova/transformers') || id.includes('onnxruntime')) {
            return 'ai-runtime';
          }
          if (id.includes('maplibre-gl') || id.includes('pmtiles')) {
            return 'map-runtime';
          }
          if (id.includes('node_modules')) {
            return 'vendor';
          }
          return undefined;
        }
      }
    }
  },
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  optimizeDeps: {
    exclude: ['@xenova/transformers']
  },
  worker: { format: 'es' }
});
