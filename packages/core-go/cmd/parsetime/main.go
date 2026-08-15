// Command parsetime emits epoch ms for an RFC3339 timestamp, so CI can compare
// Go's ParseRFC3339Ms against the TS Date.parse and the Rust parser. Prints
// "NONE" when the parser rejects the input (the TS driver prints NaN as NONE).
//
// Usage: go run ./cmd/parsetime <timestamp>
package main

import (
	"fmt"
	"os"

	arky "github.com/arky-foundation/arky.foundation/packages/core-go"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: parsetime <ts>")
		os.Exit(2)
	}
	if ms, ok := arky.ParseRFC3339Ms(os.Args[1]); ok {
		fmt.Print(ms)
		return
	}
	fmt.Print("NONE")
}
