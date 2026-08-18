import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The repo root has its own package-lock.json (the CLI/webhook package),
  // which otherwise confuses Turbopack's automatic workspace-root detection.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
