using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace NeonDash
{
    public static class Program
    {
        [STAThread]
        public static int Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
            return 0;
        }
    }

    public class MainForm : Form
    {
        private readonly WebView2 webView = new WebView2();
        private readonly DiscordRpc discordRpc = new DiscordRpc();

        public MainForm()
        {
            Text = "Neon Dash";
            Width = 1280;
            Height = 800;
            WindowState = FormWindowState.Maximized;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(6, 6, 16);

            webView.Dock = DockStyle.Fill;
            Controls.Add(webView);
            Load += OnLoad;
            FormClosed += delegate { discordRpc.Stop(); };
        }

        private async void OnLoad(object sender, EventArgs e)
        {
            try
            {
                discordRpc.StatusChanged += OnRpcStatus;
                discordRpc.Start();
            }
            catch { }

            try
            {
                Log("OnLoad: start");
                var udf = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "NeonDash",
                    "WebView2");
                Log("creating env, udf=" + udf);
                var env = await CoreWebView2Environment.CreateAsync(null, udf);
                Log("env created");
                await webView.EnsureCoreWebView2Async(env);
                Log("webview2 ready");
                webView.CoreWebView2.WebMessageReceived += OnWebMessage;
                var gamePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "index.html");
                webView.CoreWebView2.Navigate(new Uri(gamePath).AbsoluteUri);
                Log("navigated to " + gamePath);
            }
            catch (Exception ex)
            {
                Log("ERROR: " + ex);
                try
                {
                    File.WriteAllText(
                        Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "error.log"),
                        ex.ToString());
                }
                catch { }
                MessageBox.Show(
                    "Failed to start the game view:\n" + ex.Message,
                    "Neon Dash",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
        }

        private static void Log(string msg)
        {
            try
            {
                File.AppendAllText(
                    Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "neondash.log"),
                    DateTime.Now.ToString("HH:mm:ss.fff") + " " + msg + "\r\n");
            }
            catch { }
        }

        private void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            try
            {
                var js = new JavaScriptSerializer();
                var msg = js.Deserialize<Dictionary<string, object>>(e.WebMessageAsJson);
                if (msg == null) return;
                object kind;
                if (msg.TryGetValue("kind", out kind) && Equals(kind, "presence") &&
                    msg.ContainsKey("activity"))
                {
                    discordRpc.SetActivity(js.Serialize(msg["activity"]));
                }
            }
            catch { }
        }

        private void OnRpcStatus(string state)
        {
            if (IsDisposed) return;
            try
            {
                BeginInvoke((Action)delegate
                {
                    try
                    {
                        if (webView.CoreWebView2 != null)
                        {
                            webView.CoreWebView2.PostWebMessageAsJson(
                                "{\"kind\":\"rpcStatus\",\"state\":\"" + state + "\"}");
                        }
                    }
                    catch { }
                });
            }
            catch { }
        }
    }

    // Discord local RPC client: connects to \\.\pipe\discord-ipc-{0..9},
    // performs the HANDSHAKE, then pushes SET_ACTIVITY frames.
    public class DiscordRpc
    {
        private const string ClientId = "1573705934876839967";
        private const int PipeCount = 10;
        private const int MaxFrame = 1024 * 1024;

        public event Action<string> StatusChanged;

        private NamedPipeClientStream pipe;
        private Thread worker;
        private volatile bool running;
        private volatile bool connected;
        private string pendingActivity;
        private int nonce = 1;
        private readonly object writeLock = new object();

        private static readonly Regex EvtRx =
            new Regex("\"evt\"\\s*:\\s*\"([^\"]+)\"");

        public void Start()
        {
            running = true;
            worker = new Thread(Run) { IsBackground = true };
            worker.Start();
        }

        public void Stop()
        {
            running = false;
            try { if (pipe != null) pipe.Dispose(); } catch { }
        }

        public void SetActivity(string activityJson)
        {
            lock (writeLock)
            {
                pendingActivity = activityJson;
            }
            // Pipe writes can block — never do them on the UI thread.
            if (connected) ThreadPool.QueueUserWorkItem(_ => SendPresence());
        }

        private void EmitStatus(string s)
        {
            var h = StatusChanged;
            if (h != null) h(s);
        }

        private void Run()
        {
            int backoff = 500;
            EmitStatus("connecting");
            while (running)
            {
                try
                {
                    if (!TryConnect())
                    {
                        Thread.Sleep(backoff);
                        backoff = Math.Min(backoff * 2, 60000);
                        continue;
                    }
                    backoff = 500;
                    Session();
                }
                catch { }
                connected = false;
                EmitStatus("disconnected");
                try { if (pipe != null) pipe.Dispose(); } catch { }
                pipe = null;
                Thread.Sleep(1000);
            }
        }

        private bool TryConnect()
        {
            for (int i = 0; i < PipeCount; i++)
            {
                if (!running) return false;
                NamedPipeClientStream p = null;
                try
                {
                    p = new NamedPipeClientStream(
                        ".", "discord-ipc-" + i, PipeDirection.InOut);
                    p.Connect(250);
                    pipe = p;
                    return true;
                }
                catch
                {
                    try { if (p != null) p.Dispose(); } catch { }
                }
            }
            return false;
        }

        private void Session()
        {
            var s = pipe;
            SendFrame(0, "{\"v\":1,\"client_id\":\"" + ClientId + "\"}");
            while (running)
            {
                int opcode;
                string json;
                if (!ReadFrame(s, out opcode, out json)) return;
                if (opcode == 3) // PING -> PONG
                {
                    SendFrame(4, json ?? "");
                    continue;
                }
                if (opcode != 1) continue; // only FRAME payloads matter
                var evt = ExtractEvt(json);
                if (evt == "READY")
                {
                    connected = true;
                    EmitStatus("connected");
                    SendPresence();
                }
                else if (evt == "ERROR")
                {
                    EmitStatus("error");
                }
            }
        }

        private void SendPresence()
        {
            string activity;
            lock (writeLock)
            {
                activity = pendingActivity;
            }
            if (activity == null) return;
            var payload =
                "{\"cmd\":\"SET_ACTIVITY\",\"args\":{\"pid\":" +
                Process.GetCurrentProcess().Id +
                ",\"activity\":" + activity +
                "},\"nonce\":" + (nonce++) + "}";
            SendFrame(1, payload);
        }

        private void SendFrame(int opcode, string json)
        {
            var s = pipe;
            if (s == null) return;
            var body = Encoding.UTF8.GetBytes(json ?? "");
            var header = new byte[8];
            Buffer.BlockCopy(BitConverter.GetBytes(opcode), 0, header, 0, 4);
            Buffer.BlockCopy(BitConverter.GetBytes(body.Length), 0, header, 4, 4);
            lock (writeLock)
            {
                try
                {
                    s.Write(header, 0, 8);
                    if (body.Length > 0) s.Write(body, 0, body.Length);
                    s.Flush();
                }
                catch { }
            }
        }

        private static bool ReadExact(Stream s, byte[] buf, int off, int len)
        {
            var read = 0;
            while (read < len)
            {
                var n = s.Read(buf, off + read, len - read);
                if (n <= 0) return false;
                read += n;
            }
            return true;
        }

        private static bool ReadFrame(Stream s, out int opcode, out string json)
        {
            opcode = 0;
            json = null;
            var header = new byte[8];
            if (!ReadExact(s, header, 0, 8)) return false;
            opcode = BitConverter.ToInt32(header, 0);
            var len = BitConverter.ToInt32(header, 4);
            if (len < 0 || len > MaxFrame) return false;
            var body = new byte[len];
            if (len > 0 && !ReadExact(s, body, 0, len)) return false;
            json = len > 0 ? Encoding.UTF8.GetString(body) : "";
            return true;
        }

        private static string ExtractEvt(string json)
        {
            var m = EvtRx.Match(json ?? "");
            return m.Success ? m.Groups[1].Value : null;
        }
    }
}
