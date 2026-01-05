# Lightspeed-AStar.js

A high-performance A* pathfinding library for web applications, built with C++ and compiled to WebAssembly for maximum speed.

[https://saqib-ali.com/lightspeed-astarjs/](https://saqib-ali.com/lightspeed-astarjs/)

## Overview

This project implements the A* algorithm in C++ to leverage its raw performance and direct memory management, exposing the functionality to the browser via WebAssembly. It includes a TypeScript wrapper that runs the WASM module in a Web Worker, ensuring your main thread remains unblocked even during complex pathfinding operations.

**Key Features:**
- **C++ Performance**: Core logic compiled to optimized WebAssembly.
- **Customizable**: Support for custom heuristics and neighbor logic via WASM side module.
- **Non-blocking**: Pathfinding operations run in a Web Worker, keeping the main thread responsive.
- **Simple Configuration**: Library entry-point, worker, and WASM logic is bundled into a single file.

## Installation

```bash
npm install lightspeed-astar
```
OR

```html
<script type="module">
  import { AStarWorker, createGridBuffer } from "https://cdn.jsdelivr.net/npm/lightspeed-astarjs@latest/+esm";
</script>
```


## Usage

### Basic Pathfinding

1. **Import and Initialize**:
   Create an instance of `AStarWorker`. You need to point it to the worker script (usually bundled with your app).

   ```typescript
   import { AStarWorker, createGridBuffer } from 'lightspeed-astar';

   const astar = new AStarWorker();
   ```

2. **Prepare the Grid**:
   For maximum performance, the grid uses a `SharedArrayBuffer` (passed as an `Int32Array`). A helper function `createGridBuffer` is provided to convert standard 2D arrays.

   ```typescript
   const myGrid = [
       [0, 0, 0, 1, 0],
       [0, 1, 0, 1, 0],
       [0, 0, 0, 0, 0]
   ];

   // Convert to Int32Array backed by SharedArrayBuffer
   const gridData = createGridBuffer(myGrid);

   // Send grid to the worker (only needs to be done once or when grid changes)
   astar.setGrid(gridData);
   ```

   *Note: `0` represents a walkable tile, `1` represents an obstacle.*

3. **Find a Path**:
   Call `findPath` with start and end coordinates.

   ```typescript
   try {
       const path = await astar.findPath(0, 0, 4, 2);
       console.log("Path found:", path); // [[0,0], [0,1], ...]
   } catch (error) {
       console.error("No path found or error occurred:", error);
   }
   ```

### Configuration Options

You can configure the behavior via the `AStarWorker` constructor.

```typescript
const astar = new AStarWorker({
    traversalOptions: {
        allowDiagonal: true // Allow diagonal movement
    },
    heuristicOptions: {
        heuristic: "euclidean" // "manhattan" (default) or "euclidean"
    }
});
```

### Advanced: Custom Heuristics

You can provide custom heuristic logic implemented as a WASM side module. See [examples/custom-heuristic](./examples/custom-heuristic) for an example.

## Supported Environments

### Browser

Works well out of the box, nothing much to say here.

### Node.js

Limited support, but you can get it working with some extra steps. You'll need to pollyfill and mock some APIs (which is hacky) but we were able to get this working for node testing. 

See `test/wasm_integration.node.ts` for an example of how to do this.

## Project Structure

- `src/`: TypeScript source code for the client-side library.
    - `worker.ts`: The Web Worker entry point handling WASM instantiation and communication.
    - `AStarWorker.ts`: The main class for user interaction.
- `astar-cpp/`: The core C++ source code.
    - `astar.cpp`: A* algorithm implementation.
    - `wasm_glue.cpp`: Interface between C++ and JavaScript.
- `dist/`: Build artifacts (transpiled JS and compiled WASM).
- `examples/`: Usage examples.

## Development

### Prerequisites

- **Node.js**: For building the TypeScript wrapper.
- **Emscripten**: For compiling C++ to WebAssembly. Only necessary if modifying the C++ code.

### Build Instructions

1. **Initialize Emscripten and install it's dependencies**:
   ```bash
   git submodule update --init
   cd emsdk
   ./emsdk install latest
   ./emsdk activate latest
   ```

2. **Install JS Dependencies**:
   ```bash
   npm install
   ```

3. **Build**:
   This command sets up the Emscripten environment, compiles the C++ code to `dist/astar.wasm`, and bundles the TypeScript code. The output is just a single file that can be included in your project.
   ```bash
   npm run build
   ```

### Testing

- **Unit Tests (Node.js)**:
  ```bash
  npm run test:node
  ```
- **Browser Tests**:
  ```bash
  npm run test:browser
  ```
- **C++ Tests**:
  ```bash
  make test
  ```

# Future Enhancements

If people are interested...

- Support for multiple types of obstacles
    - This is currently possible if you use custom logic through a WASM side module, but let's support a JS only way of doing this
- Multi-threading (probably a meet-in-the-middle approach)
