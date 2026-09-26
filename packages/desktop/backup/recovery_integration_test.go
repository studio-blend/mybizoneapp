//go:build recovery

package backup

import (
	"compress/gzip"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Only release-check enables this destructive-on-disposable-databases acceptance.
func TestDisposableRecoveryAcceptance(t *testing.T) {
	if os.Getenv("MYBIZONE_RECOVERY_TEST") != "1" || os.Getenv("DATABASE_URL") != "postgresql://postgres@127.0.0.1:55432/mybizone_release_test" {
		t.Fatal("run through node scripts/release-check.mjs test:recovery")
	}
	root, err := filepath.Abs("../../..")
	if err != nil {
		t.Fatal(err)
	}
	bin := filepath.Join(root, ".cache", "postgres", "pgsql", "bin")
	suffix := ""
	if _, err := os.Stat(filepath.Join(bin, "psql.exe")); err == nil {
		suffix = ".exe"
	}
	sql := func(db, query string) (string, error) {
		cmd := exec.Command(filepath.Join(bin, "psql"+suffix), "-X", "-h", "127.0.0.1", "-p", "55432", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-At", "-c", query)
		result, err := cmd.CombinedOutput()
		return strings.TrimSpace(string(result)), err
	}
	directory, err := sql("mybizone_release_test", "SHOW data_directory")
	if err != nil {
		t.Fatalf("check isolated cluster: %s %v", directory, err)
	}
	if !strings.EqualFold(filepath.Clean(directory), filepath.Join(root, ".cache", "test-pgdata")) {
		t.Fatalf("refuse unexpected cluster %q", directory)
	}
	stamp := fmt.Sprintf("%d", time.Now().UnixNano())
	source, destination := "mybizone_recovery_src_"+stamp, "mybizone_recovery_dst_"+stamp
	for _, name := range []string{source, destination} {
		if out, err := sql("mybizone_release_test", "CREATE DATABASE "+name); err != nil {
			t.Fatalf("create fixture: %s %v", out, err)
		}
		t.Cleanup(func() {
			if out, err := sql("mybizone_release_test", "DROP DATABASE "+name+" WITH (FORCE)"); err != nil {
				t.Errorf("cleanup %s: %s %v", name, out, err)
			}
		})
	}
	mustSQL := func(db, query string) string {
		t.Helper()
		out, err := sql(db, query)
		if err != nil {
			t.Fatalf("fixture SQL: %s %v", out, err)
		}
		return out
	}
	mustSQL(source, "CREATE TABLE recovery_fixture(id int PRIMARY KEY, label text NOT NULL, upload_path text NOT NULL); INSERT INTO recovery_fixture VALUES (1,'saved sale','business-1/receipt.txt')")
	data := []byte("disposable uploaded receipt\n")
	liveUploads := filepath.Join(t.TempDir(), "uploads", "business-1")
	if err := os.MkdirAll(liveUploads, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(liveUploads, "receipt.txt"), data, 0600); err != nil {
		t.Fatal(err)
	}
	cfg := Config{BackupDir: t.TempDir(), PgDumpPath: filepath.Join(bin, "pg_dump"+suffix), DatabaseURL: "postgresql://postgres@127.0.0.1:55432/" + source}
	archive, err := RunBackup(cfg)
	if err != nil {
		t.Fatal(err)
	}
	// Supported backups are database-only; operator copies uploads with app stopped.
	snapshot := filepath.Join(cfg.BackupDir, "uploads", "business-1")
	if err := os.MkdirAll(snapshot, 0700); err != nil {
		t.Fatal(err)
	}
	upload, err := os.ReadFile(filepath.Join(liveUploads, "receipt.txt"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(snapshot, "receipt.txt"), upload, 0600); err != nil {
		t.Fatal(err)
	}
	mustSQL(source, "UPDATE recovery_fixture SET label='post-backup mutation'")
	if err := os.WriteFile(filepath.Join(liveUploads, "receipt.txt"), []byte("post-backup mutation"), 0600); err != nil {
		t.Fatal(err)
	}
	cfg.DatabaseURL = "postgresql://postgres@127.0.0.1:55432/" + destination
	if err := RestoreBackup(cfg, archive); err != nil {
		t.Fatal(err)
	}
	if got := mustSQL(destination, "SELECT label || '|' || upload_path FROM recovery_fixture"); got != "saved sale|business-1/receipt.txt" {
		t.Fatalf("restored row: %q", got)
	}
	restored := filepath.Join(t.TempDir(), "uploads", "business-1")
	if err := os.MkdirAll(restored, 0700); err != nil {
		t.Fatal(err)
	}
	upload, err = os.ReadFile(filepath.Join(snapshot, "receipt.txt"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(restored, "receipt.txt"), upload, 0600); err != nil {
		t.Fatal(err)
	}
	reopened, err := os.ReadFile(filepath.Join(restored, "receipt.txt"))
	if err != nil || string(reopened) != string(data) {
		t.Fatalf("upload recovery: %q %v", reopened, err)
	}
	// Independent clients reconnect, proving committed persistence (not server restart).
	if got := mustSQL(destination, "SELECT count(*) FROM recovery_fixture WHERE label='saved sale'"); got != "1" {
		t.Fatalf("persistence: %q", got)
	}
	t.Log("PASS real pg_dump/gzip/psql roundtrip, separate-client persistence, paired offline uploads")
	if err := RestoreBackup(cfg, archive); err == nil {
		t.Fatal("nonempty destination unexpectedly accepted")
	}
	if got := mustSQL(destination, "SELECT count(*) FROM recovery_fixture"); got != "1" {
		t.Fatal("collision restore changed destination")
	}
	bad := filepath.Join(cfg.BackupDir, "invalid-sql.sql.gz")
	f, err := os.Create(bad)
	if err != nil {
		t.Fatal(err)
	}
	gz := gzip.NewWriter(f)
	if _, err := gz.Write([]byte("UPDATE recovery_fixture SET label='must roll back'; SELECT missing_recovery_function();")); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	if err := RestoreBackup(cfg, bad); err == nil {
		t.Fatal("invalid SQL accepted")
	}
	if got := mustSQL(destination, "SELECT label FROM recovery_fixture"); got != "saved sale" {
		t.Fatalf("failed SQL did not roll back: %q", got)
	}
	info, err := os.Stat(bad)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Truncate(bad, info.Size()-4); err != nil {
		t.Fatal(err)
	}
	if err := RestoreBackup(cfg, bad); err == nil || !strings.Contains(err.Error(), "invalid backup") {
		t.Fatalf("truncated archive: %v", err)
	}
	if got := mustSQL(destination, "SELECT label FROM recovery_fixture"); got != "saved sale" {
		t.Fatal("corrupt archive changed destination")
	}
	t.Log("PASS nonempty destination rejected, SQL failure rolled back, corrupt archive rejected without mutation")
	// A valid retry after failure succeeds against a deliberately emptied fixture.
	mustSQL(destination, "DROP TABLE recovery_fixture")
	if err := RestoreBackup(cfg, archive); err != nil {
		t.Fatal(err)
	}
	if got := mustSQL(destination, "SELECT label FROM recovery_fixture"); got != "saved sale" {
		t.Fatal("retry failed")
	}
	t.Log("PASS successful restore retry after failure")
	t.Run("FullApplicationAndRestart", func(t *testing.T) {
		// A separate temporary cluster permits restart without interrupting browser tests.
		clusterRoot := t.TempDir()
		cluster := filepath.Join(clusterRoot, "pgdata")
		run := func(program string, args ...string) {
			t.Helper()
			// Daemon children can inherit pipe handles on Windows; use a real log file.
			logPath := filepath.Join(clusterRoot, program+"-command.log")
			logFile, err := os.Create(logPath)
			if err != nil {
				t.Fatal(err)
			}
			cmd := exec.Command(filepath.Join(bin, program+suffix), args...)
			cmd.Stdout, cmd.Stderr = logFile, logFile
			err = cmd.Run()
			logFile.Close()
			if err != nil {
				out, _ := os.ReadFile(logPath)
				t.Fatalf("%s: %s %v", program, out, err)
			}
		}
		run("initdb", "-D", cluster, "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--no-locale")
		start := func() {
			run("pg_ctl", "start", "-D", cluster, "-l", filepath.Join(clusterRoot, "postgres.log"), "-o", "-h 127.0.0.1 -p 55433", "-w")
		}
		start()
		t.Cleanup(func() {
			out, err := exec.Command(filepath.Join(bin, "pg_ctl"+suffix), "stop", "-D", cluster, "-m", "fast", "-w").CombinedOutput()
			if err != nil {
				t.Errorf("stop owned recovery cluster: %s %v", out, err)
			}
		})
		destDatabase := "postgres"
		destSQL := func(query string) string {
			t.Helper()
			out, err := exec.Command(filepath.Join(bin, "psql"+suffix), "-X", "-h", "127.0.0.1", "-p", "55433", "-U", "postgres", "-d", destDatabase, "-v", "ON_ERROR_STOP=1", "-At", "-c", query).CombinedOutput()
			if err != nil {
				t.Fatalf("replacement SQL: %s %v", out, err)
			}
			return strings.TrimSpace(string(out))
		}
		if actual := destSQL("SHOW data_directory"); !strings.EqualFold(filepath.Clean(actual), cluster) {
			t.Fatalf("unexpected replacement cluster: %s", actual)
		}
		checks := []string{
			"SELECT name FROM _migrations ORDER BY name",
			"SELECT tablename || ':' || rowsecurity FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
			"SELECT c.relname || ':' || con.conname || ':' || pg_get_constraintdef(con.oid) FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,con.conname",
			"SELECT tablename || ':' || policyname || ':' || cmd || ':' || coalesce(qual,'') || ':' || coalesce(with_check,'') FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname",
		}
		expected := make([]string, len(checks))
		for i, query := range checks {
			expected[i] = mustSQL("mybizone_release_test", query)
			if expected[i] == "" {
				t.Fatalf("empty catalog %d", i)
			}
		}
		if count := mustSQL("mybizone_release_test", "SELECT count(*) FROM _migrations"); count != "22" {
			t.Fatalf("expected 22 migrations: %s", count)
		}
		fullCfg := Config{BackupDir: t.TempDir(), PgDumpPath: cfg.PgDumpPath, DatabaseURL: "postgresql://postgres@127.0.0.1:55432/mybizone_release_test"}
		archive, err := RunBackup(fullCfg)
		if err != nil {
			t.Fatal(err)
		}
		// pg_dump excludes cluster roles; recreate the application role before restore.
		destSQL("CREATE ROLE app_user NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT app_user TO postgres")
		fullCfg.DatabaseURL = "postgresql://postgres@127.0.0.1:55433/postgres"
		if err := RestoreBackup(fullCfg, archive); err != nil {
			t.Fatal(err)
		}
		for i, query := range checks {
			if got := destSQL(query); got != expected[i] {
				t.Fatalf("restored catalog %d differs", i)
			}
		}
		if got := destSQL("SELECT count(*)>0 FROM businesses"); got != "t" {
			t.Fatal("restored business data absent")
		}
		// Fingerprint every restored public-table row, including auth and transaction data.
		fingerprints := func() string {
			var result strings.Builder
			for _, name := range strings.Split(destSQL("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"), "\n") {
				quoted := `"` + strings.ReplaceAll(strings.TrimSpace(name), `"`, `""`) + `"`
				result.WriteString(name + ":" + destSQL("SELECT count(*) || ':' || coalesce(md5(string_agg(row_json, ',' ORDER BY row_json)),'empty') FROM (SELECT row_to_json(t)::text AS row_json FROM "+quoted+" t) s") + "\n")
			}
			return result.String()
		}
		before := fingerprints()
		run("pg_ctl", "stop", "-D", cluster, "-m", "fast", "-w")
		start()
		if after := fingerprints(); after != before {
			t.Fatal("application rows changed after database restart")
		}
		if upload, err := os.ReadFile(filepath.Join(restored, "receipt.txt")); err != nil || string(upload) != string(data) {
			t.Fatal("paired upload changed after database restart")
		}
		// LAN web backups use custom format. Dump the stable complete restored snapshot.
		customArchive := filepath.Join(clusterRoot, "lan-backup.dump")
		run("pg_dump", "--format=custom", "--no-owner", "--file="+customArchive, "postgresql://postgres@127.0.0.1:55433/postgres")
		destSQL("CREATE DATABASE mybizone_recovery_custom")
		customURL := "postgresql://postgres@127.0.0.1:55433/mybizone_recovery_custom"
		run("pg_restore", "--exit-on-error", "--single-transaction", "--no-owner", "--dbname="+customURL, customArchive)
		destDatabase = "mybizone_recovery_custom"
		for i, query := range checks {
			if got := destSQL(query); got != expected[i] {
				t.Fatalf("custom restored catalog %d differs", i)
			}
		}
		if got := fingerprints(); got != before {
			t.Fatal("custom archive restored different application data")
		}
		// A conflicting restore must fail without disturbing the prior good copy.
		output, restoreErr := exec.Command(filepath.Join(bin, "pg_restore"+suffix), "--exit-on-error", "--single-transaction", "--no-owner", "--dbname="+customURL, customArchive).CombinedOutput()
		if restoreErr == nil {
			t.Fatalf("custom restore onto nonempty database accepted: %s", output)
		}
		if got := fingerprints(); got != before {
			t.Fatal("failed custom restore changed prior good application data")
		}
		t.Log("PASS LAN custom-format full-schema/data roundtrip and failed nonempty restore preserves prior good data")
		t.Log("PASS full application dump/restore: 22 migrations, tables/RLS, constraints, policies, data; all public-table counts/content fingerprints and paired upload persist after owned-cluster stop/start")
	})
}
