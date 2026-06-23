import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'prisma/**/*.test.ts', '*.test.ts', '*.test.tsx'],
    // Fix 12: deterministically resolve image-asset imports to a tiny stub so component
    // tests never depend on the asset loader handling .png/.jpg/.svg.
    alias: [
      {
        find: /\.(png|jpe?g|svg)$/,
        replacement: new URL('./test/asset-stub.ts', import.meta.url).pathname,
      },
    ],
  },
});
