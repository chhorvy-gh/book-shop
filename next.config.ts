import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  sassOptions: {
    // Lets any .scss file do `@use "style/tokens"` from the project root.
    loadPaths: [path.join(process.cwd())],
  },
};

export default nextConfig;
