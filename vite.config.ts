import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tanstackStart({
      // Keep the custom SSR error wrapper as the server entry.
      server: { entry: "server" },
    }),
    nitro(),
    react(),
    tailwindcss(),
    tsConfigPaths(),
  ],
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  server: {
    allowedHosts: [".ngrok-free.dev"],
  },
});
