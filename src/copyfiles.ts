import {
  type Dirent,
  existsSync,
  mkdirSync,
  promises,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import chokidar from "chokidar";
import type { OnLoadArgs, OnLoadResult, Plugin, PluginBuild } from "esbuild";

export type CopyPair = {
  from: string;
  to: string;
};

const tsbuildDir = resolve(process.cwd(), ".tsbuild");
if (!existsSync(tsbuildDir)) {
  mkdirSync(tsbuildDir, { recursive: true });
}

const triggerFile = join(tsbuildDir, "trigger.ts");
const injectedImport = `import "${triggerFile}";\n\n`;

/**
 * Copies a file from the source path to the destination path, creating any
 * necessary directories along the destination path.
 *
 * @param src - The path to the source file to copy.
 * @param dest - The destination path where the file should be copied.
 * @returns A promise that resolves when all necessary directories have been
 * created and the file has been copied.
 *
 * @throws If the source file does not exist or cannot be read, or if the file
 * cannot be written to the destination.
 */
async function copyFileWithDirs(src: string, dest: string): Promise<void> {
  await promises.mkdir(dirname(dest), { recursive: true });
  await promises.copyFile(src, dest);
}

/**
 * Recursively retrieves all file paths within a given directory and its
 * subdirectories.
 *
 * @param dir - The root directory to search for files.
 * @returns A promise that resolves to an array of file paths as strings.
 */
async function getAllFiles(dir: string): Promise<Array<string>> {
  const entries: Array<Dirent> = await promises.readdir(dir, {
    withFileTypes: true,
  });
  const files: Array<string | Array<string>> = await Promise.all(
    entries.map((entry: Dirent): Promise<string | Array<string>> => {
      const fullPath = join(dir, entry.name);
      return entry.isDirectory()
        ? getAllFiles(fullPath)
        : Promise.resolve(fullPath);
    })
  );
  return files.flat();
}

/**
 * Replaces occurrences of a pattern in a file with a specified replacement
 * string.
 *
 * @param filePath - The path to the file to be modified.
 * @param searchRegex - The regular expression pattern to search for in the file
 * content.
 * @param replacement - The string to replace each match of the pattern.
 */
function replaceInFile(
  filePath: string,
  searchRegex: RegExp,
  replacement: string
): void {
  const absolutePath = resolve(filePath);
  const fileContent = readFileSync(absolutePath, "utf8");

  const updatedContent = fileContent.replace(searchRegex, replacement);

  writeFileSync(absolutePath, updatedContent, "utf8");
}

/**
 * An esbuild plugin for copying static asset files from specified source
 * directories to destination directories, with optional file watching and live
 * reload support.
 *
 * This plugin allows you to specify pairs of source and destination
 * directories. On build start, it recursively copies all files from each source
 * to its corresponding destination, creating directories as needed. If
 * `watchFiles` is enabled, it watches the source directories for changes and
 * automatically copies updated files, triggering a rebuild.
 *
 * @param copyPairs - An array of objects specifying the `from` (source) and
 *   `to` (destination) directory paths for assets to be copied.
 * @param watchFiles - If true, enables file watching and live reload on
 *   changes.
 * @returns An esbuild `Plugin` instance that handles asset copying and optional
 * watching.
 */
export function AssetCopierPlugin(
  copyPairs: Array<CopyPair>,
  watchFiles = false
): Plugin {
  let watchSetup = false;

  return {
    name: "static-asset-copier",
    setup(build: PluginBuild): void {
      const root = process.cwd();

      // Normalize paths
      const resolvedPairs: Array<CopyPair> = copyPairs.map(
        (pair: CopyPair): CopyPair => {
          if (pair.from === "")
            throw new Error(
              '[static-asset-copier] Each entry must have a "from" property.'
            );
          if (pair.to === "")
            throw new Error(
              '[static-asset-copier] Each entry must have a "to" property.'
            );
          const srcDir: string = resolve(root, pair.from);
          const destDir: string = resolve(root, pair.to);
          return { from: srcDir, to: destDir };
        }
      );

      async function copyAllAssets(): Promise<void> {
        for (const pair of resolvedPairs) {
          const files = await getAllFiles(pair.from);
          await Promise.all(
            files.map((file: string): Promise<void> => {
              const rel: string = relative(pair.from, file);
              const destPath: string = join(pair.to, rel);
              return copyFileWithDirs(file, destPath);
            })
          );
        }
      }

      if (watchFiles) {
        // Create initial trigger file.
        writeFileSync(
          triggerFile,
          `console.log("Updated at: ${Date.now()}");\n`,
          "utf8"
        );

        // Inject livereload import into main.ts
        build.onLoad(
          { filter: /main.ts/ },
          async (args: OnLoadArgs): Promise<OnLoadResult> => {
            const source = await promises.readFile(args.path, "utf8");
            return {
              contents: injectedImport + source,
              loader: "ts",
            };
          }
        );
      }

      build.onStart(copyAllAssets);

      build.onEnd((): void => {
        if (watchFiles && !watchSetup) {
          watchSetup = true;

          for (const pair of resolvedPairs) {
            console.log(
              "[static-asset-copier] Watching for changes in:",
              pair.from
            );

            const watcher = chokidar.watch(pair.from, {
              persistent: true,
              ignoreInitial: true,
            });

            watcher.on(
              "all",
              async (event: string, path: string): Promise<void> => {
                // Ignore unlink events to prevent unnecessary reloads
                if (event === "unlink" || event === "unlinkDir") return;

                const relativePath = relative(pair.from, path);
                const destFile = join(pair.to, relativePath);

                try {
                  await copyFileWithDirs(path, destFile);
                  console.log(`[static-asset-copier] Updated: ${relativePath}`);

                  // Trigger rebuild
                  replaceInFile(
                    triggerFile,
                    /console\.log\("Updated at: [0-9]+"\);/,
                    `console.log("Updated at: ${Date.now()}");`
                  );
                } catch (err: unknown) {
                  console.warn(
                    `[static-asset-copier] Failed to copy ${relativePath}:`,
                    err
                  );
                }
              }
            );
          }
        }
      });
    },
  };
}
