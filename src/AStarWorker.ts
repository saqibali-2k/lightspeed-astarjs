export interface Grid {
    nodes: Int32Array;
    width: number;
    height: number;
}

export interface Options {
    diagonalMovement: boolean;
    heuristic: "manhattan" | "euclidean" | "custom";
    useCustomNeighbors?: boolean;
    /** Optional WASM binary (base64 string or ArrayBuffer) */
    customWasm?: string | ArrayBuffer;
}

export type WorkerMessage =
    | { id: string; type: "init"; payload: { customWasm?: string | ArrayBuffer } }
    | { id: string; type: "setGrid"; payload: { grid: Int32Array; width: number; height: number } }
    | { id: string; type: "findPath"; payload: { startX: number; startY: number; endX: number; endY: number; allowDiagonal: boolean; heuristic: string; useCustomNeighbors: boolean } };

export type WorkerResponse =
    | { id: string; status: "ready" | "ok" }
    | { id: string; result: number[][] }
    | { id: string; error: string };

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

// ... (keep Grid and Options interfaces as is ... they are above line 1)

export class AStarWorker {
    private worker: Worker;
    private ready: Promise<void>;
    private grid?: Grid;
    private options: Options;
    private gridReady: Promise<void> = Promise.resolve();
    // Keep track if we created an object URL to revoke it later if needed (optional)
    private objectUrl?: string;

    constructor(options: Partial<Options> = {}) {
        if (!WORKER_CODE) {
            throw new Error("WORKER_CODE is not defined, library was likely built incorrectly");
        }
        const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
        const finalWorkerPath = URL.createObjectURL(blob);
        this.objectUrl = finalWorkerPath;

        this.worker = new Worker(finalWorkerPath, { type: "module" });
        this.options = {
            diagonalMovement: options.diagonalMovement ?? false,
            heuristic: options.heuristic ?? "manhattan",
            useCustomNeighbors: options.useCustomNeighbors ?? false,
            customWasm: options.customWasm
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
                    allowDiagonal: this.options.diagonalMovement,
                    heuristic: this.options.heuristic,
                    useCustomNeighbors: this.options.useCustomNeighbors || false
                }
            };
            this.worker.postMessage(message);
        });
    }

    async terminate() {
        if (this.objectUrl) {
            URL.revokeObjectURL(this.objectUrl);
            this.objectUrl = undefined;
        }
        this.worker.terminate();
    }
}


