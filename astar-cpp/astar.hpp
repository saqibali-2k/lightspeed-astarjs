#ifndef ASTAR_HPP
#define ASTAR_HPP

#include <vector>
#include <cmath>
#include <algorithm>
#include <memory>
#include <cstdint>

namespace astar {

enum class HeuristicType : uint8_t {
    Manhattan = 1 << 0,
    Euclidean = 1 << 1,
    CustomG   = 1 << 2,
    CustomH   = 1 << 3
};

constexpr bool hasHeuristicOption(HeuristicType value, HeuristicType flag) {
    using U = std::underlying_type_t<HeuristicType>;
    return (static_cast<U>(value) & static_cast<U>(flag)) != 0;
}

struct Options {
    HeuristicType heuristic;
    bool allowDiagonal;
    bool useCustomNeighbors;
};

struct Node {
    int x, y;
    int32_t walkable;
    double g, h, f;
    int parentIdx;
    bool closed;
    bool opened;
    int heapIndex;

    Node() : x(0), y(0), walkable(false), g(0), h(0), f(0), 
             parentIdx(-1), closed(false), opened(false), heapIndex(-1) {}
    
    void init(int _x, int _y, int32_t _walkable) {
        x = _x; y = _y; walkable = _walkable;
        g = 0; h = 0; f = 0;
        parentIdx = -1; closed = false; opened = false; heapIndex = -1;
    }
};

class BinaryHeap {
private:
    std::vector<Node*> heap;
    
    void bubbleUp(int idx) {
        while (idx > 0) {
            int parent = (idx - 1) / 2;
            if (heap[idx]->f < heap[parent]->f) {
                std::swap(heap[idx], heap[parent]);
                heap[idx]->heapIndex = idx;
                heap[parent]->heapIndex = parent;
                idx = parent;
            } else {
                break;
            }
        }
    }

    void bubbleDown(int idx) {
        int size = heap.size();
        while (true) {
            int left = 2 * idx + 1;
            int right = 2 * idx + 2;
            int smallest = idx;

            if (left < size && heap[left]->f < heap[smallest]->f) smallest = left;
            if (right < size && heap[right]->f < heap[smallest]->f) smallest = right;

            if (smallest != idx) {
                std::swap(heap[idx], heap[smallest]);
                heap[idx]->heapIndex = idx;
                heap[smallest]->heapIndex = smallest;
                idx = smallest;
            } else {
                break;
            }
        }
    }

public:
    void push(Node* node) {
        node->heapIndex = heap.size();
        heap.push_back(node);
        bubbleUp(node->heapIndex);
    }

    Node* pop() {
        if (heap.empty()) return nullptr;
        Node* top = heap[0];
        Node* last = heap.back();
        heap.pop_back();
        if (!heap.empty()) {
            heap[0] = last;
            heap[0]->heapIndex = 0;
            bubbleDown(0);
        }
        top->heapIndex = -1;
        return top;
    }

    void update(Node* node) {
        if (node->heapIndex != -1) {
            bubbleUp(node->heapIndex);
            bubbleDown(node->heapIndex);
        }
    }

    bool empty() const { return heap.empty(); }
};

struct Grid {
    int width, height;
    std::vector<Node> nodes;
    const int32_t* rawData;

    Grid(int w, int h, const int32_t* gridData) 
        : width(w), height(h), rawData(gridData) {
        nodes.resize(width * height);
        for (int y = 0; y < height; ++y) {
            for (int x = 0; x < width; ++x) {
                nodes[y * width + x].init(x, y, gridData[y * width + x] == 0);
            }
        }
    }

    Node* getNode(int x, int y) {
        if (x < 0 || x >= width || y < 0 || y >= height) return nullptr;
        return &nodes[y * width + x];
    }
    
    int getIdx(Node* node) {
        return node->y * width + node->x;
    }
};

struct Point {
    int x, y;
};

std::vector<Point> findPath(int startX, int startY, int endX, int endY, Grid& grid, const Options& opts);

} // namespace astar

#endif // ASTAR_HPP
