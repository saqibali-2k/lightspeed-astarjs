/**
 * worker.ts
 * 
 * The entry point for the Web Worker that runs the A* algorithm in WebAssembly (C++ version).
 */
import type { WorkerMessage, WorkerResponse } from "./AStarWorker";

// ---------- Node.js polyfills ----------
if (typeof globalThis.atob === "undefined") {
    // Buffer is available in Node
    (globalThis as any).atob = (b64: string) => Buffer.from(b64, "base64").toString("binary");
}

let wasmReady: Promise<void>;
let instance: WebAssembly.Instance;
let exports: any;

let storedGrid: Int32Array | null = null;
let storedWidth: number = 0;
let storedHeight: number = 0;
let gridPtr: number | null = null;

const base64ToUint8Array = (base64: string) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
};

const initWasm = async (customWasm?: string | ArrayBuffer) => {
    const importObject: any = {
        env: {
            custom_heuristic: (gridPtr: number, width: number, height: number, curX: number, curY: number, prevX: number, prevY: number, startX: number, startY: number, endX: number, endY: number): number => {
                return Math.abs(curX - endX) + Math.abs(curY - endY);
            },
            custom_get_neighbors: (gridPtr: number, width: number, height: number, x: number, y: number, prevX: number, prevY: number, bufferPtr: number): number => {
                const mem = new Int32Array(exports.memory.buffer);
                let count = 0;
                const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
                for (const [dx, dy] of dirs) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const idx = ny * width + nx;
                        if (mem[gridPtr / 4 + idx] === 0) {
                            mem[bufferPtr / 4 + count * 2] = nx;
                            mem[bufferPtr / 4 + count * 2 + 1] = ny;
                            count++;
                        }
                    }
                }
                return count;
            },
            emscripten_notify_memory_growth: (index: number) => {
                // This is called when the WASM memory grows.
                // For direct memory access, we might need to refresh views,
                // but since we refresh mem32 inside findPath, we are safe.
            }
        }
    };
    // Declare result variable before possible use in customWasm block
    let result: WebAssembly.WebAssemblyInstantiatedSource;


    // Support custom WASM binary (string base64 or ArrayBuffer)
    if (customWasm) {
        const bytes = typeof customWasm === "string"
            ? base64ToUint8Array(customWasm)
            : new Uint8Array(customWasm);
        const customResult = await WebAssembly.instantiate(bytes, importObject);
        const customExports = customResult.instance.exports as any;
        if (customExports.custom_heuristic) {
            importObject.env.custom_heuristic = customExports.custom_heuristic;
        }
        if (customExports.custom_get_neighbors) {
            importObject.env.custom_get_neighbors = customExports.custom_get_neighbors;
        }
    }

    // Check for inlined WASM
    // We check purely for the replaced string. esbuild will replace process.env.ASTAR_WASM_BASE64
    // with the actual string literal, so there is no runtime dependency on 'process'.
    const inlinedWasm = process.env.ASTAR_WASM_BASE64;
    const wasmBytes = base64ToUint8Array(inlinedWasm);
    result = await WebAssembly.instantiate(wasmBytes, importObject);
    instance = result.instance;
    exports = instance.exports;

    (globalThis as any).findPathWASM = (width: number, height: number, startX: number, startY: number, endX: number, endY: number, allowDiagonal: boolean, heuristic: string, useCustomNeighbors: boolean) => {
        const heuristicMap: Record<string, number> = {
            "manhattan": 0,
            "euclidean": 1,
            "custom": 2
        };
        const hType = heuristicMap[heuristic] ?? 0;

        // Uses the global grid already set in WASM memory via setGridWASM.
        const pathPtr = exports.findPathWASM(width, height, startX, startY, endX, endY, allowDiagonal, hType, useCustomNeighbors);

        let resultPath: number[][] = [];
        if (pathPtr !== 0) {
            const mem32 = new Int32Array(exports.memory.buffer);
            const count = mem32[pathPtr / 4];
            for (let i = 0; i < count; i++) {
                resultPath.push([
                    mem32[pathPtr / 4 + 1 + i * 2],
                    mem32[pathPtr / 4 + 1 + i * 2 + 1]
                ]);
            }
        }
        return resultPath;
    };
};

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
    const { id, type, payload } = event.data;

    if (type === "init") {
        wasmReady = initWasm(payload.customWasm);
        await wasmReady;
        self.postMessage({ id, status: "ready" } as WorkerResponse);
    } else if (type === "setGrid") {
        const { grid, width, height } = payload;
        storedGrid = grid;
        storedWidth = width;
        storedHeight = height;

        if (!wasmReady) {
            self.postMessage({ id, error: "WASM not initialized" } as WorkerResponse);
            return;
        }
        await wasmReady;

        // Get/Resize WASM persistent buffer
        gridPtr = exports.getGridBufferWASM(width, height);

        // Write directly to WASM memory
        const wasmMem32 = new Int32Array(exports.memory.buffer);
        wasmMem32.set(grid, gridPtr / 4);

        self.postMessage({ id, status: "ok" } as WorkerResponse);
    } else if (type === "findPath") {
        if (!wasmReady) {
            self.postMessage({ id, error: "WASM not initialized" } as WorkerResponse);
            return;
        }
        await wasmReady;

        const { startX, startY, endX, endY, allowDiagonal, heuristic, useCustomNeighbors } = payload;

        if (!storedGrid || gridPtr === null) {
            self.postMessage({ id, error: "Grid not set" } as WorkerResponse);
            return;
        }

        try {
            // Updated shim call
            // @ts-ignore
            const path = globalThis.findPathWASM(storedWidth, storedHeight, startX, startY, endX, endY, allowDiagonal, heuristic, useCustomNeighbors);
            self.postMessage({ id, result: path } as WorkerResponse);
        } catch (err: any) {
            self.postMessage({ id, error: err.toString() } as WorkerResponse);
        }
    }
};

