import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import chokidar from "chokidar";
import type { BuildContext } from "esbuild";
import mime from "mime";
import { type CopyPair, copyAllAssets } from "./copyfiles";

const clients: http.ServerResponse[] = [];

// SSE endpoint
function handleSSE(req: http.IncomingMessage, res: http.ServerResponse) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("\n");
  clients.push(res);
  req.on("close", () => {
    const idx = clients.indexOf(res);
    if (idx >= 0) clients.splice(idx, 1);
  });
}

// Trigger reload
function sendReload() {
  for (const client of clients) {
    client.write("data: reload\n\n");
  }
}

export async function serve(
  root: string,
  port: number,
  ctx: BuildContext,
  copyPairs: Array<CopyPair>,
): Promise<void> {
  // Initial copy of assets
  await copyAllAssets(copyPairs);

  // Initial build
  await ctx.rebuild();

  // Start server
  const server = http.createServer((req, res) => {
    if (req.url === "/__reload") {
      return handleSSE(req, res);
    }

    const url = req.url ?? "/";
    const filePath = path.join(
      root,
      url === "/" ? "/index.html" : decodeURIComponent(url),
    );

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const contentType = mime.getType(filePath) || "application/octet-stream";
      res.writeHead(200, { "Content-Type": contentType });

      // Inject reload script into HTML
      if (filePath.endsWith("index.html")) {
        const script = `
        <script>
          const es = new EventSource('/__reload');
          es.onmessage = () => location.reload();
        </script>
        `;
        res.end(data.toString().replace("</body>", `${script}</body>`));
      } else {
        res.end(data);
      }
    });
  });

  server.listen(port, () => {
    console.log(`Serving (and watching) at http://localhost:${port}`);
  });

  // --- Watch for static asset changes ---
  const assetWatcher = chokidar.watch(
    copyPairs.map((pair) => pair.from),
    { ignoreInitial: true },
  );

  assetWatcher.on("all", async () => {
    await copyAllAssets(copyPairs);
    console.log("Assets copied");
    sendReload();
  });

  // --- Watch for source changes ---
  const rebuild = async () => {
    try {
      await ctx.rebuild();
      console.log("Rebuilt source");
      sendReload();
    } catch (err) {
      console.error("Build error:", err);
    }
  };

  const sourceWatcher = chokidar.watch("src", {
    ignoreInitial: true,
  });

  sourceWatcher.on("all", rebuild);

  // Close watchers and clients on exit
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    assetWatcher.close();
    sourceWatcher.close();
    clients.forEach((res) => res.end());
    server.close(() => process.exit(0));
  });
}
