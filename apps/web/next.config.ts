import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const appDir = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  transpilePackages: ["@auto-tm/ui"],

  output: "standalone",
  outputFileTracingRoot: join(appDir, "../../"),
};

export default nextConfig;
