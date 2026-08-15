// Command canon emits the JCS canonical string of a TIM's canonical body
// (cid/sig/witnesses stripped), so CI can byte-diff Go output against the TS
// and Rust stacks.
//
// Usage: go run ./cmd/canon <path-to-tim-fixture.json>
package main

import (
	"fmt"
	"os"

	arky "github.com/arky-foundation/arky.foundation/packages/core-go"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: canon <fixture.json>")
		os.Exit(2)
	}
	data, err := os.ReadFile(os.Args[1])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	v, err := arky.Parse(string(data))
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	// Accept either a bare TIM or a fixture wrapper { "tim": {...} }.
	tim := v
	if inner, ok := arky.Path(v, "tim"); ok {
		tim = inner
	}
	s, err := arky.Canonicalize(arky.CanonicalBody(tim))
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Print(s)
}
