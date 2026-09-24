import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// The generated Prisma client lives in the workspace db package, next to its
// 21 MB query engine. It must stay outside the server bundle.
const prismaClientDir = path.join(repoRoot, "packages", "db", "src", "generated", "prisma");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The prototype has no ESLint config; typecheck is the gate.
  eslint: { ignoreDuringBuilds: true },
  // Workspace packages ship raw TypeScript sources.
  transpilePackages: [
    "@sharedplay/types",
    "@sharedplay/games",
    "@sharedplay/sharedplay",
    "@sharedplay/db",
  ],
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  // Keep the build tracer inside the repository: left at the default (the app
  // folder) it follows Prisma's runtime engine search out of the repo and onto
  // the user profile, where it hits protected AppData paths and dies with EACCES.
  outputFileTracingRoot: repoRoot,
  outputFileTracingExcludes: {
    "*": ["**/AppData/**", "**/WindowsApps/**"],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Require the generated Prisma client from disk instead of bundling it.
      // Two reasons: the tracer stops walking Prisma's home-folder engine search
      // (EACCES on Windows), and Prisma resolves its engine next to the generated
      // client, which is where the engine actually sits.
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)),
        ({ request }, callback) => {
          if (request && /(^|[\\/])generated[\\/]prisma$/.test(request)) {
            return callback(null, `commonjs ${prismaClientDir.replace(/\\/g, "/")}`);
          }
          return callback();
        },
      ];
    }
    return config;
  },
};

export default nextConfig;
