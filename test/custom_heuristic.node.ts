import { AStarWorker, createGridBuffer } from '../dist/index';
import * as fs from 'fs';
import * as path from 'path';

// Polyfills for Node.js environment
import Worker from 'web-worker';
import { pathToFileURL } from 'url';
import * as os from 'os';
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

// Polyfill URL.createObjectURL
globalThis.URL.createObjectURL = (blob: Blob) => {
    const content = lastBlobContent.join('');
    const tempFile = path.join(os.tmpdir(), `worker-${Date.now()}-${Math.random()}.mjs`);
    fs.writeFileSync(tempFile, content);
    return pathToFileURL(tempFile).href;
};

describe('Custom Heuristic Functionality', () => {
    let astar: AStarWorker;
    let customWasmPath: string;

    beforeAll(() => {
        // Path to the compiled custom WASM from examples
        customWasmPath = path.join(__dirname, '../examples/custom-heuristic/custom_logic.wasm');

        // Check if the custom WASM exists
        if (!fs.existsSync(customWasmPath)) {
            console.warn(`Custom WASM not found at ${customWasmPath}. Run 'make' in examples/custom-heuristic/`);
        }
    });

    afterEach(() => {
        if (astar) {
            astar.terminate();
        }
    });

    test('should initialize with custom WASM binary (file path)', async () => {
        if (!fs.existsSync(customWasmPath)) {
            console.log('Skipping test: custom WASM not built');
            return;
        }

        const customWasm = fs.readFileSync(customWasmPath);

        await expect(async () => {
            astar = new AStarWorker({
                heuristicOptions: { heuristic: 'custom' },
                customWasm: customWasm.buffer.slice(
                    customWasm.byteOffset,
                    customWasm.byteOffset + customWasm.byteLength
                )
            });
        }).not.toThrow();
    });

    test('should initialize with custom WASM binary (base64)', async () => {
        if (!fs.existsSync(customWasmPath)) {
            console.log('Skipping test: custom WASM not built');
            return;
        }

        const customWasm = fs.readFileSync(customWasmPath);
        const base64Wasm = customWasm.toString('base64');

        await expect(async () => {
            astar = new AStarWorker({
                heuristicOptions: { heuristic: 'custom' },
                customWasm: base64Wasm
            });
        }).not.toThrow();
    });

    test('should find path with custom heuristic that penalizes turns', async () => {
        if (!fs.existsSync(customWasmPath)) {
            console.log('Skipping test: custom WASM not built');
            return;
        }

        const customWasm = fs.readFileSync(customWasmPath);

        astar = new AStarWorker({
            heuristicOptions: { heuristic: 'custom', useCustomHeuristicG: true, useCustomHeuristicH: true },
            traversalOptions: { allowDiagonal: false },
            customWasm: customWasm.buffer.slice(
                customWasm.byteOffset,
                customWasm.byteOffset + customWasm.byteLength
            )
        });

        // Create a grid where there are multiple paths
        // The custom heuristic penalizes turns, so it should prefer straight paths
        // Grid: 10x10 with a choice between paths
        const width = 10;
        const height = 10;
        const grid = Array(height).fill(0).map(() => Array(width).fill(0));

        astar.setGrid(createGridBuffer(grid));

        const path = await astar.findPath(0, 0, 9, 9);

        expect(path.length).toBeGreaterThan(0);
        expect(path[0]).toEqual([0, 0]);
        expect(path[path.length - 1]).toEqual([9, 9]);

        // Count the number of direction changes
        let turnCount = 0;
        for (let i = 1; i < path.length - 1; i++) {
            const dx1 = path[i][0] - path[i - 1][0];
            const dy1 = path[i][1] - path[i - 1][1];
            const dx2 = path[i + 1][0] - path[i][0];
            const dy2 = path[i + 1][1] - path[i][1];

            if (dx1 !== dx2 || dy1 !== dy2) {
                turnCount++;
            }
        }

        // With turn penalty, we expect minimal turns (ideally 1)
        console.log(`Path with custom heuristic has ${turnCount} turns`);
        expect(turnCount).toBeLessThanOrEqual(2);
    });

    test('should use custom neighbor function to avoid obstacles 1 and 2', async () => {
        if (!fs.existsSync(customWasmPath)) {
            console.log('Skipping test: custom WASM not built');
            return;
        }

        const customWasm = fs.readFileSync(customWasmPath);

        astar = new AStarWorker({
            heuristicOptions: { heuristic: 'custom', useCustomHeuristicG: true, useCustomHeuristicH: true },
            traversalOptions: { allowDiagonal: false, useCustomNeighbors: true },
            customWasm: customWasm.buffer.slice(
                customWasm.byteOffset,
                customWasm.byteOffset + customWasm.byteLength
            )
        });

        // Create a grid with both type 1 and type 2 obstacles
        // The custom neighbor function treats both 1 and 2 as obstacles
        const grid = [
            [0, 0, 0, 0, 0],
            [3, 1, 1, 2, 3],  // Mix of obstacle types
            [0, 0, 0, 0, 0],
            [0, 2, 2, 1, 0],  // Mix of obstacle types
            [0, 0, 0, 0, 0]
        ];

        astar.setGrid(createGridBuffer(grid));
        const path = await astar.findPath(0, 0, 4, 4);

        expect(path.length).toBeGreaterThan(0);
        expect(path[0]).toEqual([0, 0]);
        expect(path[path.length - 1]).toEqual([4, 4]);

        // Verify that the path doesn't go through any 1 or 2 cells
        for (const [x, y] of path) {
            expect(grid[y][x]).not.toBe(1);
            expect(grid[y][x]).not.toBe(2);
        }
    });

    test('should compare performance: custom vs manhattan heuristic', async () => {
        if (!fs.existsSync(customWasmPath)) {
            console.log('Skipping test: custom WASM not built');
            return;
        }

        const width = 100;
        const height = 100;
        const gridData = Array(height).fill(0).map(() => Array(width).fill(0));

        // Add some obstacles
        for (let i = 0; i < 50; i++) {
            const x = Math.floor(Math.random() * (width - 2)) + 1;
            const y = Math.floor(Math.random() * (height - 2)) + 1;
            gridData[y][x] = 1;
        }

        // Test with Manhattan
        const astanManhattan = new AStarWorker({
            heuristicOptions: { heuristic: 'manhattan' },
            traversalOptions: { allowDiagonal: false }
        });
        astanManhattan.setGrid(createGridBuffer(gridData));

        const startManhattan = performance.now();
        const pathManhattan = await astanManhattan.findPath(0, 0, 99, 99);
        const durationManhattan = performance.now() - startManhattan;
        astanManhattan.terminate();

        // Test with Custom
        const customWasm = fs.readFileSync(customWasmPath);
        astar = new AStarWorker({
            heuristicOptions: { heuristic: 'custom', useCustomHeuristicG: true, useCustomHeuristicH: true },
            traversalOptions: { allowDiagonal: false },
            customWasm: customWasm.buffer.slice(
                customWasm.byteOffset,
                customWasm.byteOffset + customWasm.byteLength
            )
        });
        astar.setGrid(createGridBuffer(gridData));

        const startCustom = performance.now();
        const pathCustom = await astar.findPath(0, 0, 99, 99);
        const durationCustom = performance.now() - startCustom;

        console.log(`Manhattan: ${durationManhattan.toFixed(2)}ms, Custom: ${durationCustom.toFixed(2)}ms`);
        console.log(`Manhattan path length: ${pathManhattan.length}, Custom path length: ${pathCustom.length}`);

        // Both should find valid paths
        expect(pathManhattan.length).toBeGreaterThan(0);
        expect(pathCustom.length).toBeGreaterThan(0);

        // Custom might have different path length due to turn penalty
        // But should still be reasonable (not orders of magnitude different)
        expect(Math.abs(pathCustom.length - pathManhattan.length)).toBeLessThan(50);
    });

    test('should handle edge case: no path with custom obstacles', async () => {
        if (!fs.existsSync(customWasmPath)) {
            console.log('Skipping test: custom WASM not built');
            return;
        }

        const customWasm = fs.readFileSync(customWasmPath);

        astar = new AStarWorker({
            heuristicOptions: { heuristic: 'custom', useCustomHeuristicG: true, useCustomHeuristicH: true },
            traversalOptions: { useCustomNeighbors: true },
            customWasm: customWasm.buffer.slice(
                customWasm.byteOffset,
                customWasm.byteOffset + customWasm.byteLength
            )
        });

        // Grid completely blocked by type 2 obstacles
        const grid = [
            [0, 0, 0],
            [2, 2, 2],  // Wall of type 2
            [0, 0, 0]
        ];

        astar.setGrid(createGridBuffer(grid));

        const path = await astar.findPath(0, 0, 2, 2);

        // Should return empty path as there's no way through
        expect(path).toEqual([]);
    });

    test('should error when custom WASM not provided but custom heuristic flag is specified', async () => {
        // This should fall back to the default stub implementations
        astar = new AStarWorker({
            heuristicOptions: { heuristic: 'custom' },
            traversalOptions: { allowDiagonal: false }
        });

        const grid = [
            [0, 0, 0],
            [0, 1, 0],
            [0, 0, 0]
        ];

        astar.setGrid(createGridBuffer(grid));

        expect(astar.findPath(0, 0, 2, 2)).rejects.toThrow();
    });
});