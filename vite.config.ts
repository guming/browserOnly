import path from 'path';
// import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { defineConfig } from 'vite';
import sourcemaps from 'rollup-plugin-sourcemaps';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['playwright-crx']
  },
  build: {
    // playwright-crx cannot be obfuscated
    minify: false,
    sourcemap: true,
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // @ts-ignore
      plugins: [sourcemaps()],
      input: {
        'background': path.resolve(__dirname, 'src/background.ts'),
        'sidepanel': path.resolve(__dirname, 'src/sidepanel/index.tsx'),
        'options': path.resolve(__dirname, 'src/options/index.tsx'),
      },
      output: {
        entryFileNames: '[name].js',
        assetFileNames: (assetInfo) => {
          // Use a fixed name for CSS files
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'assets/styles.css';
          }
          // Use the default naming pattern for other assets
          return 'assets/[name].[hash].[ext]';
        },
      },
    },
  },
});
