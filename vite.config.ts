import {resolve} from 'node:path';
import {defineConfig} from 'vite';
import {viteStaticCopy} from 'vite-plugin-static-copy';
import react from '@vitejs/plugin-react';

/*
      See https://vitejs.dev/config/
*/

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: '../manifest.json',
          dest: '.'
        },
        {
          src: '*.*',
          dest: '.'
        },
        {
          src: '../public/*.*',
          dest: '.'
        }
      ]
    }),
    viteStaticCopy({
      targets: [
        // Widget icons and configurations
        {
          src: 'widgets/**/*.{svg,png,jpg,json}',
          dest: '.'
        }
      ],
      structured: true
    })
  ],
  root: './src',
  base: '',
  publicDir: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    copyPublicDir: false,
    target: ['es2022'],
    assetsDir: 'widgets/assets',
    rollupOptions: {
      input: {
        // List every widget entry point here
        releaseManagerPage: resolve(__dirname, 'src/widgets/release-manager-page/index.html'),

      },
      output: {
        manualChunks(id): string | undefined {
          if (!id.includes('node_modules')) {
            return undefined;
          }

          const rules: Array<{name: string; match: string[]}> = [
            {name: 'react-vendor', match: ['/react/', '/react-dom/']},
            {name: 'ring-ui', match: ['/@jetbrains/ring-ui-built/']},
            {name: 'react-virtualized', match: ['/react-virtualized/']},
            {name: 'markdown', match: ['/marked/', '/dompurify/']}
          ];

          for (const rule of rules) {
            if (rule.match.some((substring) => id.includes(substring))) {
              return rule.name;
            }
          }

          return 'vendor';
        }
      }
    }
  }
});
