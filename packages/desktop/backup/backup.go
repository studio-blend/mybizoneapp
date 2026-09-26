package backup

import (
	"compress/gzip"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
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
	if cfg.DatabaseURL == "" {
		return "", fmt.Errorf("database URL is required")
	}
	if cfg.RetentionDays <= 0 {
		cfg.RetentionDays = 30
	}
	f, err := os.CreateTemp(cfg.BackupDir, ".backup-*.partial")
	if err != nil {
		return "", err
	}
	defer func() {
		f.Close()
		os.Remove(f.Name())
	}()
	outPath := filepath.Join(cfg.BackupDir, time.Now().Format("2006-01-02_15-04-05.000000000")+".sql.gz")
	gz := gzip.NewWriter(f)
	defer gz.Close()
	cmd := exec.Command(cfg.PgDumpPath, cfg.DatabaseURL)
	cmd.Stdout = gz
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("pg_dump failed: %w", err)
	}
	if err := gz.Close(); err != nil {
		return "", err
	}
	if err := f.Sync(); err != nil {
		return "", err
	}
	if err := f.Close(); err != nil {
		return "", err
	}
	if err := os.Rename(f.Name(), outPath); err != nil {
		return "", err
	}
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
	// Validate the complete compressed archive before changing the destination DB.
	if _, err := io.Copy(io.Discard, gz); err != nil {
		return fmt.Errorf("invalid backup: %w", err)
	}
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return err
	}
	if err := gz.Reset(f); err != nil {
		return err
	}
	psql := "psql"
	if strings.HasSuffix(cfg.PgDumpPath, ".exe") {
		psql += ".exe"
	}
	cmd := exec.Command(filepath.Join(filepath.Dir(cfg.PgDumpPath), psql), "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--single-transaction", cfg.DatabaseURL)
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
		if _, err := RunBackup(cfg); err != nil {
			log.Printf("Backup failed: %v", err)
		}
		ticker := time.NewTicker(24 * time.Hour)
		for range ticker.C {
			if _, err := RunBackup(cfg); err != nil {
				log.Printf("Backup failed: %v", err)
			}
		}
	}()
}

// ListBackups returns list of backup files sorted newest first.
func ListBackups(backupDir string) ([]BackupFile, error) {
	dirInfo, err := os.Stat(backupDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	if !dirInfo.IsDir() {
		return nil, fmt.Errorf("backup path is not a directory: %s", backupDir)
	}
	entries, err := os.ReadDir(backupDir)
	if err != nil { return nil, err }
	var result []BackupFile
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql.gz") {
			info, err := e.Info()
			if err != nil {
				return nil, err
			}
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
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql.gz") {
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
