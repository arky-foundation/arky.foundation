// Command quickstart produces a TIM with this stack, verifies it, and shows the
// canonical bytes the cid and signature are computed over.
//
// Usage: go run ./cmd/quickstart
package main

import (
	"fmt"

	arky "github.com/arky-foundation/arky.foundation/packages/core-go"
)

func main() {
	kp, err := arky.GenerateKeyPair()
	if err != nil {
		panic(err)
	}

	method := arky.NewObject()
	method.Set("type", "sensor")
	method.Set("source", "device:temp-01")

	measurement := arky.NewObject()
	measurement.Set("name", "temperature")
	measurement.Set("value", arky.Number("22.5"))
	measurement.Set("unit", "arky:unit/temp.C")
	measurement.Set("method", method)

	timeObj := arky.NewObject()
	timeObj.Set("ts", "2025-10-15T12:00:00Z")

	identity := arky.NewObject()
	identity.Set("id", kp.Did)

	body := arky.NewObject()
	body.Set("time", timeObj)
	body.Set("identity", identity)
	body.Set("measurement", measurement)

	tim, err := arky.CreateTim(body, kp.PrivateKey, "")
	if err != nil {
		panic(err)
	}

	canonical, err := arky.Canonicalize(arky.CanonicalBody(tim))
	if err != nil {
		panic(err)
	}

	fmt.Println("did:      ", kp.Did)
	fmt.Println("canonical:", canonical)
	fmt.Println("cid:      ", arky.Str(tim, "cid"))

	res := arky.VerifyTim(tim, nil)
	fmt.Printf("verified:  valid=%v cid=%v sig=%v\n",
		res.Valid, res.CidValid, res.SignatureValid)

	// Tamper with the measurement: verification must fail.
	forged := tim.(*arky.Object).Clone()
	m, _ := forged.Get("measurement")
	m.(*arky.Object).Set("value", arky.Number("999"))
	bad := arky.VerifyTim(forged, nil)
	fmt.Printf("tampered:  valid=%v errors=%v\n", bad.Valid, bad.Errors)
}
