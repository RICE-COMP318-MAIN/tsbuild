import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";

// Environment variable files in the order of precedence.
const envFiles = [".env.local", ".env"];

/**
 * Load environment variables from .env files into process.env.
 * This function loads the first file it finds in the "envFiles" array.
 */
export function loadEnv(): void {
  // Environment variables
  envFiles.forEach((file: string): void => {
    const fullPath = resolve(file);
    if (existsSync(fullPath)) {
      dotenv.config({ path: file });
    }
  });
}
