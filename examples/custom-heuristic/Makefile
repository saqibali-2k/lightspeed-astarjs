CC = emcc
CFLAGS = -O3 -std=c++17 -flto
EXPORTED_FUNCTIONS = '["_custom_heuristic", "_custom_get_neighbors"]'
WASM_FLAGS = -s STANDALONE_WASM -s EXPORTED_FUNCTIONS=$(EXPORTED_FUNCTIONS) -s ERROR_ON_UNDEFINED_SYMBOLS=0 --no-entry

SRC = custom_logic.cpp
OUT = custom_logic.wasm

all: $(OUT)

$(OUT): $(SRC)
	$(CC) $(CFLAGS) $(SRC) -o $(OUT) $(WASM_FLAGS)

clean:
	rm -f $(OUT)
