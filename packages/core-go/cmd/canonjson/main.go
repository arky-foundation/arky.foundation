// Command canonjson canonicalizes a raw JSON string argument, for
// cross-language number/edge checks against the TS and Rust stacks.
//
// Usage: go run ./cmd/canonjson '{"n":1e21}'
package main

import (
	"fmt"
	"os"

	arky "github.com/arky-foundation/arky.foundation/packages/core-go"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: canonjson <json>")
		os.Exit(2)
	}
	v, err := arky.Parse(os.Args[1])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	s, err := arky.Canonicalize(v)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Print(s)
}
