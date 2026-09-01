// Redline precision corpus. This file is deliberately CORRECT.
// Any review comment on it is a false positive. Zero findings is a pass.
package clean

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"
)

var errUpstream = errors.New("upstream unavailable")

type Client struct {
	http *http.Client
	base string
}

func NewClient(base string) *Client {
	return &Client{
		http: &http.Client{Timeout: 3 * time.Second},
		base: base,
	}
}

type Balance struct {
	AccountID string `json:"accountId"`
	Minor     int64  `json:"minor"`
}

func (c *Client) Balance(ctx context.Context, accountID string) (Balance, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+"/balance/"+accountID, nil)
	if err != nil {
		return Balance{}, fmt.Errorf("build balance request: %w", err)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return Balance{}, fmt.Errorf("call balance: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return Balance{}, fmt.Errorf("balance status %d: %w", resp.StatusCode, errUpstream)
	}

	var balance Balance
	if err := json.NewDecoder(resp.Body).Decode(&balance); err != nil {
		return Balance{}, fmt.Errorf("decode balance: %w", err)
	}
	return balance, nil
}

// Handler is the HTTP boundary: it validates input and maps errors to statuses. The
// internal call above is trusted to return a typed error, so there is no second layer
// of defensive checking here.
func (c *Client) Handler(w http.ResponseWriter, r *http.Request) {
	accountID := r.URL.Query().Get("accountId")
	if accountID == "" {
		http.Error(w, "accountId is required", http.StatusBadRequest)
		return
	}

	balance, err := c.Balance(r.Context(), accountID)
	if errors.Is(err, errUpstream) {
		http.Error(w, "upstream unavailable", http.StatusBadGateway)
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(balance); err != nil {
		// The response is already partially written; there is nothing left to signal.
		return
	}
}
