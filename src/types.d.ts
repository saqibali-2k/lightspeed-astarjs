declare function findPathWASM(
    width: number,
    height: number,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    allowDiagonal: boolean,
    heuristic: string,
    useCustomNeighbors: boolean
): number[][] | null;
