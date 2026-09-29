import path from "node:path";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: { port: 8081 },
  build: {
    rollupOptions: {
      output: {
        // グラフ（recharts）とSupabaseは更新が少ないので分けてキャッシュを効かせる
        manualChunks: { charts: ["recharts"], supabase: ["@supabase/supabase-js"], react: ["react", "react-dom", "react-router-dom"] },
      },
    },
  },
});
