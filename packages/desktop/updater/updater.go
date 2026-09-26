package updater

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type Release struct {
	TagName string  `json:"tag_name"`
	HTMLURL string  `json:"html_url"`
	Assets  []Asset `json:"assets"`
}

type Asset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

// CheckForUpdate returns (latestVersion, downloadURL, hasUpdate, error)
func CheckForUpdate(currentVersion string) (string, string, bool, error) {
	repository := os.Getenv("MYBIZONE_RELEASE_REPOSITORY")
	if repository == "" {
		return "", "", false, nil
	}
	parts := strings.Split(repository, "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false, fmt.Errorf("invalid release repository")
	}
	client := &http.Client{Timeout: 10 * time.Second}
	return checkForUpdate(currentVersion, "https://api.github.com/repos/"+url.PathEscape(parts[0])+"/"+url.PathEscape(parts[1])+"/releases/latest", client)
}

func checkForUpdate(currentVersion, endpoint string, client *http.Client) (string, string, bool, error) {
	resp, err := client.Get(endpoint)
	if err != nil {
		return "", "", false, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", "", false, fmt.Errorf("release endpoint returned %d", resp.StatusCode)
	}
	var release Release
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1024*1024)).Decode(&release); err != nil {
		return "", "", false, err
	}
	latest := strings.TrimPrefix(release.TagName, "v")
	current := strings.TrimPrefix(currentVersion, "v")
	if !newerStable(latest, current) {
		return latest, "", false, nil
	}
	// Find platform-appropriate asset
	var downloadURL string
	for _, a := range release.Assets {
		if runtime.GOOS == "windows" && strings.HasSuffix(a.Name, "-windows.zip") {
			downloadURL = a.BrowserDownloadURL
		} else if runtime.GOOS == "darwin" && strings.HasSuffix(a.Name, ".dmg") {
			downloadURL = a.BrowserDownloadURL
		} else if runtime.GOOS == "linux" && strings.HasSuffix(a.Name, "-linux.tar.gz") {
			downloadURL = a.BrowserDownloadURL
		}
	}
	if downloadURL == "" {
		return latest, "", false, nil
	}
	parsed, err := url.Parse(downloadURL)
	if err != nil || parsed.Scheme != "https" || parsed.Host != "github.com" {
		return latest, "", false, fmt.Errorf("release asset must be an HTTPS GitHub download")
	}
	return latest, downloadURL, true, nil
}

func newerStable(latest, current string) bool {
	l, c := strings.Split(latest, "."), strings.Split(current, ".")
	if len(l) != 3 || len(c) != 3 {
		return false
	}
	comparison := 0
	for i := 0; i < 3; i++ {
		lv, le := strconv.Atoi(l[i])
		cv, ce := strconv.Atoi(c[i])
		if le != nil || ce != nil || lv < 0 || cv < 0 {
			return false
		}
		if comparison == 0 && lv > cv {
			comparison = 1
		}
		if comparison == 0 && lv < cv {
			comparison = -1
		}
	}
	return comparison > 0
}

// NotifyUpdate prints the release URL (system tray notification handled in main.go)
func NotifyUpdate(releaseURL string) {
	fmt.Printf("Update available! Download at: %s\n", releaseURL)
}
