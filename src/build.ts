#!/usr/bin/env node

/**
 * This module provides a build script for an application using esbuild. It
 * supports three modes of operation:
 *
 * - `build`: Bundles the application for production.
 * - `serve`: Serves the application with live reload for development.
 * - `profile`: Serves the application with Istanbul code coverage
 *   instrumentation.
 *
 * The script handles environment variable loading, static asset copying, and
 * output directory management. It uses esbuild plugins for asset copying and
 * code coverage instrumentation, and supports live reload during development.
 *
 * Usage: node build.ts [<mode>]
 *
 * Where `<mode>` is one of: "build", "serve", or "profile".
 */
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Argument, InvalidOptionArgumentError, program } from "commander";
import { type BuildContext, type BuildOptions, build, context } from "esbuild";
import { type CopyPair, copyAllAssets } from "./copyfiles";
import { IstanbulPlugin } from "./instrument";
import { loadEnv } from "./loadenv";
import { serve } from "./serve";

// Valid modes for the build process
//   build: Build the application
//   serve: Serve the application with live reload
//   profile: Serve the application with Istanbul code coverage
const validModes = ["build", "serve", "profile"] as const;
type BuildMode = (typeof validModes)[number];

type OptionsType = {
  mode: BuildMode; // Mode of operation
  port: number; // Port for serving the application
  dist: string; // Output directory for the build
  entry: string; // Entry file for the application
  output: string; // Output file (relative to output directory)
  test?: boolean; // Whether to run in test mode (loads test environment)
  copy?: Array<CopyPair>; // Array of copy pairs for static assets
};

const defaultOptions: OptionsType = {
  mode: "build", // Default mode
  port: 1234, // Default port for serving
  dist: "dist", // Default output directory
  entry: "src/main.ts", // Default entry file
  output: "main.js", // Default output file
};

const copyRegex = /^[^:]+:[^:]*$/;

export function resolvePairs(
  copyPairs: Array<CopyPair>,
  cwd: string,
  dist: string,
): Array<CopyPair> {
  return copyPairs.map((pair: CopyPair): CopyPair => {
    if (pair.from === "")
      throw new Error('Each copy entry must have a "from" property.');
    const srcDir: string = resolve(cwd, pair.from);
    const destDir: string = resolve(dist, pair.to);
    return { from: srcDir, to: destDir };
  });
}

async function builder(options: OptionsType): Promise<void> {
  // Remove the dist directory
  if (existsSync(options.dist)) {
    await rm(options.dist, { recursive: true, force: true });
  }

  // Create the dist directory
  await mkdir(options.dist, { recursive: true });

  // Setup environment variables
  if (options.test) {
    // Load test environment variables.
    loadEnv(true);
  } else {
    loadEnv();
  }

  const define: Record<string, string> = {
    "process.env.DATABASE_HOST": `"${process.env.DATABASE_HOST}"`,
    "process.env.DATABASE_PATH": `"${process.env.DATABASE_PATH}"`,
    "process.env.AUTH_PATH": `"${process.env.AUTH_PATH}"`,
    "process.env.REQUEST_TIMEOUT": `"${process.env.REQUEST_TIMEOUT}"`,
  };

  // Also add all environment variables that start with COMP318_
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("COMP318_")) {
      define[`process.env.${key}`] = `"${value}"`;
    }
  }

  // Base esbuild configuration
  const baseConfig: BuildOptions = {
    entryPoints: [options.entry],
    bundle: true,
    sourcemap: "inline",
    outfile: join(options.dist, options.output),
    define,
  };

  const cwd = process.cwd();
  const dist = resolve(cwd, options.dist);
  const resolvedCopyPairs = resolvePairs(options.copy || [], cwd, dist);

  switch (options.mode) {
    case "build": {
      await copyAllAssets(resolvedCopyPairs);
      await build({
        ...baseConfig,
      });
      console.log("Build complete");
      break;
    }
    case "serve": {
      // Need live reload, use dev server.
      const ctx: BuildContext = await context({
        ...baseConfig,
      });
      serve(dist, options.port, ctx, resolvedCopyPairs);
      break;
    }
    case "profile": {
      // Need to remove previous profiling information
      const nycDir = resolve(process.cwd(), ".nyc_output");
      if (existsSync(nycDir)) {
        await rm(nycDir, { recursive: true, force: true });
      }
      const covDir = resolve(process.cwd(), "coverage");
      if (existsSync(covDir)) {
        await rm(covDir, { recursive: true, force: true });
      }

      // Don't need live reload, just use esbuild's server.
      await copyAllAssets(resolvedCopyPairs);
      const ctx: BuildContext = await context({
        ...baseConfig,
        plugins: [IstanbulPlugin],
      });
      await ctx.serve({ servedir: dist, port: options.port });
      console.log(`Serving profiled app on http://localhost:${options.port}`);
      break;
    }
  }
}

async function run(): Promise<void> {
  program
    .name("build318")
    .description("Build script for COMP 318")
    .addArgument(
      new Argument("[mode]", "Build mode")
        .choices(validModes)
        .default(defaultOptions.mode),
    )
    .option(
      "-p, --port <number>",
      "Port for serving the application",
      (value) => {
        const port = Number.parseInt(value);
        if (Number.isNaN(port) || port <= 0 || port > 65535) {
          throw new InvalidOptionArgumentError(
            `Invalid port number: "${value}". Port must be a number between 1 and 65535.`,
          );
        }
        return port;
      },
      defaultOptions.port,
    )
    .option("-d, --dist <path>", "Output directory", defaultOptions.dist)
    .option("-e, --entry <path>", "Entry file", defaultOptions.entry)
    .option(
      "-o, --output <file>",
      "Output file (relative to output directory)",
      "main.js",
    )
    .option(
      "-c, --copy <from:to>",
      "Copy pairs in the format 'from:to'",
      (value: string, previous: Array<CopyPair>) => {
        if (!copyRegex.test(value)) {
          throw new InvalidOptionArgumentError(
            `Invalid copy pair format: "${value}". Expected format is "from:to".`,
          );
        }

        let copyPairs = previous ?? [];
        if (copyPairs === defaultOptions.copy) {
          copyPairs = [];
        }

        const [from, to] = value.split(":");
        copyPairs.push({ from, to });
        return copyPairs;
      },
      defaultOptions.copy || [],
    )
    .option("-t, --testing", "Run in test mode (loads test environment)", false)
    .action((mode: BuildMode, opts) => {
      opts.mode = mode;
      const options = Object.assign({}, defaultOptions, opts);

      builder(options);
    });

  program.parse(process.argv);
}

run().catch((error) => {
  console.error("Build failed:", error);
  process.exit(1);
});
