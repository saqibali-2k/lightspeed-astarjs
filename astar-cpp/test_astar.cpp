#include <iostream>
#include <vector>
#include <cassert>
#include <cmath>
#include <cstring>
#include <cstdint>
#include "astar.hpp"

// Global mock control
bool g_mockAllowDiagonal = false;

// Mock external functions needed by astar.cpp
extern "C" {
    double custom_heuristic(uintptr_t gridPtr, int32_t width, int32_t height, 
                           int32_t currentX, int32_t currentY, 
                           int32_t prevX, int32_t prevY, 
                           int32_t startX, int32_t startY, 
                           int32_t endX, int32_t endY) {
        // Simple mock: just Euclidean distance
        double dx = std::abs(currentX - endX);
        double dy = std::abs(currentY - endY);
        return std::sqrt(dx * dx + dy * dy);
    }
    
    int32_t custom_get_neighbors(uintptr_t gridPtr, int32_t width, int32_t height, 
                                 int32_t x, int32_t y, 
                                 int32_t prevX, int32_t prevY, 
                                 uintptr_t bufferPtr) {
        // Simple mock: 4 or 8 neighbors
        int32_t* neighbors = (int32_t*)bufferPtr;
        int count = 0;
        // Directions: N, E, S, W, NE, SE, SW, NW
        const int dx[] = {0, 1, 0, -1, 1, 1, -1, -1};
        const int dy[] = {1, 0, -1, 0, 1, -1, 1, -1};
        
        int limit = g_mockAllowDiagonal ? 8 : 4;
        
        // This mock assumes access to grid data via the pointer, which is a bit unsafe 
        // without more structure, but valid for what astar.cpp expects (pointer casting).
        // For testing, we might want to just verify the mechanism or pass valid known data.
        // But astar.cpp passes grid.rawData.
        const int32_t* gridData = (const int32_t*)gridPtr;

        for(int i=0; i<limit; ++i) {
            int nx = x + dx[i];
            int ny = y + dy[i];
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                 if (gridData[ny * width + nx] == 0) { // 0 is walkable
                     neighbors[count*2] = nx;
                     neighbors[count*2+1] = ny;
                     count++;
                 }
            }
        }
        return count;
    }
}

void printGrid(const astar::Grid& grid, const std::vector<astar::Point>& path) {
    std::vector<char> display(grid.width * grid.height, '.');
    for(int y=0; y<grid.height; ++y) {
        for(int x=0; x<grid.width; ++x) {
            if (grid.rawData[y*grid.width + x] != 0) {
                display[y*grid.width+x] = '#';
            }
        }
    }
    for(const auto& p : path) {
        display[p.y * grid.width + p.x] = '*';
    }
    
    for(int y=0; y<grid.height; ++y) {
        for(int x=0; x<grid.width; ++x) {
            std::cout << display[y*grid.width + x] << " ";
        }
        std::cout << "\n";
    }
}

void runTest(const std::string& name, astar::HeuristicType heuristic, int width, int height, const std::vector<int32_t>& gridData, 
             int sx, int sy, int ex, int ey, bool expectPath, bool allowDiagonal, double expectedCost = -1.0) {
    std::string heuristicName;
    switch(heuristic) {
        case astar::HeuristicType::Manhattan: heuristicName = "Manhattan"; break;
        case astar::HeuristicType::Euclidean: heuristicName = "Euclidean"; break;
        case astar::HeuristicType::Custom: heuristicName = "Custom"; break;
    }
    std::cout << "Running Test: " << name << " [" << heuristicName << "] ... ";
    
    astar::Grid grid(width, height, gridData.data());
    astar::Options opts;
    opts.allowDiagonal = allowDiagonal;
    g_mockAllowDiagonal = allowDiagonal;
    opts.heuristic = heuristic;

    auto path = astar::FindPath(sx, sy, ex, ey, grid, opts);

    if (expectPath) {
        if (path.empty()) {
            std::cout << "FAILED! Expected path but got none.\n";
            exit(1);
        }
        // Basic check: start and end
        if (path.front().x != sx || path.front().y != sy) {
             std::cout << "FAILED! Path start mismatch.\n";
             exit(1);
        }
        if (path.back().x != ex || path.back().y != ey) {
             std::cout << "FAILED! Path end mismatch.\n";
             exit(1);
        }
        
        // Optimality check
        if (expectedCost >= 0) {
            // Calculate path length
            double actualCost = 0;
            for (size_t i = 0; i < path.size() - 1; ++i) {
                double dx = path[i+1].x - path[i].x;
                double dy = path[i+1].y - path[i].y;
                actualCost += std::sqrt(dx*dx + dy*dy);
            }
            
            // Using a tolerance just in case
            if (std::abs(actualCost - expectedCost) > 1e-4) {
                std::cout << "FAILED! Cost mismatch. Expected " << expectedCost << ", got " << actualCost << "\n";
                // For debugging
                // printGrid(grid, path);
                exit(1);
            }
        }
        
        std::cout << "PASSED (Length: " << path.size() << ")\n";
    } else {
        if (!path.empty()) {
            std::cout << "FAILED! Expected no path but found one.\n";
            printGrid(grid, path);
            exit(1);
        }
        std::cout << "PASSED (No path)\n";
    }
}

