CC = emcc
CFLAGS = -O3 -std=c++17 -flto
EXPORTED_FUNCTIONS = '["_findPathWASM", "_getGridBufferWASM"]'
WASM_FLAGS = -s STANDALONE_WASM -s EXPORTED_FUNCTIONS=$(EXPORTED_FUNCTIONS) -s ERROR_ON_UNDEFINED_SYMBOLS=0 -s ALLOW_MEMORY_GROWTH=1 --no-entry

SRC = astar-cpp/astar.cpp astar-cpp/wasm_glue.cpp
OUT = dist/astar.wasm

all: $(OUT)

$(OUT): $(SRC)
	mkdir -p dist
	$(CC) $(CFLAGS) $(SRC) -o $(OUT) $(WASM_FLAGS)


# Native C++ testing
test_cpp: astar-cpp/test_astar.cpp astar-cpp/astar.cpp
	g++ -std=c++17 -Iastar-cpp -g $^ -o test_runner
	./test_runner

# Memory safety testing with AddressSanitizer
test_asan: astar-cpp/test_astar.cpp astar-cpp/astar.cpp
	g++ -std=c++17 -Iastar-cpp -fsanitize=address -g $^ -o test_runner_asan
	./test_runner_asan

# Generic test target
test: test_cpp

clean:
	rm -f $(OUT) test_runner test_runner_asan
