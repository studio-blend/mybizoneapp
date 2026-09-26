package updater

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"runtime"
	"testing"
)

func TestStableVersionOrdering(t *testing.T) {
	cases := []struct {
		latest, current string
		want            bool
	}{
		{"1.10.0", "1.9.9", true}, {"2.0.0", "1.99.99", true},
		{"1.2.4", "1.2.3", true}, {"1.2.3", "1.2.3", false},
		{"1.2.3", "2.0.0", false}, {"1.2.3", "1.10.0", false},
		{"1.2.4-beta", "1.2.3", false}, {"1.2.4", "dev", false},
		{"", "1.0.0", false}, {"1.-2.0", "1.1.0", false},
	}
	for _, tc := range cases {
		if got := newerStable(tc.latest, tc.current); got != tc.want {
			t.Errorf("newerStable(%q,%q)=%v want %v", tc.latest, tc.current, got, tc.want)
		}
	}
}

func TestUpdateCheckRequiresOptIn(t *testing.T) {
	t.Setenv("MYBIZONE_RELEASE_REPOSITORY", "")
	_, _, update, err := CheckForUpdate("1.0.0")
	if err != nil || update {
		t.Fatalf("disabled update check: %v %v", update, err)
	}
}

func TestUpdateHTTPAndAssetHandling(t *testing.T) {
	asset := "MyBizOne-windows.zip"
	if runtime.GOOS == "darwin" {
		asset = "MyBizOne.dmg"
	}
	if runtime.GOOS == "linux" {
		asset = "MyBizOne-linux.tar.gz"
	}
	cases := []struct {
		name                  string
		status                int
		release               Release
		wantUpdate, wantError bool
	}{
		{"new version", 200, Release{TagName: "v1.10.0", Assets: []Asset{{Name: asset, BrowserDownloadURL: "https://github.com/seller/product/releases/download/v1.10.0/asset"}}}, true, false},
		{"HTTP failure", 403, Release{}, false, true},
		{"missing platform", 200, Release{TagName: "v1.10.0"}, false, false},
		{"downgrade", 200, Release{TagName: "v1.0.0"}, false, false},
		{"unsafe download", 200, Release{TagName: "v1.10.0", Assets: []Asset{{Name: asset, BrowserDownloadURL: "file:///malicious.exe"}}}, false, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.status)
				_ = json.NewEncoder(w).Encode(tc.release)
			}))
			defer server.Close()
			_, _, update, err := checkForUpdate("v1.9.0", server.URL, server.Client())
			if update != tc.wantUpdate || (err != nil) != tc.wantError {
				t.Fatalf("update=%v err=%v", update, err)
			}
		})
	}
}
