# Lightspeed A*

A high-performance A* pathfinding library for web applications, built with Go and compiled to WebAssembly.

## Overview

This project implements the A* algorithm in Go to leverage its performance and strong typing, exposing the method to the browser via WebAssembly. It includes a TypeScript wrapper to interact with the WASM module easily, potentially within a Web Worker.

## Project Structure

- `main.go`: The entry point for the WASM module. It bridges the Go `astar` package with the JavaScript runtime.
- `astar/`: The core Go package containing the A* algorithm implementation.
    - `astar.go`: Main logic and grid representation.
    - `astar_test.go`: Unit tests.
- `src/`: TypeScript source code for the client-side wrappers.
    - `worker.ts`: The Web Worker entry point. It handles the lifecycle of the WASM module:
        - Imports the `wasm_exec.js` bridge.
        - Instantiates the `astar.wasm` module.
        - Listens for `findPath` messages and invokes the exposed Go function.
    - `AStarWorker.ts`: Main class for interacting with the worker.
    - `wasm_exec.js`: The Go WASM execution shim (required to run Go WASM).
- `dist/`: Build artifacts (compiled JS and WASM).

## Design Decisions

- **Go & WebAssembly**: Chosen for superior performance over pure JavaScript for CPU-intensive pathfinding tasks, especially on large grids.
- **Web Workers**: Designed to run off the main thread to prevent UI blocking during calculation.
- **Typed Interface**: TypeScript wrappers ensure type safety when interacting with the untyped WASM boundary.
- **Customizable**: Supports custom heuristics and neighbor calculation via WASM imports (`//go:wasmimport`).

## Custom Heuristics and Neighbors

You can provide your own logic for heuristic calculation and neighbor retrieval by defining custom functions in the WASM `importObject`.

### Requirements

When instantiating the WASM module, provide the following in the `env` module:

To use it, pass `"custom"` as the heuristic option. You can also provide an optional path to a custom WASM module that exports the logic.

```javascript
const astar = new AStarWorker("worker.js", {
  customWasmPath: "my-custom-logic.wasm",
  heuristic: "custom" 
});

// grid must be of type Grid: { nodes: Int32Array, width: number, height: number }
astar.setGrid(grid);
const path = await astar.findPath(startX, startY, endX, endY);
```

See [examples/custom-heuristic/README.md](file:///home/saqib/workspace/lightspeed-astar/examples/custom-heuristic/README.md) for details on the WASM export requirements.

## Benchmarking

A dedicated interactive benchmark tool is provided to test performance and correctness visually.

- **Source**: `benchmark/index.html` (The source file)
- **Build Output**: `dist/index.html` (The runnable file, copied during build)
- **Features**:
    - Interactive Canvas grid (Draw Walls, Set Start/End)
    - Real-time pathfinding visualization
    - Performance timing (ms)

## Usage

Import the worker wrapper and create a new instance.

```typescript
import { AStarWorker, createGridBuffer } from './library.js';

const astar = new AStarWorker("worker.js", { 
    diagonalMovement: false, 
    heuristic: "manhattan" 
});

// Option 1: Using the utility to convert 2D array
const grid = createGridBuffer(my2DArray);
astar.setGrid(grid);

// Option 2: Providing a pre-allocated Int32Array (e.g. SharedArrayBuffer)
astar.setGrid({
    nodes: myInt32Array,
    width: 20,
    height: 20
});

const path = await astar.findPath(startX, startY, endX, endY);
```

## Development Processes

### Prerequisites

- **Go**: Version 1.25.5 or later, OR **TinyGo 0.30+** (Recommended).
- **Node.js**: For package management and building the JS wrapper.

### Building parts

The project consists of two build steps: the Go WASM binary and the TypeScript glue code.

#### 1. Build WebAssembly

Compile the Go code into a `.wasm` binary.

```bash
GOOS=js GOARCH=wasm go build -o astar.wasm main.go
```

#### 2. Build JavaScript

Use Webpack to bundle the TypeScript sources.

```bash
npm install
npm run build
```

### Testing

Run the Go unit tests for the core logic:

```bash
go test ./astar
```

### WASM Specifics

This project relies on `wasm_exec.js` to bridge the Go runtime with the browser.

- **What it is**: A JavaScript file provided by the Go installation that initializes the Go WASM environment (`Go` global object).
- **Where it comes from**: It is located in your Go installation at `$GOROOT/misc/wasm/wasm_exec.js`.
- **Integration**: It is bundled into the worker code during the build process, so no manual script tag is needed.

```typescript
// Internal logic (handled by worker.ts)
const go = new Go();
WebAssembly.instantiateStreaming(fetch("astar.wasm"), go.importObject).then((result) => {
    go.run(result.instance);
});
```
