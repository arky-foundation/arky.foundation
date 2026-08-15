package arky

import (
	"crypto/sha256"
	"errors"
	"strings"
)

// base58btc (Bitcoin) alphabet.
const b58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

// Base58BtcEncode encodes bytes as base58btc. Hand-rolled: the standard library
// has no base58, and the algorithm is short enough that a dependency would cost
// more trust than it saves.
func Base58BtcEncode(input []byte) string {
	if len(input) == 0 {
		return ""
	}
	// Leading zero bytes each map to a literal '1'.
	zeros := 0
	for zeros < len(input) && input[zeros] == 0 {
		zeros++
	}
	// Repeated division of the big-endian number by 58.
	buf := make([]byte, len(input))
	copy(buf, input)
	var out []byte
	for start := zeros; start < len(buf); {
		carry := 0
		for i := start; i < len(buf); i++ {
			cur := carry*256 + int(buf[i])
			buf[i] = byte(cur / 58)
			carry = cur % 58
		}
		out = append(out, b58Alphabet[carry])
		for start < len(buf) && buf[start] == 0 {
			start++
		}
	}
	var sb strings.Builder
	sb.Grow(zeros + len(out))
	for range zeros {
		sb.WriteByte('1')
	}
	for i := len(out) - 1; i >= 0; i-- {
		sb.WriteByte(out[i])
	}
	return sb.String()
}

// Base58BtcDecode decodes a base58btc string. It returns an error for any
// character outside the alphabet, so malformed input can never be mistaken for
// a valid key or digest.
func Base58BtcDecode(s string) ([]byte, error) {
	if s == "" {
		return []byte{}, nil
	}
	zeros := 0
	for zeros < len(s) && s[zeros] == '1' {
		zeros++
	}
	buf := make([]byte, 0, len(s))
	for i := zeros; i < len(s); i++ {
		idx := strings.IndexByte(b58Alphabet, s[i])
		if idx < 0 {
			return nil, errors.New("base58: invalid character")
		}
		carry := idx
		for j := len(buf) - 1; j >= 0; j-- {
			cur := int(buf[j])*58 + carry
			buf[j] = byte(cur % 256)
			carry = cur / 256
		}
		for carry > 0 {
			buf = append([]byte{byte(carry % 256)}, buf...)
			carry /= 256
		}
	}
	out := make([]byte, zeros+len(buf))
	copy(out[zeros:], buf)
	return out, nil
}

// MultihashSha256 returns multihash(sha2-256, data) = 0x12 0x20 || digest.
func MultihashSha256(data []byte) []byte {
	sum := sha256.Sum256(data)
	mh := make([]byte, 0, 34)
	mh = append(mh, 0x12, 0x20)
	return append(mh, sum[:]...)
}

// ToMultibase encodes bytes as multibase base58btc (the 'z' prefix).
func ToMultibase(data []byte) string { return "z" + Base58BtcEncode(data) }

// FromMultibase decodes a multibase 'z...' (base58btc) string.
func FromMultibase(s string) ([]byte, error) {
	rest, ok := strings.CutPrefix(s, "z")
	if !ok {
		return nil, errors.New("multibase: expected 'z' prefix")
	}
	return Base58BtcDecode(rest)
}

// MultihashMb returns multibase(multihash(sha2-256, data)).
func MultihashMb(data []byte) string { return ToMultibase(MultihashSha256(data)) }

// CidFromCanonical computes the cid over canonical bytes, per
// ARKY-TIM-Canonicalization-v1 section 4:
//
//	cid = multibase('z', base58btc(multihash(sha2-256, canonical_bytes)))
//
// This is NOT an IPFS CID.
func CidFromCanonical(canonical string) string {
	return MultihashMb([]byte(canonical))
}

// ComputeCid canonicalizes a value and returns its cid.
func ComputeCid(v Value) (string, error) {
	canonical, err := Canonicalize(v)
	if err != nil {
		return "", err
	}
	return CidFromCanonical(canonical), nil
}
