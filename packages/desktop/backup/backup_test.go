package backup

import (
	"compress/gzip"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Re-execute the test binary as pg_dump so tests exercise actual process and file I/O.
func TestBackupHelperProcess(t *testing.T) {
	mode := os.Getenv("MYBIZONE_TEST_DUMP")
	if mode == "" {
		return
	}
	_, _ = io.WriteString(os.Stdout, "SELECT 'backup payload';\n")
	if mode == "fail" {
		os.Exit(1)
	}
	os.Exit(0)
}

func helperConfig(t *testing.T, mode string) Config {
	t.Helper()
	t.Setenv("MYBIZONE_TEST_DUMP", mode)
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	return Config{BackupDir: t.TempDir(), PgDumpPath: exe, DatabaseURL: "-test.run=^TestBackupHelperProcess$"}
}

func TestRunBackupPublishesCompleteGzip(t *testing.T) {
	cfg := helperConfig(t, "success")
	path, err := RunBackup(cfg)
	if err != nil {
		t.Fatal(err)
	}
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		t.Fatal(err)
	}
	defer gz.Close()
	data, err := io.ReadAll(gz)
	if err != nil || string(data) != "SELECT 'backup payload';\n" {
		t.Fatalf("invalid completed backup: %q, %v", data, err)
	}
	files, err := ListBackups(cfg.BackupDir)
	if err != nil || len(files) != 1 {
		t.Fatalf("completed archives: %v, %v", files, err)
	}
}

func TestFailedDumpDoesNotPublishOrDeletePreviousBackup(t *testing.T) {
	cfg := helperConfig(t, "fail")
	previous := filepath.Join(cfg.BackupDir, "previous.sql.gz")
	if err := os.WriteFile(previous, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	old := time.Now().AddDate(0, 0, -60)
	if err := os.Chtimes(previous, old, old); err != nil {
		t.Fatal(err)
	}
	if path, err := RunBackup(cfg); err == nil || path != "" {
		t.Fatalf("failed dump was accepted: %q %v", path, err)
	}
	entries, err := os.ReadDir(cfg.BackupDir)
	if err != nil || len(entries) != 1 || entries[0].Name() != "previous.sql.gz" {
		t.Fatalf("failed dump left partial data or deleted backup: %v, %v", entries, err)
	}
}

func TestDefaultRetentionPreservesRecentBackupAndUnrelatedArchive(t *testing.T) {
	cfg := helperConfig(t, "success")
	for _, name := range []string{"recent.sql.gz", "old.sql.gz", "unrelated.gz"} {
		path := filepath.Join(cfg.BackupDir, name)
		if err := os.WriteFile(path, []byte("keep"), 0600); err != nil {
			t.Fatal(err)
		}
		age := -1
		if name != "recent.sql.gz" {
			age = -60
		}
		stamp := time.Now().AddDate(0, 0, age)
		if err := os.Chtimes(path, stamp, stamp); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := RunBackup(cfg); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"recent.sql.gz", "unrelated.gz"} {
		if _, err := os.Stat(filepath.Join(cfg.BackupDir, name)); err != nil {
			t.Fatalf("deleted %s: %v", name, err)
		}
	}
	if _, err := os.Stat(filepath.Join(cfg.BackupDir, "old.sql.gz")); !os.IsNotExist(err) {
		t.Fatalf("old backup retained: %v", err)
	}
}

func TestRestoreRejectsTruncatedArchiveBeforeStartingDatabaseClient(t *testing.T) {
	path := filepath.Join(t.TempDir(), "broken.sql.gz")
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	gz := gzip.NewWriter(f)
	_, _ = gz.Write([]byte("CREATE TABLE should_not_exist(id int);"))
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	info, _ := os.Stat(path)
	if err := os.Truncate(path, info.Size()-4); err != nil {
		t.Fatal(err)
	}
	err = RestoreBackup(Config{PgDumpPath: filepath.Join(t.TempDir(), "missing-pg_dump")}, path)
	if err == nil || !strings.Contains(err.Error(), "invalid backup") {
		t.Fatalf("expected archive validation, got %v", err)
	}
}

func TestListBackupsDoesNotHideInvalidDirectory(t *testing.T) {
	path := filepath.Join(t.TempDir(), "file")
	if err := os.WriteFile(path, []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := ListBackups(path); err == nil {
		t.Fatal("expected directory error")
	}
}
