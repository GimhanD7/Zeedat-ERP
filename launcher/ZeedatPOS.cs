using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

namespace ZeedatPOS
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string configFile = Path.Combine(baseDir, "config.json");
                string serverUrl = "http://127.0.0.1:8081";
                int width = 1280;
                int height = 800;
                bool kiosk = false;

                // Load or create config.json
                if (!File.Exists(configFile))
                {
                    string defaultConfig = "{\n" +
                        "  \"server_url\": \"http://127.0.0.1:8081\",\n" +
                        "  \"window_width\": 1280,\n" +
                        "  \"window_height\": 800,\n" +
                        "  \"kiosk_mode\": false\n" +
                        "}";
                    File.WriteAllText(configFile, defaultConfig);
                }
                else
                {
                    string content = File.ReadAllText(configFile);
                    string urlMatch = ExtractJsonValue(content, "server_url");
                    if (!string.IsNullOrEmpty(urlMatch))
                    {
                        serverUrl = urlMatch;
                    }
                    string kioskMatch = ExtractJsonValue(content, "kiosk_mode");
                    if (kioskMatch.Equals("true", StringComparison.OrdinalIgnoreCase))
                    {
                        kiosk = true;
                    }
                }

                // Find Browser Executable (Edge or Chrome)
                string browserPath = FindBrowser();
                if (string.IsNullOrEmpty(browserPath))
                {
                    MessageBox.Show(
                        "Could not find Microsoft Edge or Google Chrome on this computer.\nPlease install Microsoft Edge or Chrome to run Zeedat POS.",
                        "Zeedat POS - Error",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return;
                }

                // Isolated profile directory for POS offline data
                string dataDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "ZeedatPOS",
                    "UserData"
                );
                if (!Directory.Exists(dataDir))
                {
                    Directory.CreateDirectory(dataDir);
                }

                // Build browser launch arguments
                string arguments = string.Format(
                    "--app=\"{0}\" --user-data-dir=\"{1}\" --window-size={2},{3} --disable-backgrounding-occluded-windows",
                    serverUrl,
                    dataDir,
                    width,
                    height
                );

                if (kiosk)
                {
                    arguments += " --kiosk";
                }

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = browserPath,
                    Arguments = arguments,
                    UseShellExecute = true
                };

                Process.Start(psi);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Failed to launch Zeedat POS:\n" + ex.Message,
                    "Zeedat POS - Startup Error",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }

        static string FindBrowser()
        {
            string[] possiblePaths = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\Chrome\Application\chrome.exe"),
            };

            foreach (string p in possiblePaths)
            {
                if (File.Exists(p))
                {
                    return p;
                }
            }

            return null;
        }

        static string ExtractJsonValue(string json, string key)
        {
            try
            {
                string search = "\"" + key + "\"";
                int idx = json.IndexOf(search, StringComparison.OrdinalIgnoreCase);
                if (idx == -1) return "";
                int colon = json.IndexOf(':', idx + search.Length);
                if (colon == -1) return "";
                int start = colon + 1;
                while (start < json.Length && (char.IsWhiteSpace(json[start]) || json[start] == '"'))
                {
                    start++;
                }
                int end = start;
                while (end < json.Length && json[end] != '"' && json[end] != ',' && json[end] != '\r' && json[end] != '\n' && json[end] != '}')
                {
                    end++;
                }
                return json.Substring(start, end - start).Trim();
            }
            catch
            {
                return "";
            }
        }
    }
}
