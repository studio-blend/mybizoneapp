package main

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"

	"github.com/getlantern/systray"
	"github.com/pkg/browser"
)

// Config holds the persistent configuration written by the /setup wizard.
type Config struct {
	Port       int    `json:"port"`
	SetupDone  bool   `json:"setupDone"`
	LicenseKey string `json:"licenseKey"`
	DataDir    string `json:"dataDir"`
	AutoStart  bool   `json:"autoStart"`
}

var (
	appDir     string // directory containing MyBizOne.exe
	configPath string
	cfg        Config
	pgCmd      *exec.Cmd
	nodeCmd    *exec.Cmd
)

func main() {
	// Resolve app directory (where MyBizOne.exe lives)
	exe, _ := os.Executable()
	appDir = filepath.Dir(exe)
	configPath = filepath.Join(appDir, "config.json")

	// Load or create config
	loadConfig()

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

	startPostgres()
	waitForPostgres()
	runMigrations()

	systray.SetTooltip("MyBizOne — Starting server...")
	startNode()
	waitForApp()

	systray.SetTooltip("MyBizOne — Running on :" + fmt.Sprint(cfg.Port))

	// Open browser to setup if not done, else dashboard
	if !cfg.SetupDone {
		browser.OpenURL(fmt.Sprintf("http://localhost:%d/setup", cfg.Port))
	} else {
		browser.OpenURL(fmt.Sprintf("http://localhost:%d/dashboard", cfg.Port))
	}
}

func dataDir() string {
	if cfg.DataDir != "" {
		return cfg.DataDir
	}
	return filepath.Join(appDir, "data")
}

func startPostgres() {
	pgBin := filepath.Join(appDir, "postgres", "bin")
	dd := dataDir()

	// Ensure sockets directory exists
	socketsDir := filepath.Join(dd, "sockets")
	os.MkdirAll(socketsDir, 0755)

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
			showError("Failed to initialise database: " + err.Error())
			return
		}
	}

	pgCtlPath := filepath.Join(pgBin, pgExe("pg_ctl"))
	pgCmd = exec.Command(
		pgCtlPath,
		"start",
		"-D", dd,
		"-o", fmt.Sprintf(`-p 54321 -k "%s"`, socketsDir),
		"-l", filepath.Join(dd, "postgres.log"),
	)
	pgCmd.Run() // pg_ctl start returns immediately
}

func waitForPostgres() {
	pgBin := filepath.Join(appDir, "postgres", "bin")
	for i := 0; i < 30; i++ {
		check := exec.Command(filepath.Join(pgBin, pgExe("pg_isready")), "-p", "54321", "-h", "127.0.0.1")
		if err := check.Run(); err == nil {
			return
		}
		time.Sleep(1 * time.Second)
	}
	showError("Postgres did not start in 30 seconds. Check data/postgres.log.")
}

func runMigrations() {
	nodeExe := nodeExePath()
	migrateScript := filepath.Join(appDir, "app", "scripts", "migrate.js")

	// Only run if the migrate script exists
	if _, err := os.Stat(migrateScript); os.IsNotExist(err) {
		fmt.Fprintln(os.Stderr, "WARN: migrate.js not found, skipping migrations")
		return
	}

	cmd := exec.Command(nodeExe, migrateScript)
	cmd.Env = append(os.Environ(),
		"DATABASE_URL=postgresql://postgres@127.0.0.1:54321/mybizone",
		"NODE_ENV=production",
	)
	cmd.Dir = filepath.Join(appDir, "app")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		showError("Database migration failed: " + err.Error())
	}
}

func startNode() {
	nodeExe := nodeExePath()
	serverJS := filepath.Join(appDir, "app", "server.js")
	nodeCmd = exec.Command(nodeExe, serverJS)

	secret := cfg.LicenseKey
	if secret == "" {
		secret = "desktop-mode-secret-placeholder-32ch"
	}

	nodeCmd.Env = append(os.Environ(),
		"DATABASE_URL=postgresql://postgres@127.0.0.1:54321/mybizone",
		fmt.Sprintf("PORT=%d", cfg.Port),
		"NODE_ENV=production",
		"LAN_MODE=true",
		fmt.Sprintf("BETTER_AUTH_URL=http://localhost:%d", cfg.Port),
		fmt.Sprintf("BETTER_AUTH_SECRET=%s", secret),
		fmt.Sprintf("APP_DIR=%s", appDir),
		fmt.Sprintf("PORTABLE_MODE=true"),
		fmt.Sprintf("SETUP_COMPLETE=%s", boolStr(cfg.SetupDone)),
		fmt.Sprintf("LICENSE_KEY=%s", cfg.LicenseKey),
		fmt.Sprintf("NEXT_PUBLIC_APP_VERSION=%s", appVersion()),
	)
	nodeCmd.Dir = filepath.Join(appDir, "app")
	nodeCmd.Stdout = os.Stdout
	nodeCmd.Stderr = os.Stderr
	if err := nodeCmd.Start(); err != nil {
		showError("Failed to start Node.js server: " + err.Error())
	}
}

func waitForApp() {
	url := fmt.Sprintf("http://localhost:%d/api/health", cfg.Port)
	for i := 0; i < 60; i++ {
		resp, err := http.Get(url)
		if err == nil && resp.StatusCode == 200 {
			resp.Body.Close()
			return
		}
		if resp != nil {
			resp.Body.Close()
		}
		time.Sleep(2 * time.Second)
	}
	// App may still be starting — don't block browser open
	fmt.Fprintln(os.Stderr, "WARN: /api/health did not return 200 within 120s; opening browser anyway")
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
	json.Unmarshal(data, &cfg)
}

func saveConfig() {
	data, _ := json.MarshalIndent(cfg, "", "  ")
	os.WriteFile(configPath, data, 0644)
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
	fmt.Fprintln(os.Stderr, "ERROR:", msg)
}

func boolStr(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

func appVersion() string {
	versionFile := filepath.Join(appDir, "VERSION")
	data, err := os.ReadFile(versionFile)
	if err != nil {
		return "dev"
	}
	return string(data)
}
