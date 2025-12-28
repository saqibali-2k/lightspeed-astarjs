# Custom Heuristic Example

This example demonstrates how to use the custom heuristic and neighbors support in `lightspeed-astar`.

## Usage

```javascript
import { AStarWorker } from './library.js';

// 1. Initialize the worker with the path to your custom WASM module and options
const astar = new AStarWorker("worker.js", {
  customWasmPath: "my-logic.wasm",
  diagonalMovement: false, 
  heuristic: "custom" 
});

// 2. Set the grid (must be Int32Array)
astar.setGrid(grid);

// 3. Find the path
const path = await astar.findPath(startX, startY, endX, endY);

```

## Your Custom WASM Module (`my-logic.wasm`)

Your module should export functions with these specific names:

```rust
// Example in Rust/Wasm
#[no_mangle]
pub fn custom_heuristic(grid_ptr: u32, width: i32, height: i32, cur_x: i32, cur_y: i32, prev_x: i32, prev_y: i32, start_x: i32, start_y: i32, end_x: i32, end_y: i32) -> f64 {
    // Your logic here
    0.0
}

#[no_mangle]
pub fn custom_get_neighbors(grid_ptr: u32, width: i32, height: i32, x: i32, y: i32, prev_x: i32, prev_y: i32, buffer_ptr: u32) -> i32 {
    // Your logic here
    0
}
```

The `AStarWorker` will automatically load your module and use these exports for the A* calculation. If you don't provide a module, the worker will use default Manhattan/orthogonal stubs.
