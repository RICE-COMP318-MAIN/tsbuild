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
import { mkdir, readFile, rm } from "node:fs/promises";
import {
  type BuildContext,
  type BuildOptions,
  type Plugin,
  build,
  context,
} from "esbuild";
import { resolve } from "node:path";
import { AssetCopierPlugin } from "./copyfiles";
import { IstanbulPlugin } from "./instrument";
import { loadEnv } from "./loadenv";
import Ajv from "ajv";

// Directory to store the build output
const distDir = "dist";

// Configuration file name
const configFile = "tsbuild.json";

// Type definition for the configuration file
type ConfigType = {
  entry: string;
  output: string;
  copy?: Array<{ from: string; to: string }>;
};

// Valid modes for the build process
//   build: Build the application
//   serve: Serve the application with live reload
//   profile: Serve the application with Istanbul code coverage
const validModes = ["build", "serve", "profile"] as const;
type BuildMode = (typeof validModes)[number];

function isValidMode(mode: string): mode is BuildMode {
  return validModes.includes(mode as BuildMode);
}

// Live reload script
const liveReload = resolve(__dirname, "livereload.ts");

// Schema file
const schemaFile = resolve(__dirname, "schema.json");

async function loadConfig(): Promise<ConfigType> {
  const ajv = new Ajv();
  const schema = JSON.parse(await readFile(schemaFile, "utf-8"));
  const validate = ajv.compile(schema);

  const fullPath = resolve(process.cwd(), configFile);

  if (existsSync(fullPath)) {
    const config = JSON.parse(await readFile(fullPath, "utf8"));
    if (!validate(config)) {
      throw new Error(
        `Configuration file ${configFile} is invalid: ${ajv.errorsText(
          validate.errors
        )}`
      );
    }

    // Safe to cast since we validated the config
    return config as ConfigType;
  }

  // No configuration file found, throw an error
  throw new Error(`Configuration file ${configFile} not found.`);
}

async function run(): Promise<void> {
  // Only accept zero or one argument
  if (process.argv.length > 3) {
    console.error("Usage: build [<mode>]");
    process.exit(1);
  }

  // Run mode (default to "build")
  const mode = process.argv[2] || "build";

  // Check if the mode is valid
  if (!isValidMode(mode)) {
    console.error(
      `Invalid mode: ${mode}. Valid modes are: ${validModes.join(", ")}`
    );
    process.exit(1);
  }

  const config = await loadConfig();

  // Remove the dist directory
  if (existsSync(distDir)) {
    await rm(distDir, { recursive: true, force: true });
  }

  // Create the dist directory
  await mkdir(distDir, { recursive: true });

  // Setup environment variables
  loadEnv();
  const define: Record<string, string> = {
    "process.env.DATABASE_HOST": `"${process.env.DATABASE_HOST}"`,
    "process.env.DATABASE_PATH": `"${process.env.DATABASE_PATH}"`,
    "process.env.AUTH_PATH": `"${process.env.AUTH_PATH}"`,
    "process.env.REQUEST_TIMEOUT": `"${process.env.REQUEST_TIMEOUT}"`,
  };

  // Base esbuild configuration
  const baseConfig: BuildOptions = {
    entryPoints: [config.entry],
    bundle: true,
    sourcemap: "inline",
    outfile: config.output,
    define,
  };

  // Plugin to copy static assets
  const copierPlugin: Plugin = AssetCopierPlugin(
    config.copy || [],
    mode === "serve"
  );

  switch (mode) {
    case "build": {
      await build({
        ...baseConfig,
        plugins: [copierPlugin],
      });
      console.log("Build complete");
      break;
    }
    case "serve": {
      const ctx: BuildContext = await context({
        ...baseConfig,
        inject: [liveReload],
        plugins: [copierPlugin],
      });
      await ctx.watch();
      await ctx.serve({ servedir: "dist", port: 1234 });
      console.log("Serving (and watching) app on http://localhost:1234");
      break;
    }
    case "profile": {
      const ctx: BuildContext = await context({
        ...baseConfig,
        plugins: [IstanbulPlugin, copierPlugin],
      });
      await ctx.serve({ servedir: "dist", port: 1234 });
      console.log("Serving profiled app on http://localhost:1234");
      break;
    }
  }
}

run().catch((error) => {
  console.error("Build failed:", error);
  process.exit(1);
});
