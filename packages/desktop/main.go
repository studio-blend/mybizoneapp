package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"github.com/getlantern/systray"
	"github.com/mybizone/desktop/backup"
	"github.com/mybizone/desktop/updater"
	"github.com/pkg/browser"
)

// Version is set via ldflags: -X main.Version=v1.0.0
var Version = "dev"

// Config holds the persistent configuration written by the /setup wizard.
type Config struct {
	Port       int    `json:"port"`
	SetupDone  bool   `json:"setupDone"`
	LicenseKey string `json:"licenseKey"`
	DataDir    string `json:"dataDir"`
	AutoStart  bool   `json:"autoStart"`
	AuthSecret string `json:"authSecret"`
}

var (
	appDir          string // directory containing MyBizOne.exe
	configPath      string
	cfg             Config
	pgCmd           *exec.Cmd
	nodeCmd         *exec.Cmd
	maintenanceOnce sync.Once
	minimized       bool
)

func main() {
	// Parse flags
	showVersion := flag.Bool("version", false, "Print version and exit")
	flag.BoolVar(&minimized, "minimized", false, "Start in the system tray")
	flag.Parse()

	if *showVersion {
		fmt.Println(Version)
		os.Exit(0)
	}

	// Resolve app directory (where MyBizOne.exe lives)
	exe, _ := os.Executable()
	appDir = filepath.Dir(exe)
	configPath = filepath.Join(appDir, "config.json")

	// Load or create config
	loadConfig()
	if cfg.AuthSecret == "" {
		secret := make([]byte, 32)
		if _, err := rand.Read(secret); err != nil {
			log.Fatal(err)
		}
		cfg.AuthSecret = hex.EncodeToString(secret)
	}
	saveConfig()

	// Find a free port if default (3000) is taken
	cfg.Port = findPort(cfg.Port)

	// Start systray (blocks until quit)
	systray.Run(onReady, onExit)
}

func onReady() {
	systray.SetTitle("MyBizOne")
	systray.SetTooltip("MyBizOne — Starting...")

	mOpen := systray.AddMenuItem("Open MyBizOne", "Open in browser")
	systray.AddSeparator()
	mRestart := systray.AddMenuItem("Restart", "Restart the server")
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("Stop & Exit", "Stop the server and exit")

	// Start the backend in a goroutine
	go startBackend()

	// Handle menu clicks
	go func() {
		for {
			select {
			case <-mOpen.ClickedCh:
				openBrowser()
			case <-mRestart.ClickedCh:
				restartBackend()
			case <-mQuit.ClickedCh:
				stopBackend()
				systray.Quit()
			}
		}
	}()
}

func onExit() {
	stopBackend()
}

func startBackend() {
	systray.SetTooltip("MyBizOne — Starting Postgres...")

	if err := startPostgres(); err != nil {
		showError(err.Error())
		return
	}
	if err := waitForPostgres(); err != nil {
		showError(err.Error())
		return
	}
	if err := ensureDatabase(); err != nil {
		showError(err.Error())
		return
	}
	if err := runMigrations(); err != nil {
		showError(err.Error())
		return
	}

	systray.SetTooltip("MyBizOne — Starting server...")
	if err := startNode(); err != nil {
		showError(err.Error())
		return
	}
	if err := waitForApp(); err != nil {
		showError(err.Error())
		return
	}

	systray.SetTooltip("MyBizOne — Running on :" + fmt.Sprint(cfg.Port))

	// Open browser to setup if not done, else dashboard
	if !minimized {
		openBrowser()
	}

	// Schedule daily backups (1-minute offset to let app stabilize)
	maintenanceOnce.Do(func() {
		backup.ScheduleDailyBackup(backup.Config{
			BackupDir:     getDataDir() + "/backups",
			PgDumpPath:    getPgDumpPath(),
			DatabaseURL:   "postgresql://postgres@127.0.0.1:54321/mybizone",
			RetentionDays: 30,
		})

		// Check for updates at startup and every 24h
		go func() {
			time.Sleep(30 * time.Second) // let app stabilize
			latest, url, hasUpdate, err := updater.CheckForUpdate(Version)
			if err == nil && hasUpdate {
				log.Printf("Update available: %s — %s", latest, url)
				openBrowserURL(url)
			}
			ticker := time.NewTicker(24 * time.Hour)
			for range ticker.C {
				latest, url, hasUpdate, err = updater.CheckForUpdate(Version)
				if err == nil && hasUpdate {
					log.Printf("Update available: %s", latest)
				}
			}
		}()
	})
}

