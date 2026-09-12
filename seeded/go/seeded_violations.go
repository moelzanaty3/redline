// DO NOT MERGE — Redline validation seed.
// Every `SEED n [SEVERITY] (rule-id)` marker must be flagged at that severity or higher,
// citing that rule id. Score with scripts/score-seeds.mjs.
package seed

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
)

// SEED 1 [BLOCKER] (core/hardcoded-secrets) hardcoded credential
const dbPassword = "Pr0d-Sup3r-S3cret-2026!"

func Handler(w http.ResponseWriter, r *http.Request, db *sql.DB) {
	// SEED 2 [BLOCKER] (go/ignored-errors) error ignored
	// SEED 3 [BLOCKER] (core/query-string-concatenation) SQL built by concatenation with request input
	rows, _ := db.Query("SELECT id FROM users WHERE name = '" + r.URL.Query().Get("name") + "'")
	defer rows.Close()

	// SEED 4 [BLOCKER] (go/missing-ctx-propagation) context.Background() inside request handling drops cancellation
	go process(context.Background())

	// SEED 5 [HIGH] (go/missing-client-server-timeout) http.Client with no timeout — the zero value is infinite
	client := &http.Client{}
	resp, err := client.Get("https://internal-api/balance")
	if err != nil {
		// SEED 6 [BLOCKER] (microservices/swallowed-errors) error logged then treated as success
		fmt.Println(err)
	}
	_ = resp
	w.WriteHeader(http.StatusOK)
}

func process(ctx context.Context) {
	// SEED 7 [BLOCKER] (go/goroutine-leaks) goroutine blocks forever on an unbuffered channel nobody reads
	ch := make(chan int)
	go func() {
		ch <- 1
	}()
}

// SEED 8 [BLOCKER] (go/writing-nil-map) writing to a nil map panics at runtime
func Tally(values []string) map[string]int {
	var counts map[string]int
	for _, v := range values {
		counts[v]++
	}
	return counts
}

// SEED 9 [BLOCKER] (core/type-checker-suppression) linter suppression with no explanation and no ticket
func writeAll(w http.ResponseWriter, b []byte) {
	w.Write(b) //nolint:errcheck
}

// SEED 10 [HIGH] (core/untracked-todo) placeholder with no ticket reference
// TODO: fall back to the secondary region when the primary is draining
func failover() {}
