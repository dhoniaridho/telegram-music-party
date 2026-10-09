import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://localhost:3000" },
  },
  build: {
    target: "esnext",
    cssMinify: "lightningcss",
    outDir: resolve(__dirname, "../backend/dist/public"),
    emptyOutDir: false,
  },
});
