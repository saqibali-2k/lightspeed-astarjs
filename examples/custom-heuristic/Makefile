CC = emcc
CFLAGS = -O2 -std=c++17 -flto
EXPORTED_FUNCTIONS = '["_custom_heuristic_g", "_custom_heuristic_h", "_custom_get_neighbors"]'
WASM_FLAGS = -s STANDALONE_WASM -s EXPORTED_FUNCTIONS=$(EXPORTED_FUNCTIONS) -s SIDE_MODULE=2 -s ALLOW_MEMORY_GROWTH=1 --no-entry

SRC = custom_logic.cpp
OUT = custom_logic.wasm

all: $(OUT)

$(OUT): $(SRC)
	$(CC) $(CFLAGS) $(SRC) -o $(OUT) $(WASM_FLAGS)

clean:
	rm -f $(OUT)
