import { test, expect } from '@playwright/test';

declare global {
    interface Window {
        AStarLib: any;
    }
}

test.describe('AStarWorker Browser Integration', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the test page which exposes AStarLib
        await page.goto('/test/browser/index.html');
        // Wait for the definition to be available
        await page.waitForFunction(() => !!window.AStarLib);
    });

    test('should find a simple path', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const { AStarWorker, createGridBuffer } = window.AStarLib;
            const astar = new AStarWorker();

            // Simple 3x3 grid
            // S . .
            // # # .
            // E . .
            const gridData = [
                [0, 0, 0],
                [1, 1, 0],
                [0, 0, 0]
            ];
            astar.setGrid(createGridBuffer(gridData));

            const path = await astar.findPath(0, 0, 0, 2);
            astar.terminate();
            return path;
        });

        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toEqual([0, 0]);
        expect(result[result.length - 1]).toEqual([0, 2]);
    });

    test('should handle exhaustive search on 1000x1000 grid (No Path)', async ({ page }) => {
        // Increase timeout for this potentially slower test
        test.setTimeout(30000);

        const result = await page.evaluate(async () => {
            const { AStarWorker } = window.AStarLib;
            const astar = new AStarWorker();

            // 1000x1000 grid
            const width = 1000;
            const height = 1000;
            // Use SharedArrayBuffer directly if possible, or we could use createGridBuffer if we had a large array
            // But manually creating SAB is more efficient here for setup
            const sab = new SharedArrayBuffer(width * height * 4);
            const nodes = new Int32Array(sab);

            // Wall at x=500 for all y.
            for (let y = 0; y < height; y++) {
                nodes[y * width + 500] = 1;
            }

            const grid = { nodes, width, height };
            astar.setGrid(grid);

            const start = performance.now();
            const path = await astar.findPath(0, 0, 999, 999); // 0,0 to bottom-right
            const end = performance.now();

            astar.terminate();
            return {
                pathLength: path ? path.length : 0,
                duration: end - start
            };
        });

        // Current fastest exhaustive search should be reasonably fast with WASM
        console.log(`Exhaustive search took: ${result.duration}ms`);
        expect(result.pathLength).toBe(0);

        // Let's set a conservative 500ms limit for "lightspeed". I'm seeing ~110ms on my machine.
        expect(result.duration).toBeLessThan(500);
    });
});
