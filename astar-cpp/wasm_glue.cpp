#include "astar.hpp"
#include <emscripten.h>
#include <vector>
#include <cstring>
#include <cstdlib>

extern "C" {

static std::vector<int32_t> resultPath;
static std::vector<int32_t> persistentGridBuffer;

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
 */
EMSCRIPTEN_KEEPALIVE
int32_t* findPathWASM(
    int32_t width, int32_t height,
    int32_t startX, int32_t startY,
    int32_t endX, int32_t endY,
    int32_t allowDiagonal,
    int32_t heuristicType,
    int32_t useCustomNeighbors,
    int32_t useCustomHeuristicH,
    int32_t useCustomHeuristicG
) {
    if (persistentGridBuffer.size() < size_t(width * height)) {
        return nullptr;
    }

    
    // auto grid = std::make_unique<astar::Grid>(width, height, persistentGridBuffer.data());
    astar::Grid grid(width, height, persistentGridBuffer.data());
    using U = std::underlying_type_t<astar::HeuristicType>;
    int8_t hType = (useCustomHeuristicH ? static_cast<U>(astar::HeuristicType::CustomH) : 0) |
                   (useCustomHeuristicG ? static_cast<U>(astar::HeuristicType::CustomG) : 0) | 
                   (heuristicType & static_cast<U>(astar::HeuristicType::Euclidean)) |
                   (heuristicType & static_cast<U>(astar::HeuristicType::Manhattan));

    astar::Options opts = {
        static_cast<astar::HeuristicType>(hType),
        allowDiagonal != 0,
        useCustomNeighbors != 0
    };

    auto path = astar::findPath(startX, startY, endX, endY, grid, opts);
    if (path.empty()) {
        return nullptr;
    }

    // Gather result
    resultPath.clear();
    resultPath.push_back(static_cast<int32_t>(path.size()));
    for (const auto& p : path) {
        resultPath.push_back(p.x);
        resultPath.push_back(p.y);
    }

    return resultPath.data();
}

} // extern "C"
