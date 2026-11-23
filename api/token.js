// Exchanges a Discord activity authorization code for an access token.
// Runs as a Vercel serverless function — the client secret never reaches the browser.
const DISCORD_CLIENT_ID = "1573705934876839967";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" });
  }
  const code = req.body && req.body.code;
  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "missing code" });
  }
  const secret = process.env.DISCORD_CLIENT_SECRET;
  if (!secret) {
    return res.status(500).json({ error: "server not configured" });
  }
  try {
    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: secret,
        grant_type: "authorization_code",
        code,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.access_token) {
      return res.status(502).json({ error: "discord token exchange failed" });
    }
    return res.status(200).json({ access_token: data.access_token });
  } catch (e) {
    return res.status(502).json({ error: "token exchange failed" });
  }
};
