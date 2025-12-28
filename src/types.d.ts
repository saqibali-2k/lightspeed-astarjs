declare function findPathWASM(
    grid: number[][],
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    allowDiagonal: boolean,
    heuristic: string
): number[][] | null;
