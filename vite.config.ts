import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const modalLorasTarget =
  process.env.VITE_MODAL_LORAS_TARGET ??
  'https://marcf--acestep-acestepinference-api-list-loras.modal.run';
const modalGenerateTarget =
  process.env.VITE_MODAL_GENERATE_TARGET ??
  'https://marcf--acestep-acestepinference-api-generate.modal.run';
const aceStepApiTarget =
  process.env.VITE_ACESTEP_API_TARGET ??
  'http://host.docker.internal:3000/api/acestep';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: {
      '/api/modal/loras': {
        target: modalLorasTarget,
        changeOrigin: true,
        rewrite: () => '/',
        secure: true,
      },
      '/api/modal': {
        target: modalGenerateTarget,
        changeOrigin: true,
        rewrite: () => '/',
        secure: true,
      },
      '/api': {
        target: aceStepApiTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
