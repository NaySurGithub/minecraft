package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type Config struct {
	DefaultURL   string `json:"default_url"`
	BypassPrompt bool   `json:"bypass_prompt"`
}

func main() {
	var registerFlag bool
	var silentFlag bool
	var customURLFlag string
	var filePath string

	for i := 1; i < len(os.Args); i++ {
		arg := os.Args[i]
		if arg == "-register" || arg == "--register" {
			registerFlag = true
		} else if arg == "-silent" || arg == "--silent" {
			silentFlag = true
		} else if (arg == "-url" || arg == "--url") && i+1 < len(os.Args) {
			customURLFlag = os.Args[i+1]
			i++
		} else if strings.HasPrefix(arg, "-") {
		} else {
			filePath = arg
		}
	}

	if registerFlag {
		err := registerAssociation()
		if err != nil {
			fmt.Printf("Error registering file association: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("Successfully registered .nzlevel file association!")
		fmt.Println("Double-clicking .nzlevel files will now open them with this handler.")
		time.Sleep(3 * time.Second)
		return
	}

	if filePath == "" {
		showHelp()
		return
	}

	exePath, err := os.Executable()
	if err != nil {
		fmt.Printf("Error getting executable path: %v\n", err)
		os.Exit(1)
	}
	exeDir := filepath.Dir(exePath)
	configPath := filepath.Join(exeDir, "config.json")
	
	config := Config{
		DefaultURL:   "https://nazzacraft.netlify.app/",
		BypassPrompt: false,
	}

	if file, err := os.Open(configPath); err == nil {
		defer file.Close()
		decoder := json.NewDecoder(file)
		if err := decoder.Decode(&config); err != nil {
			fmt.Printf("Warning: Failed to parse config.json: %v\n", err)
		}
	} else {
		if data, err := json.MarshalIndent(config, "", "  "); err == nil {
			_ = os.WriteFile(configPath, data, 0644)
		}
	}

	targetURL := config.DefaultURL
	if customURLFlag != "" {
		targetURL = customURLFlag
	}

	if !silentFlag && !config.BypassPrompt {
		targetURL = promptUserForWebsite(targetURL)
	}

	absFilePath, err := filepath.Abs(filePath)
	if err != nil {
		fmt.Printf("Failed to get absolute path for file: %v\n", err)
		os.Exit(1)
	}
	fileBytes, err := os.ReadFile(absFilePath)
	if err != nil {
		fmt.Printf("Failed to read file: %v\n", err)
		os.Exit(1)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		fmt.Printf("Failed to start local server listener: %v\n", err)
		os.Exit(1)
	}
	port := listener.Addr().(*net.TCPAddr).Port

	done := make(chan bool, 1)

	http.HandleFunc("/world.nzlevel", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.Write(fileBytes)
		select {
		case done <- true:
		default:
		}
	})

	server := &http.Server{}
	go func() {
		_ = server.Serve(listener)
	}()

	localFileURL := fmt.Sprintf("http://127.0.0.1:%d/world.nzlevel", port)
	separator := "?"
	if strings.Contains(targetURL, "?") {
		separator = "&"
	}
	browserURL := fmt.Sprintf("%s%simportUrl=%s", targetURL, separator, localFileURL)

	fmt.Printf("Launching browser to load world...\nURL: %s\n", browserURL)
	err = openBrowser(browserURL)
	if err != nil {
		fmt.Printf("Failed to open browser: %v\n", err)
	}

	select {
	case <-done:
		fmt.Println("World data successfully requested by the game.")
		time.Sleep(1500 * time.Millisecond)
	case <-time.After(15 * time.Second):
		fmt.Println("Timed out waiting for browser to fetch world data.")
	}

	_ = server.Close()
}

func showHelp() {
	fmt.Println("NazzaCraft .nzlevel File Handler")
	fmt.Println("===============================")
	fmt.Println("Usage:")
	fmt.Println("  nzlevel-handler.exe <path-to-file.nzlevel>")
	fmt.Println("  nzlevel-handler.exe -register            (Register file association on Windows)")
	fmt.Println("  nzlevel-handler.exe -silent <file>       (Bypass website choice prompt)")
	fmt.Println("  nzlevel-handler.exe -url <web-url> <file> (Override destination site URL)")
	fmt.Println()
	fmt.Println("Press Enter to exit...")
	bufio.NewReader(os.Stdin).ReadBytes('\n')
}

func promptUserForWebsite(defaultURL string) string {
	fmt.Println("NazzaCraft World Loader")
	fmt.Println("=======================")
	fmt.Printf("Default Website: %s\n\n", defaultURL)
	fmt.Println("Choose target website:")
	fmt.Println("  [1] Default Website")
	fmt.Println("  [2] Custom Website URL")
	fmt.Print("\nEnter choice (1 or 2, default is 1): ")

	reader := bufio.NewReader(os.Stdin)
	choiceRaw, _ := reader.ReadString('\n')
	choice := strings.TrimSpace(choiceRaw)

	if choice == "2" {
		fmt.Print("Enter website URL (e.g. http://localhost:5173/ or https://nazzacraft.netlify.app/): ")
		urlRaw, _ := reader.ReadString('\n')
		url := strings.TrimSpace(urlRaw)
		if url != "" {
			if !strings.HasPrefix(url, "http://") && !strings.HasPrefix(url, "https://") {
				url = "https://" + url
			}
			return url
		}
	}
	return defaultURL
}

func openBrowser(url string) error {
	escapedURL := strings.ReplaceAll(url, "&", "^&")
	cmd := exec.Command("cmd", "/c", "start", escapedURL)
	return cmd.Run()
}

func registerAssociation() error {
	exePath, err := os.Executable()
	if err != nil {
		return err
	}

	cmd1 := exec.Command("reg", "add", "HKCU\\Software\\Classes\\.nzlevel", "/ve", "/t", "REG_SZ", "/d", "nzlevel.file", "/f")
	if err := cmd1.Run(); err != nil {
		return fmt.Errorf("failed to register extension: %v", err)
	}

	cmd2 := exec.Command("reg", "add", "HKCU\\Software\\Classes\\nzlevel.file", "/ve", "/t", "REG_SZ", "/d", "NazzaCraft Level File", "/f")
	if err := cmd2.Run(); err != nil {
		return fmt.Errorf("failed to register file type: %v", err)
	}

	openCmd := fmt.Sprintf("\"%s\" \"%%1\"", exePath)
	cmd3 := exec.Command("reg", "add", "HKCU\\Software\\Classes\\nzlevel.file\\shell\\open\\command", "/ve", "/t", "REG_SZ", "/d", openCmd, "/f")
	if err := cmd3.Run(); err != nil {
		return fmt.Errorf("failed to register shell command: %v", err)
	}

	return nil
}