func getDataDir() string {
	return dataDir()
}

func getPgDumpPath() string {
	pgBin := filepath.Join(appDir, "postgres", "bin")
	return filepath.Join(pgBin, pgExe("pg_dump"))
}

func dataDir() string {
	if cfg.DataDir != "" {
		return cfg.DataDir
	}
	return filepath.Join(appDir, "data")
}

func startPostgres() error {
	pgBin := filepath.Join(appDir, "postgres", "bin")
	dd := dataDir()

	// Ensure sockets directory exists
	socketsDir := filepath.Join(dd, "sockets")

	// Init if first run
	if _, err := os.Stat(filepath.Join(dd, "PG_VERSION")); os.IsNotExist(err) {
		initdb := exec.Command(
			filepath.Join(pgBin, pgExe("initdb")),
			"-D", dd,
			"-U", "postgres",
			"--encoding=UTF8",
			"--locale=C",
		)
		initdb.Stdout = os.Stdout
		initdb.Stderr = os.Stderr
		if err := initdb.Run(); err != nil {
			return fmt.Errorf("initialise database: %w", err)
		}
	}
	if err := os.MkdirAll(socketsDir, 0700); err != nil {
		return err
	}

	pgCtlPath := filepath.Join(pgBin, pgExe("pg_ctl"))
	pgCmd = exec.Command(
		pgCtlPath,
		"start",
		"-D", dd,
		"-o", `-p 54321 -h 127.0.0.1`,
		"-l", filepath.Join(dd, "postgres.log"),
	)
	return pgCmd.Run()
}

func waitForPostgres() error {
	pgBin := filepath.Join(appDir, "postgres", "bin")
	for i := 0; i < 30; i++ {
		check := exec.Command(filepath.Join(pgBin, pgExe("pg_isready")), "-p", "54321", "-h", "127.0.0.1")
		if err := check.Run(); err == nil {
			return nil
		}
		time.Sleep(1 * time.Second)
	}
	return fmt.Errorf("Postgres did not start in 30 seconds. Check data/postgres.log")
}

func ensureDatabase() error {
	cmd := exec.Command(filepath.Join(appDir, "postgres", "bin", pgExe("psql")), "-h", "127.0.0.1", "-p", "54321", "-U", "postgres", "-d", "postgres", "-tAc", "SELECT 1 FROM pg_database WHERE datname='mybizone'")
	out, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("check database: %w", err)
	}
	if len(out) > 1 {
		return nil
	}
	return exec.Command(filepath.Join(appDir, "postgres", "bin", pgExe("createdb")), "-h", "127.0.0.1", "-p", "54321", "-U", "postgres", "mybizone").Run()
}

