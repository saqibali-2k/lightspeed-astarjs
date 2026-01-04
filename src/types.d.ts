declare type WorkerMessage =
    | { id: string; type: "init"; payload: { customWasm?: string | ArrayBuffer } }
    | { id: string; type: "setGrid"; payload: { grid: Int32Array; width: number; height: number } }
    | {
        id: string; type: "findPath"; payload: {
            startX: number;
            startY: number;
            endX: number;
            endY: number;
            allowDiagonal: boolean;
            heuristic: string;
            useCustomNeighbors: boolean;
            useCustomHeuristicH: boolean;
            useCustomHeuristicG: boolean;
        }
    };

declare type WorkerResponse =
    | { id: string; status: "ready" | "ok" }
    | { id: string; result: number[][] }
    | { id: string; error: string };