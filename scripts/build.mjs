// scripts/build.js
import { execSync } from 'child_process';

try {
  execSync('esbuild src/build.ts --bundle --platform=node --format=cjs --external:esbuild --external:ajv --external:chokidar --external:istanbul-lib-instrument --external:dotenv --external:node:* --outfile=dist/tsbuild', { stdio: 'inherit' });
  execSync('esbuild src/loadenv.ts --bundle --platform=node --format=cjs --outfile=dist/loadenv.js', { stdio: 'inherit' });
  execSync('tsc --emitDeclarationOnly --declaration --moduleResolution bundler --module es2022 --outDir dist/ src/loadenv.ts', { stdio: 'inherit' });
  execSync('cp src/livereload.ts dist/livereload.ts', { stdio: 'inherit' });
  execSync('cp schema/schema.json dist/schema.json', { stdio: 'inherit' });
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}
console.log('Build completed successfully.');