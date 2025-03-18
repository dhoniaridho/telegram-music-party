import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    build: {
        rollupOptions: {
            input: {
                content: resolve(__dirname, "/src/lib/index.ts"),
                main: resolve(__dirname, "/index.html"),
            },
            output: {
                entryFileNames: "[name].js", // Custom naming pattern
                inlineDynamicImports: false,
            },
        },
    },
});
