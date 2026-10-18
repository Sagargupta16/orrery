import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// GitHub Pages serves the repository at /orrery under the owner's custom domain.
export default defineConfig({
  site: "https://sagargupta.online",
  base: "/orrery",
  trailingSlash: "ignore",
  vite: { plugins: [tailwindcss()] },
});
