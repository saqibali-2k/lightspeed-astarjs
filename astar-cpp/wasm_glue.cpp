#include "astar.hpp"
#include <emscripten.h>
#include <vector>
#include <cstring>
#include <cstdlib>

extern "C" {

static std::vector<int32_t> resultPath;
static std::vector<int32_t> persistentGridBuffer;
static std::unique_ptr<astar::Grid> globalGrid;

/**
 * getGridBufferWASM ensures the persistent buffer is large enough
 * and returns its pointer.
 */
EMSCRIPTEN_KEEPALIVE
int32_t* getGridBufferWASM(int width, int height) {
    persistentGridBuffer.resize(width * height);
    return persistentGridBuffer.data();
}

/**
 * findPathWASM is the main entry point called from JS.
 * It uses the persistent globalGrid.
 */
EMSCRIPTEN_KEEPALIVE
int32_t* findPathWASM(int width, int height, 
                    int startX, int startY, int endX, int endY, 
                    bool allowDiagonal, int heuristicType, bool useCustomNeighbors) {
    
    auto grid = std::make_unique<astar::Grid>(width, height, persistentGridBuffer.data());
    if (!grid || grid->width != width || grid->height != height) {
        return nullptr;
    }

    // 1. Configure options
    astar::HeuristicType hType = static_cast<astar::HeuristicType>(heuristicType);
    astar::Options opts = {
        allowDiagonal,
        hType,
        useCustomNeighbors
    };

    // 2. Calculate path
    auto path = astar::FindPath(startX, startY, endX, endY, *grid, opts);

    // 3. Handle result
    if (path.empty()) {
        return nullptr;
    }

    resultPath.clear();
    resultPath.push_back(static_cast<int32_t>(path.size()));
    for (const auto& p : path) {
        resultPath.push_back(p.x);
        resultPath.push_back(p.y);
    }

    return resultPath.data();
}

} // extern "C"
