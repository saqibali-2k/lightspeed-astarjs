import { AStarWorker } from "../dist/index.mjs";

async function fetchWasm(url: string) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch WASM: ${response.status}`);
    }
    return await response.arrayBuffer();
}

class BenchmarkApp {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private grid: Int32Array = new Int32Array(0);
    private width: number = 20;
    private height: number = 20;
    private cellSize: number = 20;

    private startPos = { x: 0, y: 0 };
    private endPos = { x: 19, y: 19 };

    private mode: "wall" | "start" | "end" | "clear" = "wall";
    private isDrawing: boolean = false;

    private astar: AStarWorker;

    constructor(customLogic?: ArrayBuffer) {
        this.canvas = document.getElementById("gridCanvas") as HTMLCanvasElement;
        this.ctx = this.canvas.getContext("2d")!;
        this.astar = new AStarWorker({
            customWasm: customLogic,
            heuristicOptions: { heuristic: "custom", useCustomHeuristicG: true, useCustomHeuristicH: true }
        });
        // this.astar = new AStarWorker({ customWasm: customLogic, heuristicOptions: { heuristic: "manhattan" } });

        this.resizeGrid(20, 20);
        this.setupInputHandlers();
    }

    private setupInputHandlers() {
        // Mode buttons
        document.getElementById("btnWall")!.onclick = () => this.setMode("wall");
        document.getElementById("btnStart")!.onclick = () => this.setMode("start");
        document.getElementById("btnEnd")!.onclick = () => this.setMode("end");
        document.getElementById("btnClearCell")!.onclick = () => this.setMode("clear");
        document.getElementById("btnReset")!.onclick = () => this.resizeGrid(this.width, this.height);
        document.getElementById("btnRun")!.onclick = () => this.runBenchmark();
        document.getElementById("btnStress")!.onclick = () => this.runStressTest();

        // Resize inputs
        const widthInput = document.getElementById("gridWidth") as HTMLInputElement;
        const heightInput = document.getElementById("gridHeight") as HTMLInputElement;

        widthInput.onchange = () => this.resizeGrid(parseInt(widthInput.value), this.height);
        heightInput.onchange = () => this.resizeGrid(this.width, parseInt(heightInput.value));

        // Canvas interactions
        this.canvas.addEventListener("mousedown", (e) => {
            this.isDrawing = true;
            this.handleDraw(e);
        });

        this.canvas.addEventListener("mousemove", (e) => {
            if (this.isDrawing) this.handleDraw(e);
        });

        this.canvas.addEventListener("mouseup", () => this.isDrawing = false);
        this.canvas.addEventListener("mouseleave", () => this.isDrawing = false);
    }

    private setMode(mode: "wall" | "start" | "end" | "clear") {
        this.mode = mode;
        document.getElementById("currentMode")!.innerText = "Mode: " + mode.toUpperCase();
    }

    private resizeGrid(w: number, h: number) {
        this.width = w || 20;
        this.height = h || 20;
        this.canvas.width = this.width * this.cellSize;
        this.canvas.height = this.height * this.cellSize;

        // Init grid using SharedArrayBuffer if available
        const size = this.width * this.height;
        const buffer = typeof SharedArrayBuffer !== "undefined"
            ? new SharedArrayBuffer(size * 4)
            : new ArrayBuffer(size * 4);

        this.grid = new Int32Array(buffer);
        this.grid.fill(0);

        // Reset positions if out of bounds
        if (this.startPos.x >= this.width) this.startPos.x = 0;
        if (this.startPos.y >= this.height) this.startPos.y = 0;
        if (this.endPos.x >= this.width) this.endPos.x = this.width - 1;
        if (this.endPos.y >= this.height) this.endPos.y = this.height - 1;

        this.draw();
    }

    private handleDraw(e: MouseEvent) {
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / this.cellSize);
        const y = Math.floor((e.clientY - rect.top) / this.cellSize);

        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;

        if (this.mode === "wall") {
            this.grid[y * this.width + x] = 1;
        } else if (this.mode === "clear") {
            this.grid[y * this.width + x] = 0;
        } else if (this.mode === "start") {
            this.startPos = { x, y };
            this.grid[y * this.width + x] = 0; // Ensure walkable
        } else if (this.mode === "end") {
            this.endPos = { x, y };
            this.grid[y * this.width + x] = 0; // Ensure walkable
        }

        this.draw();
    }

    private draw(path: number[][] = []) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw grid
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                this.ctx.strokeStyle = "#ccc";
                this.ctx.strokeRect(x * this.cellSize, y * this.cellSize, this.cellSize, this.cellSize);

                if (this.grid[y * this.width + x] === 1) {
                    this.ctx.fillStyle = "#333";
                    this.ctx.fillRect(x * this.cellSize, y * this.cellSize, this.cellSize, this.cellSize);
                }
            }
        }

        // Draw Start
        this.ctx.fillStyle = "green";
        this.ctx.fillRect(this.startPos.x * this.cellSize, this.startPos.y * this.cellSize, this.cellSize, this.cellSize);

        // Draw End
        this.ctx.fillStyle = "red";
        this.ctx.fillRect(this.endPos.x * this.cellSize, this.endPos.y * this.cellSize, this.cellSize, this.cellSize);

        // Draw Path
        if (path && path.length > 0) {
            this.ctx.fillStyle = "rgba(0, 100, 255, 0.5)";
            for (const [px, py] of path) {
                // Don't cover start/end
                if ((px === this.startPos.x && py === this.startPos.y) ||
                    (px === this.endPos.x && py === this.endPos.y)) continue;

                this.ctx.fillRect(px * this.cellSize, py * this.cellSize, this.cellSize, this.cellSize);
            }
        }
    }

    private async runBenchmark() {
        const status = document.getElementById("status")!;
        const output = document.getElementById("output")!;
        const algoSelect = document.getElementById("algoSelect") as HTMLSelectElement;
        const algo = algoSelect.value || "lightspeed";

        status.innerText = "Running...";
        output.innerText = "";

        try {
            let path: number[][] | any = [];
            let duration = 0;

            if (algo === "lightspeed") {
                this.astar.setGrid({
                    nodes: this.grid,
                    width: this.width,
                    height: this.height
                });
                const start = performance.now();
                path = await this.astar.findPath(this.startPos.x, this.startPos.y, this.endPos.x, this.endPos.y);
                const end = performance.now();
                duration = end - start;
            } else if (algo === "fast-astar") {
                // @ts-ignore
                const { Grid, Astar } = await import("fast-astar");

                const fGrid = new Grid({ col: this.width, row: this.height });
                // Populate grid
                for (let y = 0; y < this.height; y++) {
                    for (let x = 0; x < this.width; x++) {
                        if (this.grid[y * this.width + x] === 1) {
                            fGrid.set([x, y], 'value', 1);
                        }
                    }
                }

                const fAstar = new Astar(fGrid);

                const start = performance.now();
                path = fAstar.search(
                    [this.startPos.x, this.startPos.y],
                    [this.endPos.x, this.endPos.y],
                    { rightAngle: true, optimalResult: false }
                );
                const end = performance.now();
                duration = end - start;
            } else if (algo === "easystar") {
                const { js: EasyStarJS } = await import("easystarjs");
                const easystar = new EasyStarJS();

                // EasyStar expects 2D array
                const esGrid: number[][] = [];
                for (let y = 0; y < this.height; y++) {
                    esGrid[y] = [];
                    for (let x = 0; x < this.width; x++) {
                        esGrid[y][x] = this.grid[y * this.width + x];
                    }
                }
                easystar.setGrid(esGrid);
                easystar.setAcceptableTiles([0]);

                const start = performance.now();
                const esPath: any = await new Promise(resolve => {
                    easystar.findPath(this.startPos.x, this.startPos.y, this.endPos.x, this.endPos.y, (p) => {
                        resolve(p);
                    });
                    easystar.calculate();
                });
                const end = performance.now();
                duration = end - start;
                path = esPath ? esPath.map((p: any) => [p.x, p.y]) : null;
            }

            status.innerText = `Done in ${duration.toFixed(2)}ms (${algo})`;

            if (!path || path.length === 0) {
                output.innerText = "No path found";
                this.draw([]);
            } else {
                output.innerText = `Path Length: ${path.length}`;
                this.draw(path);
            }

        } catch (e: any) {
            status.innerText = "Error: " + e.message;
            console.error(e);
        }
    }

    private async runStressTest() {
        const table = document.getElementById("stressTable")!;
        const tbody = document.getElementById("stressBody")!;
        const status = document.getElementById("status")!;

        table.style.display = "table";
        tbody.innerHTML = ""; // Clear previous
        status.innerText = "Running Stress Test...";

        const sizes = [20, 80, 130, 500, 1000];

        // Dynamically import benchmark libraries
        // @ts-ignore
        const { Grid, Astar } = await import("fast-astar");
        const { js: EasyStarJS } = await import("easystarjs");

        for (const size of sizes) {
            // Scenario 1: Simple
            await this.runScenario(size, "Simple", [], Grid, Astar, EasyStarJS, tbody);

            // Scenario 2: Exhaustive
            const wallsExhaustive = [
                [size - 3, size - 1],
                [size - 3, size - 2],
                [size - 1, size - 3],
                [size - 2, size - 3]
            ];
            await this.runScenario(size, "Exhaustive", wallsExhaustive, Grid, Astar, EasyStarJS, tbody);

            // Scenario 3: Complex (Arc around end)
            // Creates a semi-circle blocking the end, forcing a go-around or finding the gap.
            // Radius approx size/3.
            const wallsComplex: number[][] = [];

            const cx = size - 1; // EndX
            const cy = size - 1; // EndY
            const radius = Math.floor(size / 3);

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    // Safety skip start/end
                    if ((x === 0 && y === 0) || (x === cx && y === cy)) continue;

                    // Determine if point is on the arc
                    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);

                    // Wall thickness approx 1
                    if (Math.abs(dist - radius) < 1.5) {
                        // Leave a gap at the "Left" side relative to circle center?
                        // e.g. where y is close to cy
                        if (Math.abs(y - cy) < 2 && x < cx) continue;

                        wallsComplex.push([x, y]);
                    }
                }
            }
            await this.runScenario(size, "Complex", wallsComplex, Grid, Astar, EasyStarJS, tbody);
        }

        status.innerText = "Stress Test Complete";
        document.getElementById("benchmarkExplanation")!.style.display = "block";
    }

    private async runScenario(size: number, name: string, walls: number[][], FastGrid: any, FastAstar: any, EasyStarJS: any, tbody: HTMLElement) {
        const row = document.createElement("tr");
        row.innerHTML = `<td>${size}x${size}</td><td>${name}</td><td id="ls-${size}-${name}">...</td><td id="es-${size}-${name}">...</td><td id="fa1-${size}-${name}">...</td><td id="fa2-${size}-${name}">...</td>`;
        tbody.appendChild(row);

        // Allow UI to render
        await new Promise(r => setTimeout(r, 10));

        const startX = 0, startY = 0;
        const endX = size - 1, endY = size - 1;

        // 1. Lightspeed A* (WASM)
        try {
            // Build grid data for LS
            const buf = typeof SharedArrayBuffer !== "undefined"
                ? new SharedArrayBuffer(size * size * 4)
                : new ArrayBuffer(size * size * 4);
            const gridData = new Int32Array(buf);
            walls.forEach(([x, y]) => { if (y < size && x < size) gridData[y * size + x] = 1; });

            this.astar.setGrid({
                nodes: gridData,
                width: size,
                height: size
            });

            const t0 = performance.now();
            const path = await this.astar.findPath(startX, startY, endX, endY);
            const t1 = performance.now();

            const len = path ? path.length : 0;
            document.getElementById(`ls-${size}-${name}`)!.innerText = `${(t1 - t0).toFixed(2)} ms (Path Length:${len})`;
        } catch (e) {
            document.getElementById(`ls-${size}-${name}`)!.innerText = "Error";
            console.error(e);
        }

        // 2. EasyStarJS
        try {
            await new Promise(r => setTimeout(r, 10)); // Yield
            const gridData: number[][] = [];
            for (let y = 0; y < size; y++) gridData[y] = new Array(size).fill(0);
            walls.forEach(([x, y]) => { if (y < size && x < size) gridData[y][x] = 1; });

            const easystar = new EasyStarJS();
            easystar.setGrid(gridData);
            easystar.setAcceptableTiles([0]);

            const t0 = performance.now();
            const esPath: any = await new Promise(resolve => {
                easystar.findPath(startX, startY, endX, endY, (p: any) => {
                    resolve(p);
                });
                easystar.calculate();
            });
            const t1 = performance.now();
            const len = esPath ? esPath.length : 0;
            document.getElementById(`es-${size}-${name}`)!.innerText = `${(t1 - t0).toFixed(2)} ms (Path Length:${len})`;
        } catch (e) {
            document.getElementById(`es-${size}-${name}`)!.innerText = "Error";
        }

        // Helper to setup Fast-Astar
        const setupFast = () => {
            const g = new FastGrid({ col: size, row: size });
            walls.forEach(([x, y]) => { if (y < size && x < size) g.set([x, y], 'value', 1); });
            return new FastAstar(g);
        };

        // 2. Fast-Astar (Opt: Off) -> optimalResult: false
        try {
            await new Promise(r => setTimeout(r, 10)); // Yield
            const fa = setupFast();
            const t0 = performance.now();
            const path = fa.search([startX, startY], [endX, endY], { rightAngle: true, optimalResult: false });
            const t1 = performance.now();
            const len = path ? path.length : 0;
            document.getElementById(`fa1-${size}-${name}`)!.innerText = `${(t1 - t0).toFixed(2)} ms (Path Length:${len})`;
        } catch (e) {
            document.getElementById(`fa1-${size}-${name}`)!.innerText = "Error";
        }

        // 3. Fast-Astar (Opt: On) -> optimalResult: true
        try {
            await new Promise(r => setTimeout(r, 10)); // Yield
            const fa = setupFast();
            const t0 = performance.now();
            const path = fa.search([startX, startY], [endX, endY], { rightAngle: true, optimalResult: true });
            const t1 = performance.now();
            const len = path ? path.length : 0;
            document.getElementById(`fa2-${size}-${name}`)!.innerText = `${(t1 - t0).toFixed(2)} ms (Path Length:${len})`;
        } catch (e) {
            document.getElementById(`fa2-${size}-${name}`)!.innerText = "Error";
        }
    }
}

// Init
fetchWasm("custom_logic.wasm").then(wasm => new BenchmarkApp(wasm));
