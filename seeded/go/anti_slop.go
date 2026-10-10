// DO NOT MERGE — Redline validation seed (anti-slop rules).
package seeded

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
)

func SaveUser(repo Repo, u User) error {
	if err := repo.Insert(u); err != nil {
		// SEED 1 [BLOCKER] (go/error-laundered-to-nil) checked error returned as success
		return nil
	}
	return nil
}

func validate(name string) error {
	var verr *ValidationError
	if name == "" {
		verr = &ValidationError{Field: "name"}
	}
	// SEED 2 [BLOCKER] (go/typed-nil-in-interface) nil *ValidationError returned as a non-nil error
	return verr
}

func orderIDs(ctx context.Context, db *sql.DB) ([]int, error) {
	// SEED 3 [BLOCKER] (go/sql-rows-lifecycle) rows never closed and rows.Err never checked
	rows, err := db.QueryContext(ctx, "SELECT id FROM orders")
	if err != nil {
		return nil, err
	}
	var ids []int
	for rows.Next() {
		var id int
		_ = rows.Scan(&id)
		ids = append(ids, id)
	}
	return ids, nil
}

func start(cfg *Config) error {
	// SEED 4 [BLOCKER] (go/nil-check-after-deref) dereferenced before its nil check
	addr := fmt.Sprintf(":%d", cfg.Port)
	if cfg == nil {
		return fmt.Errorf("nil config")
	}
	// SEED 5 [HIGH] (go/missing-client-server-timeout) package-level server has no timeouts
	return http.ListenAndServe(addr, nil)
}

func (r *Repo) Find(id string) (*User, error) {
	// SEED 6 [HIGH] (go/nil-nil-return) missing user returned as nil, nil
	return nil, nil
}

func parseConfig(b []byte, cfg *Config) error {
	if err := json.Unmarshal(b, cfg); err != nil {
		// SEED 7 [HIGH] (go/error-wrap-verb) %v breaks errors.Is upstream
		return fmt.Errorf("parse config: %v", err)
	}
	return nil
}

func TestWorker(t *testing.T) {
	go func() {
		// SEED 8 [HIGH] (go/fatal-in-test-goroutine) t.Fatal from a goroutine the test started
		t.Fatal("worker failed")
	}()
}

func process(ctx context.Context, items []Item) {
	for _, item := range items {
		// SEED 9 [HIGH] (go/context-grown-in-loop) context chained on every iteration
		ctx = context.WithValue(ctx, itemKey, item.ID)
		handle(ctx, item)
	}
}

// SEED 10 [HIGH] (go/untagged-wire-struct) marshalled struct with no field tags
type Event struct{ UserID string; Amount int }
