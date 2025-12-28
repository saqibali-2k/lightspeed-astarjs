#include "astar.hpp"
#include <cmath>
#include <algorithm>
#include <cstdint>

namespace astar {

// External "Custom" functions (imports)
extern "C" {
    double custom_heuristic(uintptr_t gridPtr, int32_t width, int32_t height, 
                           int32_t currentX, int32_t currentY, 
                           int32_t prevX, int32_t prevY, 
                           int32_t startX, int32_t startY, 
                           int32_t endX, int32_t endY);
    
    int32_t custom_get_neighbors(uintptr_t gridPtr, int32_t width, int32_t height, 
                                 int32_t x, int32_t y, 
                                 int32_t prevX, int32_t prevY, 
                                 uintptr_t bufferPtr);
}

double CalculateHeuristic(Node* node, Node* prev, int sx, int sy, int ex, int ey, Grid& grid, const Options& opts) {
    if (opts.heuristic == HeuristicType::Custom) {
        int px = prev ? prev->x : -1;
        int py = prev ? prev->y : -1;
        return custom_heuristic(
            (uintptr_t)grid.rawData,
            grid.width, grid.height,
            node->x, node->y, px, py, sx, sy, ex, ey
        );
    }

    double dx = std::abs(node->x - ex);
    double dy = std::abs(node->y - ey);

    if (opts.heuristic == HeuristicType::Euclidean) {
        return std::sqrt(dx * dx + dy * dy);
    }
    // Default Manhattan
    return dx + dy;
}

std::vector<Node*> GetNeighbors(Node* node, Grid& grid, const Options& opts, std::vector<int32_t>& neighborsBuf) {
    std::vector<Node*> neighbors;
    
    if (opts.heuristic == HeuristicType::Custom) {
        int px = -1, py = -1;
        if (node->parentIdx != -1) {
            Node* parent = &grid.nodes[node->parentIdx];
            px = parent->x;
            py = parent->y;
        }

        int32_t count = custom_get_neighbors(
            (uintptr_t)grid.rawData,
            grid.width, grid.height,
            node->x, node->y, px, py,
            (uintptr_t)neighborsBuf.data()
        );

        for (int i = 0; i < count; ++i) {
            int nx = neighborsBuf[i * 2];
            int ny = neighborsBuf[i * 2 + 1];
            Node* n = grid.getNode(nx, ny);
            if (n) neighbors.push_back(n);
        }
    } else {
        static const int dx[] = {0, 1, 0, -1, 1, 1, -1, -1};
        static const int dy[] = {1, 0, -1, 0, 1, -1, 1, -1};
        int count = opts.allowDiagonal ? 8 : 4;

        for (int i = 0; i < count; ++i) {
            int nx = node->x + dx[i];
            int ny = node->y + dy[i];
            Node* n = grid.getNode(nx, ny);
            if (n && n->walkable) {
                neighbors.push_back(n);
            }
        }
    }
    return neighbors;
}

std::vector<Point> FindPath(int startX, int startY, int endX, int endY, Grid& grid, const Options& opts) {
    Node* startNode = grid.getNode(startX, startY);
    Node* endNode = grid.getNode(endX, endY);

    if (!startNode || !endNode || !startNode->walkable || !endNode->walkable) {
        return {};
    }

    BinaryHeap openList;
    std::vector<int32_t> neighborsBuf(16);

    startNode->g = 0;
    startNode->h = CalculateHeuristic(startNode, nullptr, startX, startY, endX, endY, grid, opts);
    startNode->f = startNode->g + startNode->h;
    startNode->opened = true;
    openList.push(startNode);

    while (!openList.empty()) {
        Node* current = openList.pop();
        current->closed = true;

        if (current == endNode) {
            std::vector<Point> path;
            Node* curr = current;
            while (curr) {
                path.push_back({curr->x, curr->y});
                if (curr->parentIdx == -1) break;
                curr = &grid.nodes[curr->parentIdx];
            }
            std::reverse(path.begin(), path.end());
            return path;
        }

        auto neighbors = GetNeighbors(current, grid, opts, neighborsBuf);
        for (Node* neighbor : neighbors) {
            if (neighbor->closed) continue;

            double dist = std::sqrt(std::pow(neighbor->x - current->x, 2) + std::pow(neighbor->y - current->y, 2));
            double tentativeG = current->g + dist;

            if (!neighbor->opened || tentativeG < neighbor->g) {
                neighbor->g = tentativeG;
                neighbor->h = CalculateHeuristic(neighbor, current, startX, startY, endX, endY, grid, opts);
                neighbor->f = neighbor->g + neighbor->h;
                neighbor->parentIdx = grid.getIdx(current);

                if (!neighbor->opened) {
                    neighbor->opened = true;
                    openList.push(neighbor);
                } else {
                    openList.update(neighbor);
                }
            }
        }
    }

    return {};
}

} // namespace astar
