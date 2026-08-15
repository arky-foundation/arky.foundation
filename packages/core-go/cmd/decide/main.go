// Command decide emits "<STATUS>|<authorized verbs>" for a K1/K2 kernel vector,
// so CI can compare Go kernel decisions against the TS and Rust stacks.
//
// Usage: go run ./cmd/decide <path-to-kernel-vector.json>
package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	arky "github.com/arky-foundation/arky.foundation/packages/core-go"
)

func read(path string) (arky.Value, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return arky.Parse(string(data))
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: decide <vector.json>")
		os.Exit(2)
	}
	v, err := read(os.Args[1])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	commitment, ok := arky.Path(v, "inputs", "commitment")
	if !ok {
		fmt.Print("NONE")
		return
	}

	// Vector paths are relative to the repo's vectors/ directory.
	wd, _ := os.Getwd()
	vectorsDir := filepath.Join(filepath.Dir(filepath.Dir(wd)), "vectors")

	var tims []arky.Value
	if tp := arky.Str(v, "context", "fixtures", "tim"); tp != "" {
		fixture, err := read(filepath.Join(vectorsDir, tp))
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		if tim, ok := arky.Path(fixture, "tim"); ok {
			tims = append(tims, tim)
		}
	}
	// K2 vectors embed their evidence inline so they are self-contained.
	if ev, ok := arky.Path(v, "context", "evidence"); ok {
		if arr, ok := ev.([]arky.Value); ok {
			tims = append(tims, arr...)
		}
	}

	evalTime := arky.Str(v, "context", "time")
	if evalTime == "" {
		evalTime = "2025-10-15T12:00:00Z"
	}
	d := arky.EvaluateKernel(commitment, tims, evalTime)
	fmt.Printf("%s|%s", d.Status, strings.Join(d.Authorized, ","))
}
