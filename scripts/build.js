const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function build() {
    console.log('Building AStar...');

    // 1. Read the WASM file
    const wasmPath = path.join(__dirname, '../dist/astar.wasm');
    if (!fs.existsSync(wasmPath)) {
        console.error('Error: dist/astar.wasm not found. Run "make" first.');
        process.exit(1);
    }
    const wasmBuffer = fs.readFileSync(wasmPath);
    const wasmBase64 = wasmBuffer.toString('base64');

    console.log(`Read WASM file (${wasmBuffer.length} bytes)`);

    // 2. Bundle the Worker Code
    // We define a placeholder for the WASM data in the worker
    const workerBuild = await esbuild.build({
        entryPoints: [path.join(__dirname, '../src/worker.ts')],
        bundle: true,
        write: false,
        minify: true,
        format: 'iife',
        define: {
            'process.env.ASTAR_WASM_BASE64': JSON.stringify(wasmBase64)
        }
    });

    const workerCode = workerBuild.outputFiles[0].text;
    console.log(`Bundled Worker code (${workerCode.length} bytes)`);

    // 3. Build the Main Library (ESM + CJS) using tsup (via exec or direct usage)

    // We need to pass the worker code to the library.
    // We can write it to a temporary file or pass it via environment variable / define.
    // Passing a 20KB+ string via command line might be tricky but usually fine.
    // Better: Write to a generated file src/worker-generated.ts and import it.

    const workerGenPath = path.join(__dirname, '../src/worker-generated.ts');
    const workerGenContent = `/**
 * This file holds the bundled source code for the Web Worker (including the inlined WASM binary).
 * 
 * PURPOSE:
 * It allows the AStarWorker to instantiate the worker from a string/Blob (using URL.createObjectURL)
 * instead of requiring the user to serve a separate 'worker.js' file. 
 * 
 * This file is populated by \`scripts/build.js\` during the build process.
 */
export const WORKER_CODE = ${JSON.stringify(workerCode)};`;

    fs.writeFileSync(workerGenPath, workerGenContent);
    console.log(`Generated ${workerGenPath}`);

    // Run tsup
    try {
        console.log('Running tsup...');
        execSync('npx tsup src/index.ts --format cjs,esm --dts', {
            stdio: 'inherit',
            cwd: path.join(__dirname, '..')
        });
        console.log('Build complete!');

    } catch (e) {
        console.error('Build failed', e);
        process.exit(1);
    } finally {
        // Cleanup - kept for debugging/types
        // if (fs.existsSync(workerGenPath)) {
        //     fs.unlinkSync(workerGenPath);
        // }
    }
}

build().catch(err => {
    console.error(err);
    process.exit(1);
});
