package updater

import (
	"encoding/json"
	"fmt"
	"net/http"
	"runtime"
	"strings"
)

const githubReleasesAPI = "https://api.github.com/repos/YOUR_ORG/mybizonelaunch/releases/latest"

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
	resp, err := http.Get(githubReleasesAPI)
	if err != nil {
		return "", "", false, err
	}
	defer resp.Body.Close()
	var release Release
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return "", "", false, err
	}
	latest := strings.TrimPrefix(release.TagName, "v")
	current := strings.TrimPrefix(currentVersion, "v")
	if latest == current || latest == "" {
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
	return latest, downloadURL, true, nil
}

// NotifyUpdate prints the release URL (system tray notification handled in main.go)
func NotifyUpdate(releaseURL string) {
	fmt.Printf("Update available! Download at: %s\n", releaseURL)
}
