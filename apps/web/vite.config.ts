import { defineConfig } from 'vite';

const webPort = Number(process.env.PLOT_WEB_PORT ?? 2311);
const apiPort = Number(process.env.PLOT_API_PORT ?? 403);

export default defineConfig({
  server: {
    port: webPort,
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${apiPort}` },
  },
});
