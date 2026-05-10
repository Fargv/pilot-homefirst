import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const TIPTAP_PKGS = [
  "@tiptap/react", "@tiptap/pm", "@tiptap/starter-kit",
  "@tiptap/extension-underline", "@tiptap/extension-link",
  "@tiptap/extension-image", "@tiptap/extension-placeholder",
  "@tiptap/extension-text-style", "@tiptap/extension-color"
];

function tiptapAliases() {
  return Object.fromEntries(
    TIPTAP_PKGS.map(pkg => {
      try {
        return [pkg, path.dirname(require.resolve(`${pkg}/package.json`))];
      } catch {
        return [pkg, path.resolve(__dirname, `../node_modules/${pkg}`)];
      }
    })
  );
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: tiptapAliases()
  }
});
