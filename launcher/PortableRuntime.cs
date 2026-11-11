using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Windows.Forms;

namespace ZeedatPOS
{
    sealed class PortableRuntime
    {
        public readonly string Root;
        readonly string dataDir;
        readonly string originalRoot;
        readonly string phpDir;

        PortableRuntime(string root, string data, string original)
        {
            Root = root;
            dataDir = data;
            originalRoot = original;
            phpDir = Path.Combine(root, "php");
        }

        public static PortableRuntime Prepare(string originalRoot)
        {
            using (Stream payload = Assembly.GetExecutingAssembly().GetManifestResourceStream("ZeedatRuntime.zip"))
            {
                if (payload == null) return null;

                string appDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ZeedatPOS");
                string version;
                using (SHA256 sha = SHA256.Create())
                    version = BitConverter.ToString(sha.ComputeHash(payload)).Replace("-", "").Substring(0, 20);
                payload.Position = 0;

                string versions = Path.Combine(appDir, "runtime");
                Directory.CreateDirectory(versions);
                string root = Path.Combine(versions, version);
                if (!Directory.Exists(root))
                {
                    string staging = Path.Combine(versions, Guid.NewGuid().ToString("N"));
                    Directory.CreateDirectory(staging);
                    try
                    {
                        using (ZipArchive archive = new ZipArchive(payload, ZipArchiveMode.Read, true))
                            archive.ExtractToDirectory(staging);
                        try { Directory.Move(staging, root); }
                        catch (IOException) { if (!Directory.Exists(root)) throw; }
                    }
                    finally
                    {
                        if (Directory.Exists(staging)) Directory.Delete(staging, true);
                    }
                }
                return new PortableRuntime(root, Path.Combine(appDir, "data"), originalRoot);
            }
        }

        public void ConfigurePhp(ProcessStartInfo process)
        {
            process.EnvironmentVariables["PHPRC"] = phpDir;
            process.EnvironmentVariables["PHP_INI_SCAN_DIR"] = "";
            process.EnvironmentVariables["DB_DRIVER"] = "sqlite";
            process.EnvironmentVariables["ZEEDAT_SQLITE_PATH"] = Path.Combine(dataDir, "zeedat_local.db");
            process.EnvironmentVariables["ZEEDAT_BACKUP_PATH"] = Path.Combine(dataDir, "backups");
            process.EnvironmentVariables["ZEEDAT_PORTABLE"] = "1";
        }

        public void PrepareDatabase()
        {
            Directory.CreateDirectory(dataDir);
            string sessions = Path.Combine(dataDir, "sessions");
            Directory.CreateDirectory(sessions);
            string caBundle = Path.Combine(phpDir, "cacert.pem");
            File.WriteAllLines(Path.Combine(phpDir, "php.ini"), new[] {
                "extension_dir=\"" + Path.Combine(phpDir, "ext") + "\"",
                "extension=pdo_sqlite", "extension=sqlite3", "extension=curl", "extension=mbstring",
                "extension=openssl", "extension=fileinfo",
                "curl.cainfo=\"" + caBundle + "\"",
                "openssl.cafile=\"" + caBundle + "\"",
                "session.save_path=\"" + sessions + "\"",
                "display_errors=Off", "log_errors=On",
                "error_log=\"" + Path.Combine(dataDir, "php.log") + "\"",
                "date.timezone=Asia/Colombo"
            });

            if (File.Exists(Path.Combine(dataDir, "zeedat_local.db"))) return;

            ProcessStartInfo setup = new ProcessStartInfo {
                FileName = Path.Combine(phpDir, "php.exe"),
                Arguments = "\"scripts/setup_portable.php\"",
                WorkingDirectory = Root,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true
            };
            setup.EnvironmentVariables["ZEEDAT_IMPORT_SQLITE"] = Path.Combine(originalRoot, "database", "zeedat_local.db");
            ConfigurePhp(setup);
            using (Process process = Process.Start(setup))
            {
                string output = process.StandardOutput.ReadToEnd().Trim();
                process.WaitForExit();
                if (process.ExitCode != 0)
                    throw new InvalidOperationException(output);
                if (output.Length > 0)
                    MessageBox.Show(output, "Zeedat POS Setup", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }
    }
}
