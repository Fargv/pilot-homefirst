import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: './src/kitchen/ds-entry.jsx',
      name: 'LunchfyKitchen',
      formats: ['es'],
      fileName: 'lunchfy-kitchen',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react-router-dom', 'animejs', 'lucide-react'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react-router-dom': 'ReactRouterDOM',
        },
      },
    },
    outDir: 'dist-lib',
    cssCodeSplit: false,
  },
});
