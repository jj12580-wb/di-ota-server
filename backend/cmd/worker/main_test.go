package main

import (
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestRunWorkerCycle_WithRetention_ExecutesCleanup(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	mock.ExpectExec("INSERT INTO t_task_stats").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("UPDATE t_release_task").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("DELETE FROM t_task_stats").WithArgs(int64(24)).WillReturnResult(sqlmock.NewResult(0, 3))

	if err := runWorkerCycle(db, 24); err != nil {
		t.Fatalf("runWorkerCycle() error = %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestRunWorkerCycle_ZeroRetention_SkipsCleanup(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	mock.ExpectExec("INSERT INTO t_task_stats").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("UPDATE t_release_task").WillReturnResult(sqlmock.NewResult(0, 1))

	if err := runWorkerCycle(db, 0); err != nil {
		t.Fatalf("runWorkerCycle() error = %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}