func runMigrations() error {
	nodeExe := nodeExePath()
	migrateScript := filepath.Join(appDir, "app", "scripts", "migrate.mjs")

	// Only run if the migrate script exists
	if _, err := os.Stat(migrateScript); os.IsNotExist(err) {
		return fmt.Errorf("required migration script missing: %s", migrateScript)
	}

	cmd := exec.Command(nodeExe, migrateScript)
	cmd.Env = append(os.Environ(),
		"DATABASE_URL=postgresql://postgres@127.0.0.1:54321/mybizone",
		"NODE_ENV=production",
	)
	cmd.Dir = filepath.Join(appDir, "app")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func startNode() error {
	nodeExe := nodeExePath()
	serverJS := filepath.Join(appDir, "app", "apps", "web", "server.js")
	nodeCmd = exec.Command(nodeExe, serverJS)

	secret := cfg.AuthSecret

	nodeCmd.Env = append(os.Environ(),
		"DATABASE_URL=postgresql://postgres@127.0.0.1:54321/mybizone",
		fmt.Sprintf("PORT=%d", cfg.Port),
		"NODE_ENV=production",
		"LAN_MODE=true",
		"HOSTNAME=127.0.0.1",
		"STORAGE_BACKEND=local",
		fmt.Sprintf("STORAGE_DIR=%s", filepath.Join(appDir, "uploads")),
		fmt.Sprintf("BACKUP_DIR=%s", filepath.Join(dataDir(), "backups")),
		fmt.Sprintf("PATH=%s%c%s", filepath.Join(appDir, "postgres", "bin"), os.PathListSeparator, os.Getenv("PATH")),
		fmt.Sprintf("BETTER_AUTH_URL=http://localhost:%d", cfg.Port),
		fmt.Sprintf("BETTER_AUTH_SECRET=%s", secret),
		fmt.Sprintf("APP_DIR=%s", appDir),
		fmt.Sprintf("PORTABLE_MODE=true"),
		fmt.Sprintf("SETUP_COMPLETE=%s", boolStr(cfg.SetupDone)),
		fmt.Sprintf("LICENSE_KEY=%s", cfg.LicenseKey),
		fmt.Sprintf("NEXT_PUBLIC_APP_VERSION=%s", Version),
	)
	nodeCmd.Dir = filepath.Join(appDir, "app")
	nodeCmd.Stdout = os.Stdout
	nodeCmd.Stderr = os.Stderr
	return nodeCmd.Start()
}

func waitForApp() error {
	url := fmt.Sprintf("http://localhost:%d/api/health", cfg.Port)
	client := &http.Client{Timeout: 2 * time.Second}
	for i := 0; i < 60; i++ {
		resp, err := client.Get(url)
		if err == nil && resp.StatusCode == 200 {
			resp.Body.Close()
			return nil
		}
		if resp != nil {
			resp.Body.Close()
		}
		time.Sleep(2 * time.Second)
	}
	return fmt.Errorf("application health check failed; inspect the server logs")
}

func stopBackend() {
	if nodeCmd != nil && nodeCmd.Process != nil {
		nodeCmd.Process.Kill()
		nodeCmd = nil
	}
	pgBin := filepath.Join(appDir, "postgres", "bin")
	dd := dataDir()
	exec.Command(filepath.Join(pgBin, pgExe("pg_ctl")), "stop", "-D", dd, "-m", "fast").Run()
}

func restartBackend() {
	stopBackend()
	time.Sleep(2 * time.Second)
	go startBackend()
}

func openBrowser() {
	url := fmt.Sprintf("http://localhost:%d", cfg.Port)
	if !cfg.SetupDone {
		url += "/setup"
	} else {
		url += "/dashboard"
	}
	browser.OpenURL(url)
}

func openBrowserURL(url string) {
	browser.OpenURL(url)
}

func nodeExePath() string {
	if runtime.GOOS == "windows" {
		return filepath.Join(appDir, "node", "node.exe")
	}
	return filepath.Join(appDir, "node", "bin", "node")
}

// pgExe returns the platform-specific binary name.
// On Windows, PostgreSQL binaries have a .exe suffix.
func pgExe(name string) string {
	if runtime.GOOS == "windows" {
		return name + ".exe"
	}
	return name
}

func loadConfig() {
	cfg = Config{Port: 3000, DataDir: filepath.Join(appDir, "data")}
	data, err := os.ReadFile(configPath)
	if err != nil {
		return // first run, use defaults
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		log.Fatal("Invalid config.json: ", err)
	}
}

func saveConfig() {
	data, _ := json.MarshalIndent(cfg, "", "  ")
	if err := os.WriteFile(configPath, data, 0600); err != nil {
		log.Fatal("Save config: ", err)
	}
}

func findPort(preferred int) int {
	for port := preferred; port < preferred+10; port++ {
		ln, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
		if err == nil {
			ln.Close()
			return port
		}
	}
	return preferred
}

func showError(msg string) {
	systray.SetTooltip("MyBizOne — Startup failed")
	fmt.Fprintln(os.Stderr, "ERROR:", msg)
}

func boolStr(b bool) string {
	if b {
		return "true"
	}
	return "false"
}
