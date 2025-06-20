import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";

// Environment variable files.
const defaultEnvFile = ".env";
const localEnvFile = ".env.local";
const testingEnvFile = ".env.testing";

/**
 * Load environment variables from .env files into process.env.
 *
 * This function loads environment variables from a default .env file, and
 * overrides the defaults from an optional local .env.local file or an optional
 * testing .env.testing file.
 */
export function loadEnv(testing = false): void {
  const override = testing ? testingEnvFile : localEnvFile;

  // Default environment variables
  const defaultPath = resolve(defaultEnvFile);
  if (existsSync(defaultPath)) {
    dotenv.config({ path: defaultPath });
  }

  // Overrides
  const overridePath = resolve(override);
  if (existsSync(overridePath)) {
    const overrides = dotenv.parse(readFileSync(overridePath, "utf8"));
    for (const key in overrides) {
      process.env[key] = overrides[key];
    }
  }
}
