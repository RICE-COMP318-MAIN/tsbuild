// Live reload snippet
new EventSource("/esbuild").addEventListener("change", () => location.reload());