int main() {
    std::vector<astar::HeuristicType> heuristics = {
        astar::HeuristicType::Manhattan,
        astar::HeuristicType::Euclidean,
        astar::HeuristicType::Custom
    };

    for (const auto& h : heuristics) {
        // 1. Basic Path
        {
            std::vector<int32_t> gridData = {
                0, 0, 0,
                0, 0, 0,
                0, 0, 0
            };
            // Expected cost from (0,0) to (2,2) with Manhattan is 4 steps (e.g. R, R, D, D)
            runTest("Basic Path 3x3", h, 3, 3, gridData, 0, 0, 2, 2, true, false, 4.0);
        }

        // 1.5 Diagonal Path
        {
             std::vector<int32_t> gridData = {
                0, 0, 0,
                0, 0, 0,
                0, 0, 0
            };
            // (0,0) -> (2,2)
            // Path: (0,0) -> (1,1) -> (2,2)
            // Cost: sqrt(2) * 2 ~= 2.828427
            runTest("Diagonal Path 3x3", h, 3, 3, gridData, 0, 0, 2, 2, true, true, 2.828427);
        }

        // 2. Obstacle Avoidance
        {
            /*
              S . .
              # # .
              E . .
            */
            std::vector<int32_t> gridData = {
                0, 0, 0,
                1, 1, 0,
                0, 0, 0
            };
            // 0,0 -> 1,0 -> 2,0 -> 2,1 -> 2,2 -> 1,2 -> 0,2
            // Length 7 nodes, cost 6.
            runTest("Obstacle Avoidance", h, 3, 3, gridData, 0, 0, 0, 2, true, false, 6.0);
        }
        
        // 3. No Path
        {
            /*
              S # E
              # # #
              . . .
            */
            std::vector<int32_t> gridData = {
                0, 1, 0,
                1, 1, 1,
                0, 0, 0
            };
            runTest("No Path", h, 3, 3, gridData, 0, 0, 2, 0, false, false);
        }
        
        // 4. Start == End
        {
             std::vector<int32_t> gridData = {0};
             runTest("Start == End", h, 1, 1, gridData, 0, 0, 0, 0, true, false, 0.0);
        }

        // 5. Start/End on Obstacle
        {
            std::vector<int32_t> gridData = {1, 0};
            runTest("Start on Obstacle", h, 2, 1, gridData, 0, 0, 1, 0, false, false);
            runTest("End on Obstacle", h, 2, 1, gridData, 1, 0, 0, 0, false, false);
        }

        // 6. Large Grid (Basic Perf/Correctness)
        {
            int w = 100;
            int h_dim = 100;
            std::vector<int32_t> gridData(w * h_dim, 0);
            // Add a vertical wall in the middle with a gap at the bottom
            for(int y=0; y<h_dim-1; ++y) {
                gridData[y * w + w/2] = 1; 
            }
            // (0,0) -> (99,0) with wall at x=50, gap at y=99.
            // Cost 297.
            runTest("Large Grid with Wall", h, w, h_dim, gridData, 0, 0, 99, 0, true, false, 297.0);
        }
        std::cout << "--------------------------------------------------\n";
    }

    std::cout << "All tests passed!\n";
    return 0;
}
