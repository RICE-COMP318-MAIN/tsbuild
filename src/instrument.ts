import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  type OnLoadArgs,
  type OnLoadResult,
  type Plugin,
  type PluginBuild,
  type TransformResult,
  transform,
} from "esbuild";
import { type Instrumenter, createInstrumenter } from "istanbul-lib-instrument";

/**
 * An esbuild plugin to instrument TypeScript files for code coverage.
 *
 * This plugin uses Istanbul's lib-instrument to instrument TypeScript files for
 * profiling as they are loaded by esbuild. Files in the node_modules directory
 * are ignored.
 */
export const IstanbulPlugin: Plugin = {
  name: "istanbul-instrumenter",
  setup(build: PluginBuild): void {
    build.onLoad(
      { filter: /\.[cm]?ts$/ },
      async (args: OnLoadArgs): Promise<OnLoadResult | undefined> => {
        if (args.path.includes("node_modules")) return;

        const tsSource = await readFile(args.path, "utf8");

        const jsTransformed: TransformResult = await transform(tsSource, {
          loader: "ts",
          sourcemap: true,
          sourcefile: args.path,
        });

        const instrumenter: Instrumenter = createInstrumenter({
          esModules: true,
          produceSourceMap: true,
        });
        const instrumentedCode = instrumenter.instrumentSync(
          jsTransformed.code,
          args.path,
          JSON.parse(jsTransformed.map),
        );

        // Append the inline source map to the instrumented code
        const finalMap = instrumenter.lastSourceMap();
        const base64Map = Buffer.from(JSON.stringify(finalMap)).toString(
          "base64",
        );
        const inlineSourceMap = `//# sourceMappingURL=data:application/json;base64,${base64Map}`;
        const finalCode = `${instrumentedCode}\n${inlineSourceMap}`;

        return {
          contents: finalCode,
          loader: "js",
          resolveDir: path.dirname(args.path),
        };
      },
    );
  },
};
