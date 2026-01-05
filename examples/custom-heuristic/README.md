# Custom Heuristic Example

This example demonstrates how to use the custom heuristic and neighbors support in `lightspeed-astar`.

You can inject your own pathfinding logic into the WASM module by providing a "side module" compiled from C++. This allows you to override:
- `g` cost calculation (cost from start node)
- `h` cost calculation (heuristic estimate to end node)
- Neighbor generation (which nodes are accessible from a given node)

## Usage

### 1. Create your C++ Logic

Write your custom logic in C++ or some other language that can be compiled to WASM. See [`custom_logic.cpp`](./custom_logic.cpp) for a full example.

Your functions must extract the required arguments and return the expected types.

### 2. Compile to WASM Side Module

Use `emcc` (Emscripten) to compile your C++ code into a standalone WASM module.

```bash
emcc custom_logic.cpp -o custom_logic.wasm \
  -O3 \
  -s SIDE_MODULE=2 \
  -s EXPORTED_FUNCTIONS='["_custom_heuristic_g", "_custom_heuristic_h", "_custom_get_neighbors"]' \
  -s STANDALONE_WASM \
  -s ALLOW_MEMORY_GROWTH=1 \
  --no-entry
```

### 3. Load in JavaScript

Pass the compiled WASM binary (as an `ArrayBuffer` or Base64 string) to the `AStarWorker`.

```typescript
import { AStarWorker } from 'lightspeed-astar';

// Fetch the WASM file
const response = await fetch('custom_logic.wasm');
const wasmBuffer = await response.arrayBuffer();

// Initialize worker with custom options
const astar = new AStarWorker({
    customWasm: wasmBuffer,
    heuristicOptions: {
        heuristic: "custom",
        useCustomHeuristicG: true,
        useCustomHeuristicH: true
    },
    traversalOptions: {
        useCustomNeighbors: true
    }
});

// Use as normal
astar.setGrid(myGrid);
const path = await astar.findPath(0, 0, 10, 10);
```
