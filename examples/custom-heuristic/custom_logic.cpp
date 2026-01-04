#include <cstdint>
#include <cmath>
#include <algorithm>

extern "C" {

/**
 * custom_heuristic: Manhattan distance + punishment for bends.
 */
double custom_heuristic_g(uintptr_t gridPtr, int32_t width, int32_t height, 
                       int32_t curX, int32_t curY, 
                       int32_t prevX, int32_t prevY, 
                       int32_t prevPrevX, int32_t prevPrevY,
                       int32_t startX, int32_t startY, 
                       int32_t endX, int32_t endY) {
    
    double h = 0;

    // Punish bends
    if (prevPrevX != -1) {
        int dx1 = prevX - prevPrevX;
        int dy1 = prevY - prevPrevY;
        int dx2 = curX - prevX;
        int dy2 = curY - prevY;

        if (dx1 != dx2 || dy1 != dy2) {
            h += 10.0; // High punishment for turns
        }
    }

    return h;
}

double custom_heuristic_h(uintptr_t gridPtr, int32_t width, int32_t height, 
                       int32_t curX, int32_t curY, 
                       int32_t prevX, int32_t prevY, 
                       int32_t prevPrevX, int32_t prevPrevY,
                       int32_t startX, int32_t startY, 
                       int32_t endX, int32_t endY) {
    
    return std::abs(curX - endX) + std::abs(curY - endY);
}

/**
 * custom_get_neighbors: Only return nodes that are not 1 or 2.
 */
int32_t custom_get_neighbors(uintptr_t gridPtr, int32_t width, int32_t height, 
                             int32_t x, int32_t y, 
                             int32_t prevX, int32_t prevY, 
                             uintptr_t bufferPtr) {
    const int32_t* grid = reinterpret_cast<const int32_t*>(gridPtr);
    int32_t* buffer = reinterpret_cast<int32_t*>(bufferPtr);
    
    int32_t count = 0;
    static const int dx[] = {0, 1, 0, -1};
    static const int dy[] = {1, 0, -1, 0};

    for (int i = 0; i < 4; ++i) {
        int nx = x + dx[i];
        int ny = y + dy[i];

        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            int32_t val = grid[ny * width + nx];
            // Treat both 1 and 2 as obstacles
            if (val != 1 && val != 2) {
                buffer[count * 2] = nx;
                buffer[count * 2 + 1] = ny;
                count++;
            }
        }
    }

    return count;
}

} // extern "C"
