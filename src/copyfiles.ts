import { cp } from "node:fs/promises";

export type CopyPair = {
  from: string; // Source directory for assets
  to: string; // Destination directory for assets
};

export async function copyAllAssets(
  resolvedPairs: Array<CopyPair>,
): Promise<void> {
  // Recursively copy all assets from source to destination
  for (const pair of resolvedPairs) {
    await cp(pair.from, pair.to, {
      recursive: true,
      force: true,
    });
  }
}
