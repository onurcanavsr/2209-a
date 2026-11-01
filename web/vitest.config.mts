import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig'de jsx "preserve" (Next.js için); test dönüştürücüsüne otomatik JSX çalışma zamanını açıkça söyle
  esbuild: { jsx: "automatic" },
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: { include: ["lib/**/*.test.ts", "tests/**/*.test.tsx"] },
} as Parameters<typeof defineConfig>[0]);
