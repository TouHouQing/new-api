package repository

import (
	"fmt"
	"math/rand/v2"
	"strings"
	"time"
)

const (
	defaultSQLiteRetryBudget   = 6 * time.Second
	defaultSQLiteRetryInitial  = 25 * time.Millisecond
	defaultSQLiteRetryMaxDelay = 250 * time.Millisecond
)

// SQLite WAL permits concurrent readers, but two deferred write transactions
// can still produce SQLITE_BUSY_SNAPSHOT when one upgrades after the other
// commits. busy_timeout does not resolve that extended code, so the whole short
// transaction must be retried from a fresh read snapshot.
func (r *Repository) retrySQLiteBusy(operation string, run func() error) error {
	if r == nil || r.db == nil || r.Dialect() != "sqlite" {
		return run()
	}
	budget := r.sqliteRetryBudget
	if budget <= 0 {
		budget = defaultSQLiteRetryBudget
	}
	initial := r.sqliteRetryInitial
	if initial <= 0 {
		initial = defaultSQLiteRetryInitial
	}
	maxDelay := r.sqliteRetryMaxDelay
	if maxDelay <= 0 {
		maxDelay = defaultSQLiteRetryMaxDelay
	}
	deadline := time.Now().Add(budget)
	for attempt := 0; ; attempt++ {
		var err error
		if r.sqliteBusyProbe != nil {
			err = r.sqliteBusyProbe(operation, attempt)
		}
		if err == nil {
			err = run()
		}
		if err == nil {
			return nil
		}
		if !isSQLiteBusyError(err) {
			return err
		}
		if r.sqliteBusyObserved != nil {
			r.sqliteBusyObserved(err)
		}
		remaining := time.Until(deadline)
		if remaining <= 0 {
			return fmt.Errorf("%w (operation=%s): %v", ErrBillingStorageBusy, operation, err)
		}
		delay := sqliteBusyRetryDelay(attempt, initial, maxDelay)
		if delay > remaining {
			delay = remaining
		}
		time.Sleep(delay)
	}
}

func sqliteBusyRetryDelay(attempt int, initial, maximum time.Duration) time.Duration {
	if attempt > 8 {
		attempt = 8
	}
	delay := initial
	for range attempt {
		if delay >= maximum/2 {
			delay = maximum
			break
		}
		delay *= 2
	}
	if delay > maximum {
		delay = maximum
	}
	half := delay / 2
	if half <= 0 {
		return delay
	}
	return half + time.Duration(rand.Int64N(int64(delay-half)+1))
}

func isSQLiteBusyError(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	for _, marker := range []string{
		"database is locked",
		"database table is locked",
		"sqlite_busy",
		"sqlite_locked",
	} {
		if strings.Contains(message, marker) {
			return true
		}
	}
	return false
}
