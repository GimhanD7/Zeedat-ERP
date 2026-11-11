using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

namespace ZeedatPOS
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            Mutex portableInstance = null;
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string appRoot = ResolveAppRoot(baseDir);
                PortableRuntime portable = PortableRuntime.Prepare(appRoot);
                if (portable != null)
                {
                    portableInstance = new Mutex(false, @"Local\ZeedatPOSPortable");
                    try { if (!portableInstance.WaitOne(0)) return; }
                    catch (AbandonedMutexException) {}
                    appRoot = portable.Root;
                }
                string configFile = Path.Combine(appRoot, "config.json");
                if (!File.Exists(configFile))
                {
                    configFile = Path.Combine(baseDir, "config.json");
                }

                string serverUrl = portable == null ? "http://127.0.0.1:8081" : "http://127.0.0.1:18081";
                int width = 1280;
                int height = 800;
                bool kiosk = false;

                if (portable != null)
                {
                    portable.PrepareDatabase();
                    if (args.Length == 1 && args[0] == "--prepare-only")
                    {
                        return;
                    }
                }
                else if (!File.Exists(configFile))
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

                // Auto-start local PHP backend (SQLite offline database) when pointing to localhost
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

                string dataDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "ZeedatPOS",
                    portable == null ? "UserData" : "PortableBrowser"
                );
                if (!Directory.Exists(dataDir))
                {
                    Directory.CreateDirectory(dataDir);
                }

                string arguments = string.Format(
                    "--app=\"{0}\" --user-data-dir=\"{1}\" --window-size={2},{3} --disable-backgrounding-occluded-windows --disable-background-mode",
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

                Process backend = EnsureLocalBackendRunning(appRoot, serverUrl, portable);
                try
                {
                    using (Process browser = Process.Start(psi))
                    {
                        if (portable != null && backend != null)
                        {
                            browser.WaitForExit();
                        }
                    }
                }
                finally
                {
                    if (backend != null)
                    {
                        if (portable != null && !backend.HasExited) backend.Kill();
                        backend.Dispose();
                    }
                }
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
            finally
            {
                if (portableInstance != null) portableInstance.Dispose();
            }
        }

        static string ResolveAppRoot(string baseDir)
        {
            if (File.Exists(Path.Combine(baseDir, "router.php")))
            {
                return baseDir;
            }
            DirectoryInfo parent = Directory.GetParent(baseDir.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
            if (parent != null && File.Exists(Path.Combine(parent.FullName, "router.php")))
            {
                return parent.FullName;
            }
            return baseDir;
        }

        static Process EnsureLocalBackendRunning(string appRoot, string serverUrl, PortableRuntime portable)
        {
            Uri uri;
            if (!Uri.TryCreate(serverUrl, UriKind.Absolute, out uri))
            {
                return null;
            }

            string host = uri.Host;
            int port = uri.Port > 0 ? uri.Port : 80;
            bool isLocal = host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase) ||
                           host.Equals("localhost", StringComparison.OrdinalIgnoreCase);

            if (!isLocal)
            {
                return null;
            }
            if (IsPortOpen(host, port))
            {
                if (portable != null) throw new InvalidOperationException("The local POS port is already in use.");
                return null;
            }

            string routerFile = Path.Combine(appRoot, "router.php");
            if (!File.Exists(routerFile))
            {
                return null;
            }

            string phpExe = FindPhpExecutable(appRoot);
            if (string.IsNullOrEmpty(phpExe))
            {
                return null;
            }

            ProcessStartInfo phpPsi = new ProcessStartInfo
            {
                FileName = phpExe,
                Arguments = string.Format("-S {0}:{1} \"{2}\"", host, port, routerFile),
                WorkingDirectory = appRoot,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            phpPsi.EnvironmentVariables["DB_DRIVER"] = "sqlite";
            if (portable != null) portable.ConfigurePhp(phpPsi);

            Process backend = null;
            try
            {
                backend = Process.Start(phpPsi);
                Stopwatch startup = Stopwatch.StartNew();
                while (!backend.HasExited && startup.ElapsedMilliseconds < 4000)
                {
                    if (IsPortOpen(host, port))
                    {
                        return backend;
                    }
                    Thread.Sleep(50);
                }
            }
            catch
            {
                if (portable != null) throw;
            }
            if (backend != null)
            {
                if (portable != null && !backend.HasExited) backend.Kill();
                backend.Dispose();
            }
            if (portable != null) throw new InvalidOperationException("The bundled PHP server could not start.");
            return null;
        }

        static string FindPhpExecutable(string appRoot)
        {
            string[] candidates = new string[]
            {
                Path.Combine(appRoot, @"php\php.exe"),
                @"C:\xampp\php\php.exe",
                "php.exe"
            };

            foreach (string c in candidates)
            {
                if (c.Equals("php.exe", StringComparison.OrdinalIgnoreCase) || File.Exists(c))
                {
                    return c;
                }
            }
            return null;
        }

        static bool IsPortOpen(string host, int port)
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    IAsyncResult res = client.BeginConnect(host, port, null, null);
                    bool ok = res.AsyncWaitHandle.WaitOne(TimeSpan.FromMilliseconds(250));
                    if (!ok) return false;
                    client.EndConnect(res);
                    return true;
                }
            }
            catch
            {
                return false;
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
