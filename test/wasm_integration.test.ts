import { AStarWorker, createGridBuffer } from '../src/index';

// Polyfills for Node.js environment
import Worker from 'web-worker';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { pathToFileURL } from 'url';
import { Blob as NodeBlob } from 'buffer';

// Polyfill global Worker if not present
if (typeof globalThis.Worker === 'undefined') {
    globalThis.Worker = Worker as any;
}

// Polyfill Blob if not present
if (typeof globalThis.Blob === 'undefined') {
    globalThis.Blob = NodeBlob as any;
}

const OriginalBlob = globalThis.Blob;
let lastBlobContent: any[] = [];

// Patch Blob to capture content
globalThis.Blob = class MockBlob extends OriginalBlob {
    constructor(sources: any[], options?: BlobPropertyBag) {
        super(sources, options);
        lastBlobContent = sources;
    }
} as any;

// Polyfill URL.createObjectURL (Force overwrite to support web-worker file:// requirements)
globalThis.URL.createObjectURL = (blob: Blob) => {
    const content = lastBlobContent.join('');

    // Write content to a temp file so 'web-worker' can load it
    const tempFile = path.join(os.tmpdir(), `worker-${Date.now()}-${Math.random()}.mjs`);
    fs.writeFileSync(tempFile, content);
    return pathToFileURL(tempFile).href;
};


describe('AStarWorker WASM Integration', () => {
    let astar: AStarWorker;

    afterEach(() => {
        astar.cleanup();
    });

    test('Sanity: should initialize and set grid', async () => {
        astar = new AStarWorker();

        const grid = [
            [0, 0, 0],
            [0, 1, 0],
            [0, 0, 0]
        ];
        const gridBuffer = createGridBuffer(grid);

        await expect(async () => {
            astar.setGrid(gridBuffer);
        }).not.toThrow();
    });

    test('Sanity: should find path bypassing obstacle', async () => {
        astar = new AStarWorker();

        // 3x3 Grid
        // S . .
        // # # .
        // E . .
        const grid = [
            [0, 0, 0],
            [1, 1, 0],
            [0, 0, 0]
        ];

        astar.setGrid(createGridBuffer(grid));

        const path = await astar.findPath(0, 0, 0, 2);

        expect(path.length).toBeGreaterThan(0);
        expect(path[0]).toEqual([0, 0]);
        expect(path[path.length - 1]).toEqual([0, 2]);
    });

    test('Sanity: should return empty array when no path', async () => {
        astar = new AStarWorker();
        const grid = [
            [0, 1, 0],
            [1, 1, 1],
            [0, 0, 0]
        ];
        astar.setGrid(createGridBuffer(grid));
        const path = await astar.findPath(0, 0, 2, 2);
        expect(path).toEqual([]);
    });

    test('Performance: 100x100 grid should find path', async () => {
        astar = new AStarWorker();
        const width = 100;
        const height = 100;
        const sab = new SharedArrayBuffer(width * height * 4);
        const nodes = new Int32Array(sab);
        // Wall at x=50, y=0..79
        for (let y = 0; y < 80; y++) {
            nodes[y * width + 50] = 1;
        }
        const grid = { nodes, width, height };
        astar.setGrid(grid);

        await astar.findPath(0, 0, 10, 10); // Warmup
        const path = await astar.findPath(0, 0, 99, 99);

        expect(path.length).toBeGreaterThan(0);
    });

    test('Performance: 1000x1000 empty grid should search within 200ms', async () => {
        astar = new AStarWorker();
        const width = 1000;
        const height = 1000;
        const sab = new SharedArrayBuffer(width * height * 4);
        const nodes = new Int32Array(sab); // All 0s
        const grid = { nodes, width, height };
        astar.setGrid(grid);

        await astar.findPath(0, 0, 10, 10);

        const start = performance.now();
        const path = await astar.findPath(0, 0, 999, 999);
        const end = performance.now();
        const duration = end - start;

        expect(path.length).toBeGreaterThan(0);
        // On my machine it takes < 20ms, but let's be lenient
        expect(duration).toBeLessThan(200);
    });
});
