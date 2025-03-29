import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    build: {
        emptyOutDir: false,
        lib: {
            entry: resolve(__dirname, "/src/lib/index.ts"),
            name: "extension",
            fileName: () => `content.js`,
        },
        minify: false,
    },
    esbuild: {
        keepNames: true,
        minifyIdentifiers: false,
        minifySyntax: false,
    },
});
