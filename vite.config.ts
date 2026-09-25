import { defineConfig, mergeConfig, type Plugin } from 'vite';
import { sharedViteConfig } from './scripts/vite-shared.ts';

// In development one server hosts everything from the repo root, so the Hall
// lives at /hall/ and each game at /ports/<slug>/. Send the bare root there.
function openTheHall(): Plugin {
  return {
    name: 'neoarcade:open-the-hall',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url === '/' || request.url === '/index.html') {
          response.statusCode = 302;
          response.setHeader('Location', '/hall/');
          response.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(
  mergeConfig(sharedViteConfig, {
    plugins: [openTheHall()],
    server: {
      watch: { ignored: ['**/sources/**', '**/dist/**'] },
    },
    optimizeDeps: {
      entries: ['hall/index.html', 'ports/*/index.html'],
    },
    preview: {
      port: 4173,
    },
  }),
);
