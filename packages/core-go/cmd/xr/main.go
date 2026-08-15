// Command xr emits "<STATUS>|<xr cid>" for an S1 settler vector, so CI can
// compare Go execution receipts against the TS and Rust stacks.
//
// Usage: go run ./cmd/xr <path-to-s1-vector.json>
package main

import (
	"fmt"
	"os"

	arky "github.com/arky-foundation/arky.foundation/packages/core-go"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: xr <vector.json>")
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
	if arky.Str(v, "level") != "S1" {
		fmt.Print("SKIP")
		return
	}

	// The same fixed signing seed the TS and Rust drivers use.
	seed := make([]byte, 32)
	for i := range seed {
		seed[i] = 9
	}
	kp := arky.FromSeed(seed)

	args, _ := arky.Path(v, "inputs", "params")
	ts := arky.Str(v, "context", "time")
	if ts == "" {
		ts = "2025-10-15T12:00:01Z"
	}
	store := arky.IdempotencyStore{}
	r := arky.Execute(arky.ExecRequest{
		Verb:           arky.Str(v, "inputs", "verb"),
		Rail:           arky.Str(v, "inputs", "rail"),
		Args:           args,
		IdempotencyKey: arky.Str(v, "inputs", "idempotency_key"),
	}, kp.PrivateKey, "test-settler", ts, "log:arky:transparency@v1", store)

	if r.Receipt != nil {
		fmt.Printf("%s|%s", r.Status, arky.Str(r.Receipt, "cid"))
		return
	}
	fmt.Printf("%s|", r.Status)
}
