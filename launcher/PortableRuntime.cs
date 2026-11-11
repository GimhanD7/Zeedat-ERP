using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Timer = System.Threading.Timer;

namespace ZeedatPOS
{
    sealed class PortableRuntime
    {
        public string Root { get; private set; }
        public string PhpExecutable { get { return Path.Combine(phpDir, "php.exe"); } }
        readonly string dataDir;
        readonly string originalRoot;
        readonly string phpDir;
        readonly string patchesDir;
        const string Server = "https://zeedat.vortexdigitallabs.org/";
        static readonly Regex PatchId = new Regex(@"\A[A-Za-z0-9][A-Za-z0-9._-]{3,79}\z");

        PortableRuntime(string root, string data, string original)
        {
            Root = root;
            dataDir = data;
            originalRoot = original;
            phpDir = Path.Combine(root, "php");
            patchesDir = Path.Combine(Path.GetDirectoryName(dataDir), "portable-patches");
        }

        sealed class Patch
        {
            public string app_id { get; set; }
            public string patch_id { get; set; }
            public string zip_sha256 { get; set; }
            public int size_bytes { get; set; }
            public string built_at { get; set; }
            public string download_route { get; set; }
        }

        static Patch ReadPatch(string json)
        {
            Patch patch = new JavaScriptSerializer().Deserialize<Patch>(json);
            DateTimeOffset builtAt;
            if (patch == null || patch.app_id != "com.zeedat.pos" || !PatchId.IsMatch(patch.patch_id ?? "")
                || !Regex.IsMatch(patch.zip_sha256 ?? "", @"\A[a-fA-F0-9]{64}\z")
                || patch.size_bytes <= 0 || patch.size_bytes > 50 * 1024 * 1024
                || !DateTimeOffset.TryParse(patch.built_at, out builtAt))
                throw new InvalidDataException("Invalid desktop update manifest.");
            return patch;
        }

        static string ManifestPath(string root)
        {
            return Path.Combine(root, "updates", "patch-manifest.json");
        }

        static bool CompletePatch(string root)
        {
            return File.Exists(Path.Combine(root, "router.php"))
                && File.Exists(Path.Combine(root, "dist", "index.html"))
                && File.Exists(Path.Combine(root, "api", "public", "index.php"))
                && File.Exists(Path.Combine(root, "scripts", "setup_portable.php"));
        }

        public void ActivateStagedUpdate()
        {
            string pointer = Path.Combine(patchesDir, "active.txt");
            if (!File.Exists(pointer)) return;
            try
            {
                string id = File.ReadAllText(pointer).Trim();
                if (!PatchId.IsMatch(id)) return;
                string staged = Path.Combine(patchesDir, id);
                if (!CompletePatch(staged)) return;
                Patch update = ReadPatch(File.ReadAllText(ManifestPath(staged)));
                Patch bundled = ReadPatch(File.ReadAllText(ManifestPath(Root)));
                if (update.patch_id == id && DateTimeOffset.Parse(update.built_at) >= DateTimeOffset.Parse(bundled.built_at))
                    Root = staged;
            }
            catch (IOException) {}
            catch (ArgumentException) {}
            catch (InvalidOperationException) {}
        }

        public Timer StartUpdateChecks()
        {
            return new Timer(delegate
            {
                try { StageLatestUpdate(); }
                catch (Exception error) { Trace.WriteLine("Desktop update: " + error.Message); }
            }, null, TimeSpan.FromSeconds(5), TimeSpan.FromMinutes(15));
        }

        static byte[] Download(string route, int limit)
        {
            HttpWebRequest request = (HttpWebRequest) WebRequest.Create(new Uri(new Uri(Server), route));
            request.AllowAutoRedirect = false;
            request.Timeout = 15000;
            request.ReadWriteTimeout = 15000;
            using (HttpWebResponse response = (HttpWebResponse) request.GetResponse())
            using (Stream source = response.GetResponseStream())
            using (MemoryStream output = new MemoryStream())
            {
                if (response.StatusCode != HttpStatusCode.OK || response.ContentLength > limit)
                    throw new InvalidDataException("Unexpected desktop update response.");
                byte[] buffer = new byte[8192];
                int count;
                while ((count = source.Read(buffer, 0, buffer.Length)) > 0)
                {
                    if (output.Length + count > limit) throw new InvalidDataException("Desktop update is too large.");
                    output.Write(buffer, 0, count);
                }
                return output.ToArray();
            }
        }

        void StageLatestUpdate()
        {
            string json = Encoding.UTF8.GetString(Download("api/index.php?route=update.manifest", 16384));
            Patch update = ReadPatch(json);
            Patch active = ReadPatch(File.ReadAllText(ManifestPath(Root)));
            if (update.patch_id == active.patch_id || DateTimeOffset.Parse(update.built_at) < DateTimeOffset.Parse(active.built_at)) return;

            Directory.CreateDirectory(patchesDir);
            string final = Path.Combine(patchesDir, update.patch_id);
            if (!Directory.Exists(final))
            {
                string expectedRoute = "assets/zeedat-patch-" + update.patch_id + ".zip";
                const string legacyRoute = "api/index.php?route=update.download";
                string route = update.download_route == expectedRoute ? expectedRoute : legacyRoute;
                byte[] bytes;
                try { bytes = Download(route, update.size_bytes); }
                catch (WebException error)
                {
                    using (HttpWebResponse response = error.Response as HttpWebResponse)
                    {
                        if (route == legacyRoute || response == null || response.StatusCode != HttpStatusCode.NotFound) throw;
                    }
                    bytes = Download(legacyRoute, update.size_bytes);
                }
                using (SHA256 sha = SHA256.Create())
                {
                    string hash = BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "");
                    if (bytes.Length != update.size_bytes || !hash.Equals(update.zip_sha256, StringComparison.OrdinalIgnoreCase))
                        throw new InvalidDataException("Desktop update checksum mismatch.");
                }
                string staging = Path.Combine(patchesDir, Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(staging);
                try
                {
                    using (ZipArchive archive = new ZipArchive(new MemoryStream(bytes)))
                        archive.ExtractToDirectory(staging);
                    if (!CompletePatch(staging)) throw new InvalidDataException("Desktop update is incomplete.");
                    Directory.CreateDirectory(Path.Combine(staging, "updates"));
                    File.WriteAllText(ManifestPath(staging), json);
                    Directory.Move(staging, final);
                }
                finally { if (Directory.Exists(staging)) Directory.Delete(staging, true); }
            }
            string pointer = Path.Combine(patchesDir, "active.txt");
            string temporary = pointer + ".tmp";
            File.WriteAllText(temporary, update.patch_id);
            if (File.Exists(pointer)) File.Replace(temporary, pointer, null);
            else File.Move(temporary, pointer);
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
