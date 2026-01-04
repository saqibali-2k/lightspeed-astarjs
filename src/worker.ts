/**
 * worker.ts
 * 
 * The entry point for the Web Worker that runs the A* algorithm in WebAssembly (C++ version).
 */

// ---------- Node.js polyfills ----------
if (typeof globalThis.atob === "undefined") {
    (globalThis as any).atob = (b64: string) => Buffer.from(b64, "base64").toString("binary");
}

type FindPathWASM = (
    width: number,
    height: number,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    allowDiagonal: boolean,
    heuristic: string,
    useCustomNeighbors: boolean,
    useCustomHeuristicH: boolean,
    useCustomHeuristicG: boolean,
) => number[][];

let findPathWASMImpl: FindPathWASM;

let wasmReady: Promise<void>;
let instance: WebAssembly.Instance;
let wasmExports: any;

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

let customHeuristicImplG: (gridPtr: number, width: number, height: number,
    curX: number, curY: number, prevX: number, prevY: number,
    prevPrevX: number, prevPrevY: number,
    startX: number, startY: number, endX: number, endY: number) => number;

let customHeuristicImplH: (gridPtr: number, width: number, height: number,
    curX: number, curY: number, prevX: number, prevY: number,
    prevPrevX: number, prevPrevY: number,
    startX: number, startY: number, endX: number, endY: number) => number;

let customGetNeighborsImpl: (gridPtr: number, width: number, height: number,
    x: number, y: number, prevX: number, prevY: number,
    bufferPtr: number) => number;

// Default implementations
const defaultCustomHeuristic = (): number => {
    throw new Error("Custom heuristic not implemented");
};

const defaultCustomGetNeighbors = (): number => {
    throw new Error("Custom get neighbors not implemented");
};

const initWasm = async (customWasm?: string | ArrayBuffer) => {
    if (!process.env.ASTAR_WASM_BASE64) {
        throw new Error("ASTAR_WASM_BASE64 environment variable not set, library not bundled correctly");
    }

    const inlinedWasm = process.env.ASTAR_WASM_BASE64;
    const wasmBytes = base64ToUint8Array(inlinedWasm);

    // Create import object with wrapper functions
    const mainImportObject = {
        env: {
            custom_heuristic_h: (...args: Parameters<typeof customHeuristicImplH>) => {
                if (customHeuristicImplH) {
                    return customHeuristicImplH(...args);
                }
                return defaultCustomHeuristic();
            },
            custom_heuristic_g: (...args: Parameters<typeof customHeuristicImplG>) => {
                if (customHeuristicImplG) {
                    return customHeuristicImplG(...args);
                }
                return defaultCustomHeuristic();
            },
            custom_get_neighbors: (...args: Parameters<typeof customGetNeighborsImpl>) => {
                if (customGetNeighborsImpl) {
                    return customGetNeighborsImpl(...args);
                }
                return defaultCustomGetNeighbors();
            },
            emscripten_notify_memory_growth: () => { }
        },
        // wasi_snapshot_preview1: {
        //     fd_write: (fd: number, iovs: number, iovs_len: number, nwritten: number) => {
        //         // Dummy implementation for WASI fd_write
        //         return 0; // Success
        //     },
        //     proc_exit: (code: number) => {
        //         console.warn("WASM tried to exit with code:", code);
        //     },
        //     environ_get: () => 0,
        //     environ_sizes_get: () => 0,
        // }
    };

    // Load main WASM
    const result = await WebAssembly.instantiate(wasmBytes, mainImportObject);
    instance = result.instance;
    wasmExports = instance.exports;
    const mainMemory = wasmExports.memory as WebAssembly.Memory;

    // Load custom WASM if provided
    if (customWasm) {
        const bytes = typeof customWasm === "string"
            ? base64ToUint8Array(customWasm)
            : new Uint8Array(customWasm);

        const customImportObject = {
            env: {
                memory: mainMemory,
                emscripten_notify_memory_growth: () => { }
            }
        };

        try {
            const customResult = await WebAssembly.instantiate(bytes, customImportObject);
            const customExports = customResult.instance.exports as any;

            // Update implementations to call custom functions
            if (customExports.custom_heuristic_g) {
                customHeuristicImplG = customExports.custom_heuristic_g;
            }
            if (customExports.custom_heuristic_h) {
                customHeuristicImplH = customExports.custom_heuristic_h;
            }
            if (customExports.custom_get_neighbors) {
                customGetNeighborsImpl = customExports.custom_get_neighbors;
            }
        } catch (err) {
            console.error("Failed to load custom WASM:", err);
            throw err;
        }
    }


    findPathWASMImpl = (
        width: number,
        height: number,
        startX: number,
        startY: number,
        endX: number,
        endY: number,
        allowDiagonal: boolean,
        heuristic: string,
        useCustomNeighbors: boolean,
        useCustomHeuristicH: boolean,
        useCustomHeuristicG: boolean
    ) => {
        const heuristicMap: Record<string, number> = {
            "manhattan": 0,
            "euclidean": 1,
        };
        const hType = heuristicMap[heuristic] ?? 0;

        const pathPtr = wasmExports.findPathWASM(
            width,
            height,
            startX,
            startY,
            endX,
            endY,
            allowDiagonal,
            hType,
            useCustomNeighbors,
            useCustomHeuristicH,
            useCustomHeuristicG
        );

        let resultPath: number[][] = [];
        if (pathPtr !== 0) {
            const mem32 = new Int32Array(wasmExports.memory.buffer);
            const count = mem32[pathPtr / 4];

            for (let i = 0; i < count; i++) {
                const x = mem32[pathPtr / 4 + 1 + i * 2];
                const y = mem32[pathPtr / 4 + 1 + i * 2 + 1];
                resultPath.push([x, y]);
            }
        }

        return resultPath;
    };
};

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
    const { id, type, payload } = event.data;
    try {
        if (type === "init") {
            wasmReady = initWasm(payload.customWasm);
            await wasmReady;
            self.postMessage({ id, status: "ready" } as WorkerResponse);
        } else if (type === "setGrid") {
            const { grid, width, height } = payload;
            storedWidth = width;
            storedHeight = height;

            if (!wasmReady) {
                self.postMessage({ id, error: "WASM not initialized" } as WorkerResponse);
                return;
            }
            await wasmReady;

            // WASM will resize its buffer if needed
            // We don't need to worry about freeing this, WASM has ownership
            gridPtr = wasmExports.getGridBufferWASM(width, height);
            const wasmMem32 = new Int32Array(wasmExports.memory.buffer);
            wasmMem32.set(grid, gridPtr / 4);

            self.postMessage({ id, status: "ok" } as WorkerResponse);
        } else if (type === "findPath") {
            if (!wasmReady) {
                self.postMessage({ id, error: "WASM not initialized" } as WorkerResponse);
                return;
            }
            await wasmReady;

            const { startX, startY, endX, endY, allowDiagonal, heuristic, useCustomNeighbors, useCustomHeuristicG, useCustomHeuristicH } = payload;

            if (gridPtr === null) {
                self.postMessage({ id, error: "Grid not set" } as WorkerResponse);
                return;
            }

            const path = findPathWASMImpl(
                storedWidth,
                storedHeight,
                startX,
                startY,
                endX,
                endY,
                allowDiagonal,
                heuristic,
                useCustomNeighbors,
                useCustomHeuristicG,
                useCustomHeuristicH
            );
            self.postMessage({ id, result: path } as WorkerResponse);
        }
    } catch (err: any) {
        self.postMessage({ id, error: err instanceof Error ? err.message : String(err) } as WorkerResponse);
    }
};