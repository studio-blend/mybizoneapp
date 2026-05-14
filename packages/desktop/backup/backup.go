package backup

import (
	"compress/gzip"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"time"
)

// Config holds the backup configuration.
type Config struct {
	BackupDir     string // e.g. C:\MyBizOne\backups
	PgDumpPath    string // path to pg_dump binary
	DatabaseURL   string
	RetentionDays int // default 30
}

// BackupFile describes a single backup archive.
type BackupFile struct {
	Name    string
	Size    int64
	ModTime time.Time
}

// RunBackup executes pg_dump and saves to BackupDir as YYYY-MM-DD_HH-MM.sql.gz
func RunBackup(cfg Config) (string, error) {
	if err := os.MkdirAll(cfg.BackupDir, 0755); err != nil {
		return "", fmt.Errorf("create backup dir: %w", err)
	}
	filename := time.Now().Format("2006-01-02_15-04") + ".sql.gz"
	outPath := filepath.Join(cfg.BackupDir, filename)
	f, err := os.Create(outPath)
	if err != nil {
		return "", err
	}
	defer f.Close()
	gz := gzip.NewWriter(f)
	defer gz.Close()
	cmd := exec.Command(cfg.PgDumpPath, cfg.DatabaseURL)
	cmd.Stdout = gz
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("pg_dump failed: %w", err)
	}
	gz.Close()
	// Cleanup old backups
	cleanOldBackups(cfg.BackupDir, cfg.RetentionDays)
	return outPath, nil
}

// RestoreBackup restores a .sql.gz file using psql.
func RestoreBackup(cfg Config, backupPath string) error {
	f, err := os.Open(backupPath)
	if err != nil {
		return err
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	defer gz.Close()
	cmd := exec.Command("psql", cfg.DatabaseURL)
	cmd.Stdin = gz
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// ScheduleDailyBackup runs backup every 24h in a goroutine.
func ScheduleDailyBackup(cfg Config) {
	go func() {
		// Run once at startup (offset 1min to let app start)
		time.Sleep(1 * time.Minute)
		RunBackup(cfg) //nolint:errcheck
		ticker := time.NewTicker(24 * time.Hour)
		for range ticker.C {
			RunBackup(cfg) //nolint:errcheck
		}
	}()
}

// ListBackups returns list of backup files sorted newest first.
func ListBackups(backupDir string) ([]BackupFile, error) {
	entries, err := os.ReadDir(backupDir)
	if err != nil {
		return nil, nil // dir doesn't exist yet = no backups
	}
	var result []BackupFile
	for _, e := range entries {
		if !e.IsDir() && filepath.Ext(e.Name()) == ".gz" {
			info, _ := e.Info()
			result = append(result, BackupFile{Name: e.Name(), Size: info.Size(), ModTime: info.ModTime()})
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].ModTime.After(result[j].ModTime) })
	return result, nil
}

func cleanOldBackups(dir string, retentionDays int) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	var files []os.DirEntry
	for _, e := range entries {
		if !e.IsDir() && filepath.Ext(e.Name()) == ".gz" {
			files = append(files, e)
		}
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Name() < files[j].Name() })
	cutoff := time.Now().AddDate(0, 0, -retentionDays)
	for _, f := range files {
		info, err := f.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(cutoff) {
			os.Remove(filepath.Join(dir, f.Name())) //nolint:errcheck
		}
	}
}

