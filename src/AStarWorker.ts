export interface Grid {
    nodes: Int32Array;
    width: number;
    height: number;
}

export interface Options {
    customWasm?: string | ArrayBuffer;
    heuristicOptions?: HeuristicOptions;
    traversalOptions?: TraversalOptions;
}

// Preset options | Custom options
type HeuristicOptions = { heuristic: "manhattan" | "euclidean" } | { heuristic: "custom"; useCustomHeuristicG?: boolean; useCustomHeuristicH?: boolean };
type TraversalOptions = { allowDiagonal?: boolean, useCustomNeighbors?: boolean };

/**
 * Utility to create a Grid compatible with AStarWorker from a 2D array.
 * Uses SharedArrayBuffer if available.
 */
export function createGridBuffer(nodes: number[][]): Grid {
    const height = nodes.length;
    const width = height > 0 ? nodes[0].length : 0;
    const size = width * height;

    const buffer = typeof SharedArrayBuffer !== "undefined"
        ? new SharedArrayBuffer(size * 4)
        : new ArrayBuffer(size * 4);

    const flatGrid = new Int32Array(buffer);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            flatGrid[y * width + x] = nodes[y][x];
        }
    }

    return { nodes: flatGrid, width, height };
}

import { WORKER_CODE } from './worker-generated';

export class AStarWorker {
    private worker: Worker;
    private ready: Promise<void>;
    private grid?: Grid;
    private readonly options = {
        heuristic: "manhattan",
        allowDiagonal: false,
        useCustomNeighbors: false,
        useCustomHeuristicH: false,
        useCustomHeuristicG: false,
        customWasm: null as string | ArrayBuffer,
    };
    private gridReady: Promise<void> = Promise.resolve();
    // Keep track if we created an object URL to revoke it later if needed (optional)
    private objectUrl?: string;

    constructor(options: Options = {}) {
        if (!WORKER_CODE) {
            throw new Error("WORKER_CODE is not defined, library was likely built incorrectly");
        }
        const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
        const finalWorkerPath = URL.createObjectURL(blob);
        this.objectUrl = finalWorkerPath;

        this.worker = new Worker(finalWorkerPath, { type: "module" });
        this.options = {
            ...this.options,
            ...options.heuristicOptions,
            ...options.traversalOptions,
            customWasm: options.customWasm,
        };
        this.ready = this.init();
    }

    private async init(): Promise<void> {
        return new Promise((resolve) => {
            const id = Math.random().toString(36).substring(7);
            const handleMessage = (event: MessageEvent<WorkerResponse>) => {
                const data = event.data;
                if (data.id === id && 'status' in data && data.status === "ready") {
                    this.worker.removeEventListener("message", handleMessage);
                    resolve();
                }
            };
            this.worker.addEventListener("message", handleMessage);
            const message: WorkerMessage = {
                id,
                type: "init",
                payload: {
                    customWasm: this.options.customWasm
                }
            };
            this.worker.postMessage(message);
        });
    }

    setGrid(grid: Grid) {
        // Sanity check
        if (grid.nodes.length !== grid.width * grid.height) {
            throw new Error(`Grid size mismatch: nodes.length (${grid.nodes.length}) does not match width * height (${grid.width * grid.height})`);
        }

        this.grid = grid;
        this.gridReady = this.updateWorkerGrid();
    }

    private async updateWorkerGrid(): Promise<void> {
        await this.ready;
        if (!this.grid) return;

        return new Promise((resolve) => {
            const id = Math.random().toString(36).substring(7);
            const handleMessage = (event: MessageEvent<WorkerResponse>) => {
                const data = event.data;
                if (data.id === id && 'status' in data && data.status === "ok") {
                    this.worker.removeEventListener("message", handleMessage);
                    resolve();
                }
            };
            this.worker.addEventListener("message", handleMessage);
            const message: WorkerMessage = {
                id,
                type: "setGrid",
                payload: {
                    grid: this.grid!.nodes,
                    width: this.grid!.width,
                    height: this.grid!.height
                }
            };
            this.worker.postMessage(message);
        });
    }

    async findPath(startX: number, startY: number, endX: number, endY: number): Promise<number[][]> {
        await this.ready;
        await this.gridReady;

        if (!this.grid) {
            throw new Error("Grid not set. Call setGrid() before findPath().");
        }

        return new Promise((resolve, reject) => {
            const id = Math.random().toString(36).substring(7);

            const handleMessage = (event: MessageEvent<WorkerResponse>) => {
                const data = event.data;
                if (data.id === id) {
                    this.worker.removeEventListener("message", handleMessage);
                    if ('error' in data) {
                        reject(new Error(data.error));
                    } else if ('result' in data) {
                        resolve(data.result);
                    }
                }
            };

            this.worker.addEventListener("message", handleMessage);

            const message: WorkerMessage = {
                id,
                type: "findPath",
                payload: {
                    startX,
                    startY,
                    endX,
                    endY,
                    ...this.options,
                }
            };
            this.worker.postMessage(message);
        });
    }

    async terminate() {
        if (this.objectUrl) {
            URL.revokeObjectURL(this.objectUrl);
            this.objectUrl = null;
        }
        this.worker.terminate();
    }

}

