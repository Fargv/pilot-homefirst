import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Stable framework code — browser keeps it cached across deploys
          vendor: ["react", "react-dom", "react-router-dom"],
          query: ["@tanstack/react-query"],
          // Icons + animation helpers shared across pages
          ui: ["lucide-react", "animejs"],
          // TipTap is heavy and only used by the recipe editor (admin).
          // (@tiptap/pm exposes only subpath exports, so prosemirror code
          // is auto-chunked alongside whatever imports it.)
          editor: [
            "@tiptap/react",
            "@tiptap/starter-kit",
            "@tiptap/extension-color",
            "@tiptap/extension-image",
            "@tiptap/extension-link",
            "@tiptap/extension-placeholder",
            "@tiptap/extension-text-style",
            "@tiptap/extension-underline",
          ],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
