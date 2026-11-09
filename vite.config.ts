import { defineConfig } from 'vite';

// JAR_DIR lets the dev server expose a local folder of games, e.g. /?jar=/@fs/<JAR_DIR>/<name>.jar
const jarDir = process.env.JAR_DIR;

export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  server: {
    fs: { allow: ['.', ...(jarDir ? [jarDir] : [])] },
  },
});
