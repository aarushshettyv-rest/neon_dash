"use strict";

// ============================================================
// GEOMETRY DASH — Complete Canvas Game
// ============================================================

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

// -------------------- Screen --------------------
let W, H, groundY;
const GROUND_RATIO = 0.78;
const CEIL_Y = 40;

function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  groundY = Math.floor(H * GROUND_RATIO);
}
resize();

// -------------------- Constants --------------------
const PS = 38; // player size
const GRAVITY = 0.95;
const JUMP_VEL = -13;
const SHIP_GRAV = 0.78;
const SHIP_FLY = -0.96;
const BASE_SPEED = 6.2;
const SPEEDS = { slow: 4.2, normal: 6.2, fast: 9, veryfast: 11.5 };
const PAD_JUMP = -17.5;
const ORB_JUMP = -14;
const POWER_PORTAL_FRAMES = 720; // 12s at 60 Hz
const SPIKE_W = 36;
const SPIKE_H = 30;
const COL_SHRINK = 8; // collision forgiveness pixels
const FRAME_MS = 1000 / 60;
const BPM = 140;

let simTime = 0;
let useSimTime = false;
function now() {
  return useSimTime
    ? simTime
    : (typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now());
}

// -------------------- State --------------------
let gameState = "menu"; // menu | playing | paused | dead | complete | editor
let menuScreen = "main"; // main | levels | settings | account
let editorTesting = false;
let menuSel = 0;
let levelMenuScroll = 0;
let practiceMode = false;
let muted = false;

let currentLevelIdx = 0;
let levelData = null;
let attemptNum = 0;
let deathNum = 0;
let levelTimer = 0;
let levelFinishTime = 0;
let cameraX = 0;

let particles = [];
let checkpoints = [];
let lastCpX = 0;
let recentPlayerStates = [];
let deathCheckpointCandidate = null;
let coyoteFrames = 0;

// Attempt flash
let attemptFlashAlpha = 0;
let attemptFlashText = "";

// Background
let bgPulse = 0;

// Screen shake
let shakeX = 0, shakeY = 0, shakeIntensity = 0;

// Player trail
let trail = [];

// -------------------- Persistence --------------------
let bestProg = {};
let totalAttempts = {};
let coinsGot = {};
let bestGhosts = {};
const GHOST_SAMPLE_FRAMES = 3;
const MAX_GHOST_POINTS = 6000;
const GHOST_STORAGE_KEY = "gd_ghosts";
let activeGhostKey = null;
let ghostFrame = 0;
let runGhostPoints = [];
let ghostRunGroundY = 0;
const AUDIO_VOLUME_STEPS = [0, 0.25, 0.5, 0.75, 1];
let ghostReplayVisible = true;
let musicVolume = 0.75;
let sfxVolume = 0.75;
let supabaseClient = null;
let authUser = null;
let cloudSaveTimer = null;
let accountMessage = "Supabase is not configured";
let authFormMode = "signin";
const PLAYER_SKINS = [
  { id: "cube", label: "Cube" },
  { id: "diamond", label: "Diamond" },
  { id: "circle", label: "Circle" },
];
const PLAYER_COLORS = [
  { label: "Cyan", value: "#00E5FF" },
  { label: "Pink", value: "#FF4FA3" },
  { label: "Gold", value: "#FFD43B" },
  { label: "Violet", value: "#A66BFF" },
  { label: "Green", value: "#39E98A" },
  { label: "Orange", value: "#FF813A" },
];
let playerName = "Player";
let playerSkin = "cube";
let playerColor = "#00E5FF";
let settingsMessage = "";
let settingsMessageT = 0;
function normalizeVolume(value, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return AUDIO_VOLUME_STEPS.reduce(
    (closest, step) =>
      Math.abs(step - value) < Math.abs(closest - value) ? step : closest,
    AUDIO_VOLUME_STEPS[0]
  );
}

function saveGameSettings() {
  applyAudioSettings();
  try {
    localStorage.setItem(
      "gd_settings",
      JSON.stringify({ ghostReplayVisible, musicVolume, sfxVolume })
    );
    return true;
  } catch (e) {
    return false;
  }
}

try {
  const settings = JSON.parse(localStorage.getItem("gd_settings") || "{}");
  if (typeof settings.ghostReplayVisible === "boolean") {
    ghostReplayVisible = settings.ghostReplayVisible;
  }
  musicVolume = normalizeVolume(settings.musicVolume, musicVolume);
  sfxVolume = normalizeVolume(settings.sfxVolume, sfxVolume);
} catch (e) {}

try {
  const s = JSON.parse(localStorage.getItem("gd_save2") || "{}");
  bestProg = s.bp || {};
  totalAttempts = s.ta || {};
  coinsGot = s.coins || {};
} catch (e) {}
try {
  const profile = JSON.parse(localStorage.getItem("gd_profile") || "{}");
  if (typeof profile.name === "string" && profile.name.trim()) {
    playerName = profile.name.trim().slice(0, 18);
  }
  if (PLAYER_SKINS.some((skin) => skin.id === profile.skin)) playerSkin = profile.skin;
  if (typeof profile.color === "string" && /^#[0-9a-f]{6}$/i.test(profile.color)) {
    playerColor = profile.color.toUpperCase();
  }
} catch (e) {}
try {
  const ghosts = JSON.parse(localStorage.getItem("gd_ghosts") || "{}");
  if (ghosts && typeof ghosts === "object" && !Array.isArray(ghosts)) {
    for (const [key, ghost] of Object.entries(ghosts)) {
      if (isValidGhost(ghost)) bestGhosts[key] = ghost;
    }
  }
} catch (e) {}

function savePlayerProfile() {
  try {
    localStorage.setItem(
      "gd_profile",
      JSON.stringify({ name: playerName, skin: playerSkin, color: playerColor })
    );
    queueCloudSave();
    return true;
  } catch (e) {
    return false;
  }
}

function showSettingsMessage(message, saved) {
  settingsMessage = saved ? message : "Changed, but couldn't save settings";
  settingsMessageT = 90;
}

function changePlayerName() {
  const name = window.prompt("Username (up to 18 characters):", playerName);
  if (name === null) return;
  const trimmedName = name.trim();
  if (!trimmedName) {
    showSettingsMessage("Username cannot be empty", true);
    return;
  }
  playerName = trimmedName.slice(0, 18);
  showSettingsMessage("Username updated", savePlayerProfile());
}

function changePlayerColor(value) {
  playerColor = value;
  showSettingsMessage("Color updated", savePlayerProfile());
}
function save() {
  try {
    localStorage.setItem(
      "gd_save2",
      JSON.stringify({ bp: bestProg, ta: totalAttempts, coins: coinsGot })
    );
    queueCloudSave();
  } catch (e) {}
}

function showAccountMessage(message) {
  accountMessage = message;
}

function makeCloudSnapshot() {
  return {
    version: 1,
    game: { bestProgress: bestProg, totalAttempts, coins: coinsGot },
    profile: { name: playerName, skin: playerSkin, color: playerColor },
    editor: { levels: editorLevels },
  };
}

function mergeCloudSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return;
  const game = snapshot.game && typeof snapshot.game === "object" ? snapshot.game : {};
  const mergeMaxValues = (localValues, cloudValues) => {
    const merged = {};
    if (cloudValues && typeof cloudValues === "object") Object.assign(merged, cloudValues);
    if (localValues && typeof localValues === "object") {
      for (const [key, value] of Object.entries(localValues)) {
        const cloudValue = Number(merged[key]);
        const localValue = Number(value);
        if (Number.isFinite(localValue)) {
          merged[key] = Number.isFinite(cloudValue) ? Math.max(cloudValue, localValue) : localValue;
        }
      }
    }
    return merged;
  };
  bestProg = mergeMaxValues(bestProg, game.bestProgress);
  totalAttempts = mergeMaxValues(totalAttempts, game.totalAttempts);

  const cloudCoins = game.coins && typeof game.coins === "object" ? game.coins : {};
  const mergedCoins = { ...cloudCoins };
  for (const [levelId, coins] of Object.entries(coinsGot)) {
    mergedCoins[levelId] = { ...(cloudCoins[levelId] || {}), ...(coins || {}) };
  }
  coinsGot = mergedCoins;

  const profile = snapshot.profile && typeof snapshot.profile === "object" ? snapshot.profile : {};
  if (typeof profile.name === "string" && profile.name.trim()) {
    playerName = profile.name.trim().slice(0, 18);
  }
  if (PLAYER_SKINS.some((skin) => skin.id === profile.skin)) playerSkin = profile.skin;
  if (typeof profile.color === "string" && /^#[0-9a-f]{6}$/i.test(profile.color)) {
    playerColor = profile.color.toUpperCase();
  }

  const cloudLevels = Array.isArray(snapshot.editor && snapshot.editor.levels)
    ? snapshot.editor.levels
    : [];
  const mergedLevels = [];
  const addLevelIfMissing = (level) => {
    if (!level || typeof level.name !== "string" || !Array.isArray(level.objs)) return;
    const alreadyPresent = mergedLevels.some(
      (saved) =>
        saved.name === level.name && JSON.stringify(saved.objs) === JSON.stringify(level.objs)
    );
    if (!alreadyPresent) mergedLevels.push(level);
  };
  for (const level of cloudLevels) {
    addLevelIfMissing(level);
  }
  for (const level of editorLevels) addLevelIfMissing(level);
  editorLevels = mergedLevels;

  save();
  savePlayerProfile();
  persistEditorStore();
}

async function uploadCloudSave() {
  if (!supabaseClient || !authUser) return;
  const userId = authUser.id;
  try {
    const { error } = await supabaseClient
      .from("player_saves")
      .upsert(
        { user_id: userId, save_data: makeCloudSnapshot(), updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    if (authUser && authUser.id === userId) {
      showAccountMessage(error ? `Cloud save failed: ${error.message}` : "Cloud save synced");
    }
  } catch (error) {
    if (authUser && authUser.id === userId) {
      showAccountMessage(`Cloud save failed: ${error.message}`);
    }
  }
}

function queueCloudSave() {
  if (!supabaseClient || !authUser) return;
  if (cloudSaveTimer !== null) clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => {
    cloudSaveTimer = null;
    uploadCloudSave();
  }, 800);
}

async function loadCloudSave(userId) {
  if (!supabaseClient || !authUser || authUser.id !== userId) return;
  let result;
  try {
    result = await supabaseClient
      .from("player_saves")
      .select("save_data")
      .eq("user_id", userId)
      .maybeSingle();
  } catch (error) {
    showAccountMessage(`Cloud save failed: ${error.message}`);
    return;
  }
  const { data, error } = result;
  if (!authUser || authUser.id !== userId) return;
  if (error) {
    showAccountMessage(`Cloud save failed: ${error.message}`);
    return;
  }
  if (data && data.save_data) {
    mergeCloudSnapshot(data.save_data);
    showAccountMessage("Cloud save synced");
  } else {
    showAccountMessage("Uploading this device's save");
  }
  queueCloudSave();
}

function handleAuthSession(session) {
  const nextUser = session && session.user ? session.user : null;
  if ((authUser && authUser.id) === (nextUser && nextUser.id)) {
    authUser = nextUser;
    return;
  }
  authUser = nextUser;
  if (authUser) {
    showAccountMessage("Loading cloud save");
    const userId = authUser.id;
    loadCloudSave(userId);
  } else {
    if (cloudSaveTimer !== null) clearTimeout(cloudSaveTimer);
    cloudSaveTimer = null;
    showAccountMessage("Signed out");
  }
}

function closeAuthDialog() {
  const modal = document.getElementById("auth-modal");
  if (modal) modal.hidden = true;
}

function openEmailAuth(mode) {
  if (!supabaseClient) {
    showAccountMessage("Configure Supabase in supabase-config.js first");
    return;
  }
  const modal = document.getElementById("auth-modal");
  const form = document.getElementById("auth-form");
  const title = document.getElementById("auth-title");
  const submit = document.getElementById("auth-submit");
  const password = document.getElementById("auth-password");
  const error = document.getElementById("auth-error");
  if (!modal || !form || !title || !submit || !password || !error) {
    showAccountMessage("Email sign-in form is unavailable");
    return;
  }
  authFormMode = mode;
  title.textContent = mode === "signup" ? "Create account" : "Sign in";
  submit.textContent = mode === "signup" ? "Sign up" : "Sign in";
  password.autocomplete = mode === "signup" ? "new-password" : "current-password";
  error.textContent = "";
  form.reset();
  modal.hidden = false;
  document.getElementById("auth-email").focus();
}

async function submitEmailAuth(event) {
  event.preventDefault();
  if (!supabaseClient) return;
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  const errorEl = document.getElementById("auth-error");
  const submit = document.getElementById("auth-submit");
  submit.disabled = true;
  errorEl.textContent = "";
  let result;
  try {
    result = authFormMode === "signup"
      ? await supabaseClient.auth.signUp({ email, password })
      : await supabaseClient.auth.signInWithPassword({ email, password });
  } catch (error) {
    submit.disabled = false;
    errorEl.textContent = error.message || "Authentication request failed";
    return;
  }
  submit.disabled = false;
  if (result.error) {
    errorEl.textContent = result.error.message;
    return;
  }
  closeAuthDialog();
  showAccountMessage(
    authFormMode === "signup" && !result.data.session
      ? "Check your email to confirm your account"
      : "Signed in"
  );
}

async function signInWithDiscord() {
  if (!supabaseClient) {
    showAccountMessage("Configure Supabase in supabase-config.js first");
    return;
  }
  try {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo: window.location.origin },
    });
    if (error) showAccountMessage(`Discord sign-in failed: ${error.message}`);
  } catch (error) {
    showAccountMessage(`Discord sign-in failed: ${error.message}`);
  }
}

async function signOutFromAccount() {
  if (!supabaseClient || !authUser) {
    showAccountMessage(authUser ? "Supabase is unavailable" : "You are not signed in");
    return;
  }
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) showAccountMessage(`Sign-out failed: ${error.message}`);
  } catch (error) {
    showAccountMessage(`Sign-out failed: ${error.message}`);
  }
}

function initializeSupabase() {
  const modal = document.getElementById("auth-modal");
  const form = document.getElementById("auth-form");
  const cancel = document.getElementById("auth-cancel");
  if (form) form.addEventListener("submit", submitEmailAuth);
  if (cancel) cancel.addEventListener("click", closeAuthDialog);
  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeAuthDialog();
    });
  }

  const config = window.GD_SUPABASE_CONFIG;
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    showAccountMessage("Supabase library did not load");
    return;
  }
  if (!config || !config.url || !config.anonKey) {
    showAccountMessage("Set your Supabase URL and public key in supabase-config.js");
    return;
  }
  try {
    supabaseClient = window.supabase.createClient(config.url, config.anonKey);
    supabaseClient.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => handleAuthSession(session), 0);
    });
  } catch (error) {
    showAccountMessage(`Supabase setup failed: ${error.message}`);
  }
}

// -------------------- Discord Activity --------------------
const DISCORD_CLIENT_ID = "1573705934876839967";
const DISCORD_SDK_URL = "./discord-sdk.mjs";
let discordSdk = null;
let discordReady = false;
let discordState = "off"; // off | loading | ready | error
let discordErrorMsg = "";
let discordAuthed = false;
let discordAuthError = "";
let discordPresenceError = "";
let discordPresenceOk = false;
let discordSessionStart = 0;
let lastDiscordPresenceKey = "";

function isDiscordActivityContext() {
  try {
    if (new URLSearchParams(window.location.search).has("frame_id")) return true;
    const h = window.location.hostname;
    return h.endsWith("discordsays.com") || h === "discord.com" || h.endsWith(".discord.com");
  } catch (e) {
    return false;
  }
}

async function initDiscordActivity() {
  if (!isDiscordActivityContext()) return;
  discordState = "loading";
  try {
    const mod = await import(DISCORD_SDK_URL);
    const DiscordSDK = mod.DiscordSDK || mod.default || mod;
    discordSdk = new DiscordSDK(DISCORD_CLIENT_ID);
    // ready() never resolves outside Discord — cap the wait.
    await Promise.race([
      discordSdk.ready(),
      new Promise((resolve, reject) =>
        setTimeout(() => reject(new Error("ready() timed out after 10s")), 10000)
      ),
    ]);
    discordReady = true;
    discordState = "ready";
    discordSessionStart = Date.now();
    console.log("[discord] SDK ready");
    try {
      const { code } = await discordSdk.commands.authorize({
        client_id: DISCORD_CLIENT_ID,
        response_type: "code",
        state: "",
        prompt: "none",
        scope: ["identify", "rpc.activities.write"],
      });
      const tokenRes = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const { access_token } = await tokenRes.json();
      await discordSdk.commands.authenticate({ access_token });
      discordAuthed = true;
      console.log("[discord] authenticated");
    } catch (e) {
      discordAuthError = e && e.message ? String(e.message) : String(e);
      console.warn("[discord] auth failed:", e);
    }
    lastDiscordPresenceKey = "";
    updateDiscordPresence(true);
  } catch (e) {
    discordSdk = null;
    discordReady = false;
    discordState = "error";
    discordErrorMsg = e && e.message ? String(e.message) : String(e);
    console.warn("[discord] init failed:", e);
  }
}

function discordPresencePayload() {
  if (gameState === "menu") {
    return { details: "In the menus", state: "Neon Dash" };
  }
  if (gameState === "editor") {
    return { details: "Building a level", state: edName || "Untitled" };
  }
  if (!levelData) return null;
  const lvl = levelData.name;
  const prog = Math.round(getProgress());
  if (gameState === "playing" || gameState === "paused") {
    const state = practiceMode
      ? `Practice • ${prog}%`
      : `Attempt ${attemptNum} • ${prog}%`;
    return { details: lvl, state };
  }
  if (gameState === "dead") {
    return { details: lvl, state: `Wiped • Attempt ${attemptNum}` };
  }
  if (gameState === "complete") {
    return { details: "Finished!", state: lvl };
  }
  return null;
}

function updateDiscordPresence(force) {
  if (!discordReady || !discordSdk || !discordSdk.commands) return;
  const p = discordPresencePayload();
  if (!p) return;
  const key = JSON.stringify(p);
  if (!force && key === lastDiscordPresenceKey) return;
  lastDiscordPresenceKey = key;
  discordSdk.commands
    .setActivity({
      activity: {
        type: 0,
        details: p.details,
        state: p.state,
        timestamps: { start: Math.floor(discordSessionStart / 1000) },
        party: { size: [1, 0] },
        instance: true,
      },
    })
    .then(() => {
      discordPresenceOk = true;
    })
    .catch((err) => {
      discordPresenceError = err && err.message ? String(err.message) : String(err);
      console.warn("[discord] setActivity failed:", err);
    });
}

setInterval(() => updateDiscordPresence(false), 4000);

async function discordInvite() {
  if (!discordReady || !discordSdk || !discordSdk.commands) {
    showAccountMessage("Discord invite is only available inside Discord");
    return;
  }
  try {
    await discordSdk.commands.openInviteDialog();
  } catch (e) {
    showAccountMessage("Invite failed: " + (e && e.message ? e.message : "unknown error"));
  }
}

function totalCoins(i) {
  return Object.keys(coinsGot[i] || {}).length;
}
function runCoins() {
  if (!levelData) return 0;
  let n = 0;
  for (const o of levelData.obs) if (o.type === "coin" && o._hit) n++;
  return n;
}

// -------------------- Player --------------------
const P = {
  x: 0,
  y: 0,
  vy: 0,
  rot: 0,
  tgtRot: 0,
  grounded: false,
  isShip: false,
  speed: BASE_SPEED,
  sizeScale: 1,
  gravityScale: 1,
  extraJumps: 0,
  sizeFrames: 0,
  gravityFrames: 0,
  slowTimeFrames: 0,
  momentumFrames: 0,
  momentumBaseSpeed: BASE_SPEED,
  dead: false,
  done: false,
};

function playerSize() {
  return PS * (P.sizeScale || 1);
}

function setPlayerSize(scale) {
  const oldSize = playerSize();
  P.sizeScale = scale;
  const nextSize = playerSize();
  const offset = (oldSize - nextSize) / 2;
  P.x += offset;
  P.y += offset;
}

function activatePowerPortal(portal, size) {
  if (
    portal._hit ||
    !rr(P.x, P.y, size, size, portal.x - 18, CEIL_Y, 36, groundY - CEIL_Y)
  ) return;
  if (portal.type === "sizeSmallP") {
    setPlayerSize(0.65);
    P.sizeFrames = POWER_PORTAL_FRAMES;
  } else if (portal.type === "sizeBigP") {
    setPlayerSize(1.3);
    P.sizeFrames = POWER_PORTAL_FRAMES;
  } else if (portal.type === "bounceP") {
    P.vy = P.isShip ? -6.6 : -17.5;
    P.grounded = false;
    coyoteFrames = 0;
    P.extraJumps = 0;
  } else if (portal.type === "lowGravP") {
    P.gravityScale = 0.55;
    P.gravityFrames = POWER_PORTAL_FRAMES;
  } else if (portal.type === "highGravP") {
    P.gravityScale = 1.65;
    P.gravityFrames = POWER_PORTAL_FRAMES;
  } else if (portal.type === "doubleJumpP") P.extraJumps = 1;
  else if (portal.type === "slowTimeP") P.slowTimeFrames = 180;
  else if (portal.type === "momentumP") {
    P.momentumFrames = 240;
    P.momentumBaseSpeed = P.speed;
  }
  else return;
  portal._hit = true;
}

function advancePortalEffects() {
  const timeScale = P.slowTimeFrames > 0 ? 0.55 : 1;
  if (P.slowTimeFrames > 0) P.slowTimeFrames--;
  if (P.sizeFrames > 0) {
    P.sizeFrames--;
    if (P.sizeFrames === 0) setPlayerSize(1);
  }
  if (P.gravityFrames > 0) {
    P.gravityFrames--;
    if (P.gravityFrames === 0) P.gravityScale = 1;
  }
  if (P.momentumFrames > 0) {
    const accelerate =
      momentumControl === "accelerate" ||
      heldKeys.ArrowRight ||
      heldKeys.KeyD;
    const brake =
      momentumControl === "brake" ||
      heldKeys.ArrowLeft ||
      heldKeys.KeyA;
    if (accelerate && !brake) P.speed = Math.min(SPEEDS.veryfast, P.speed + 0.06);
    else if (brake && !accelerate) P.speed = Math.max(SPEEDS.slow, P.speed - 0.08);
    else P.speed += (P.momentumBaseSpeed - P.speed) * 0.035;
    P.momentumFrames--;
    if (P.momentumFrames === 0) P.speed = P.momentumBaseSpeed;
  }
  return timeScale;
}

function resetPlayer(fromCp) {
  const cp =
    fromCp && practiceMode && checkpoints.length
      ? checkpoints[checkpoints.length - 1]
      : null;
  if (cp) {
    P.x = cp.x;
    P.y = cp.y;
    P.isShip = cp.isShip;
    P.speed = cp.speed;
    P.grounded = cp.grounded;
    P.sizeScale = cp.sizeScale || 1;
    P.gravityScale = cp.gravityScale || 1;
    P.extraJumps = cp.extraJumps || 0;
    P.sizeFrames = cp.sizeFrames || 0;
    P.gravityFrames = cp.gravityFrames || 0;
    P.slowTimeFrames = cp.slowTimeFrames || 0;
    P.momentumFrames = cp.momentumFrames || 0;
    P.momentumBaseSpeed = cp.momentumBaseSpeed || P.speed;
  } else {
    P.x = 250;
    P.y = groundY - PS;
    P.isShip = false;
    P.speed = BASE_SPEED;
    P.grounded = true;
    P.sizeScale = 1;
    P.gravityScale = 1;
    P.extraJumps = 0;
    P.sizeFrames = 0;
    P.gravityFrames = 0;
    P.slowTimeFrames = 0;
    P.momentumFrames = 0;
    P.momentumBaseSpeed = BASE_SPEED;
    checkpoints = [];
    lastCpX = 0;
  }
  P.vy = 0;
  P.rot = 0;
  P.tgtRot = 0;
  P.dead = false;
  P.done = false;
  trail = [];
  cameraX = P.x - 250;
  _inputWasDown = inputHeld;
  inputJustDown = false;
  if (levelData) {
    for (const o of levelData.obs) {
      if (!cp || o.x >= P.x - 30) o._hit = false;
    }
  }
  recentPlayerStates = [];
  deathCheckpointCandidate = null;
  coyoteFrames = 0;
}

function playerCheckpointSnapshot(x, y, isShip, speed, grounded) {
  return {
    x,
    y,
    isShip,
    speed,
    grounded,
    sizeScale: P.sizeScale,
    gravityScale: P.gravityScale,
    extraJumps: P.extraJumps,
    sizeFrames: P.sizeFrames,
    gravityFrames: P.gravityFrames,
    slowTimeFrames: P.slowTimeFrames,
    momentumFrames: P.momentumFrames,
    momentumBaseSpeed: P.momentumBaseSpeed,
  };
}

function addCustomCheckpoint(snapshot) {
  if (!practiceMode || editorTesting || !snapshot) return false;
  checkpoints = checkpoints.filter((checkpoint) => !checkpoint.custom);
  const checkpoint = { ...snapshot, custom: true };
  checkpoints.push(checkpoint);
  lastCpX = Math.max(lastCpX, checkpoint.x);
  const cpSize = PS * (checkpoint.sizeScale || 1);
  emitP(checkpoint.x + cpSize / 2, checkpoint.y + cpSize / 2, "#00ff88", 12, 4);
  return true;
}

// -------------------- Input --------------------
let inputHeld = false;
let inputJustDown = false;
let _inputWasDown = false;
let momentumControl = null;
let momentumControlTouch = null;
let touchMenuStart = null;
let editorTouchPan = null;

function iDown(e) {
  if (e) e.preventDefault();
  inputHeld = true;
}
function iUp(e) {
  if (e) e.preventDefault();
  inputHeld = false;
  momentumControl = null;
  momentumControlTouch = null;
}

const heldKeys = {};
window.addEventListener("keydown", (e) => {
  heldKeys[e.code] = true;
  if (
    gameState === "playing" &&
    P.momentumFrames > 0 &&
    (e.code === "ArrowLeft" || e.code === "ArrowRight")
  ) e.preventDefault();
  if (e.repeat) return;
  const authModal = document.getElementById("auth-modal");
  if (authModal && !authModal.hidden) {
    if (e.code === "Escape") closeAuthDialog();
    return;
  }
  const c = e.code;
  if (gameState === "editor") {
    if (c === "Escape") {
      goToMenu();
      return;
    }
    if (c === "Enter") {
      playEditor();
      return;
    }
    if (c === "KeyZ" && (e.ctrlKey || e.metaKey)) {
      edUndo();
      return;
    }
    if (c === "Backspace" || c === "Delete") {
      edStrokeStart();
      editorApply(editorMouse.x, editorMouse.y, true);
      return;
    }
    if (c.startsWith("Digit")) {
      const n = Number(c.slice(5));
      if (n >= 1 && n <= ED_TOOLS.length) edTool = ED_TOOLS[n - 1].id;
    }
    if (c === "BracketLeft" || c === "BracketRight") {
      const idx = ED_TOOLS.findIndex((tool) => tool.id === edTool);
      const dir = c === "BracketRight" ? 1 : -1;
      edTool = ED_TOOLS[(idx + dir + ED_TOOLS.length) % ED_TOOLS.length].id;
    }
    return;
  }
  if (c === "Space" || c === "ArrowUp" || c === "KeyW") iDown(e);
  if (c === "KeyF") {
    toggleFullscreen();
    return;
  }

  if (c === "Escape") {
    if (gameState === "menu" && menuScreen !== "main") {
      if (menuScreen === "account") {
        menuScreen = "settings";
        menuSel = 12;
      } else {
        menuScreen = "main";
        menuSel = 0;
      }
      return;
    }
    if (editorTesting && (gameState === "playing" || gameState === "paused" || gameState === "dead" || gameState === "complete")) {
      returnToEditor();
      return;
    }
    if (gameState === "playing" || gameState === "paused" || gameState === "dead") {
      goToMenu();
      return;
    }
  }
  if (
    c === "KeyC" &&
    practiceMode &&
    !editorTesting &&
    (gameState === "paused" || gameState === "dead")
  ) {
    const snapshot =
      gameState === "paused"
        ? playerCheckpointSnapshot(P.x, P.y, P.isShip, P.speed, P.grounded)
        : deathCheckpointCandidate;
    if (addCustomCheckpoint(snapshot) && gameState === "dead") restart();
    return;
  }
  if (c === "KeyR" && (gameState === "playing" || gameState === "paused" || gameState === "dead")) {
    restart();
    return;
  }
  if (c === "KeyP") {
    if (gameState === "playing") gameState = "paused";
    else if (gameState === "paused") gameState = "playing";
  }
  if (c === "KeyM") muted = !muted;

  if (gameState === "menu") {
    const max = menuScreen === "main"
      ? 5
      : menuScreen === "levels"
        ? levels.length + editorLevels.length
        : menuScreen === "settings"
          ? 13
          : menuScreen === "account" && discordState === "ready"
            ? 6
            : 5;
    if (c === "ArrowDown") menuSel = Math.min(menuSel + 1, max);
    if (c === "ArrowUp") menuSel = Math.max(menuSel - 1, 0);
    if (menuScreen === "levels" && (c === "ArrowDown" || c === "ArrowUp")) {
      ensureLevelMenuSelectionVisible();
    }
    if (c === "Enter" || c === "Space") {
      e.preventDefault();
      menuAction();
    }
  }
  if (gameState === "dead" && (c === "Space" || c === "Enter")) restart();
  if (gameState === "complete" && (c === "Space" || c === "Enter")) {
    if (editorTesting) returnToEditor();
    else goToMenu();
  }
});

window.addEventListener("keyup", (e) => {
  heldKeys[e.code] = false;
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") iUp(e);
});

function tapHandler(x, y, touchId) {
  if (gameState === "menu") {
    menuClickAt(x, y);
    return;
  }
  if (gameState === "dead") {
    const button = deathCheckpointButton();
    if (
      practiceMode &&
      !editorTesting &&
      x >= button.x &&
      x <= button.x + button.w &&
      y >= button.y &&
      y <= button.y + button.h
    ) {
      addCustomCheckpoint(deathCheckpointCandidate);
    }
    restart();
    return;
  }
  if (gameState === "complete") {
    if (editorTesting) returnToEditor();
    else goToMenu();
    return;
  }
  if (gameState === "paused") {
    const button = pauseCheckpointButton();
    if (
      practiceMode &&
      !editorTesting &&
      x >= button.x &&
      x <= button.x + button.w &&
      y >= button.y &&
      y <= button.y + button.h
    ) {
      addCustomCheckpoint(
        playerCheckpointSnapshot(P.x, P.y, P.isShip, P.speed, P.grounded)
      );
      return;
    }
    // Check if tapped on "Back to Menu" button area
    if (y > H / 2 + 30 && y < H / 2 + 70) {
      if (editorTesting) returnToEditor();
      else goToMenu();
      return;
    }
    gameState = "playing";
    return;
  }
  if (gameState === "playing" && P.momentumFrames > 0) {
    const buttons = momentumControlButtons();
    if (
      x >= buttons.brake.x &&
      x <= buttons.brake.x + buttons.brake.w &&
      y >= buttons.brake.y &&
      y <= buttons.brake.y + buttons.brake.h
    ) {
      momentumControl = "brake";
      momentumControlTouch = touchId;
      return;
    }
    if (
      x >= buttons.accelerate.x &&
      x <= buttons.accelerate.x + buttons.accelerate.w &&
      y >= buttons.accelerate.y &&
      y <= buttons.accelerate.y + buttons.accelerate.h
    ) {
      momentumControl = "accelerate";
      momentumControlTouch = touchId;
      return;
    }
  }
  if (x > W - 100 && x < W - 55 && y < 50) {
    gameState = "paused";
    return;
  }
  // Check mute button (top-right)
  if (x > W - 55 && y < 50) {
    muted = !muted;
    return;
  }
  // Check back button (top-left area, small)
  if (x < 50 && y < 50 && gameState === "playing") {
    if (editorTesting) returnToEditor();
    else goToMenu();
    return;
  }
  iDown();
}

canvas.addEventListener("mousedown", (e) => {
  if (gameState === "editor") {
    editorDown(e);
    return;
  }
  tapHandler(e.clientX, e.clientY);
});
canvas.addEventListener("mousemove", (e) => {
  editorMouse.x = e.clientX;
  editorMouse.y = e.clientY;
  if (gameState === "editor" && edPainting) editorApply(e.clientX, e.clientY, edPaintErase);
});
canvas.addEventListener(
  "touchmove",
  (e) => {
    const t = e.touches[0];
    if (gameState === "menu" && menuScreen === "levels" && touchMenuStart) {
      e.preventDefault();
      const dy = touchMenuStart.startY - t.clientY;
      if (Math.abs(dy) > 10) touchMenuStart.moved = true;
      if (touchMenuStart.moved) {
        const layout = levelMenuLayout();
        levelMenuScroll = Math.max(
          0,
          Math.min(
            layout.maxScroll,
            touchMenuStart.scroll + Math.round(dy / layout.step)
          )
        );
        touchMenuStart.x = t.clientX;
        touchMenuStart.y = t.clientY;
      }
      return;
    }
    if (gameState === "editor" && e.touches.length >= 2) {
      e.preventDefault();
      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      if (editorTouchPan) cameraX = Math.max(0, cameraX - (centerX - editorTouchPan.x));
      editorTouchPan = { x: centerX };
      return;
    }
    if (gameState !== "editor" || !edPainting) return;
    e.preventDefault();
    editorMouse.x = t.clientX;
    editorMouse.y = t.clientY;
    editorApply(t.clientX, t.clientY, edPaintErase);
  },
  { passive: false }
);
canvas.addEventListener("mouseup", (e) => {
  edPainting = false;
  iUp(e);
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("wheel", (e) => {
  if (gameState === "menu" && menuScreen === "levels") {
    e.preventDefault();
    const layout = levelMenuLayout();
    levelMenuScroll = Math.max(
      0,
      Math.min(layout.maxScroll, levelMenuScroll + Math.sign(e.deltaY))
    );
    return;
  }
  if (gameState !== "editor") return;
  e.preventDefault();
  cameraX = Math.max(0, cameraX + (e.deltaX || e.deltaY));
}, { passive: false });
canvas.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    const t = e.touches[0];
    editorMouse.x = t.clientX;
    editorMouse.y = t.clientY;
    if (gameState === "editor") {
      if (e.touches.length >= 2) {
        edPainting = false;
        editorTouchPan = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        };
        return;
      }
      editorDown({ clientX: t.clientX, clientY: t.clientY, button: 0 });
      return;
    }
    if (gameState === "menu" && menuScreen === "levels") {
      touchMenuStart = {
        x: t.clientX,
        y: t.clientY,
        startY: t.clientY,
        scroll: levelMenuScroll,
        moved: false,
      };
      return;
    }
    tapHandler(t.clientX, t.clientY, t.identifier);
  },
  { passive: false }
);
canvas.addEventListener(
  "touchend",
  (e) => {
    e.preventDefault();
    edPainting = false;
    if (e.touches.length < 2) editorTouchPan = null;
    const lifted = e.changedTouches && e.changedTouches[0];
    const prevControl = momentumControl;
    const prevTouchId = momentumControlTouch;
    iUp();
    if (prevTouchId != null && lifted && lifted.identifier !== prevTouchId) {
      momentumControl = prevControl;
      momentumControlTouch = prevTouchId;
    }
    if (touchMenuStart) {
      if (gameState === "menu" && menuScreen === "levels" && !touchMenuStart.moved) {
        menuClickAt(touchMenuStart.x, touchMenuStart.y);
      }
      touchMenuStart = null;
    }
  },
  { passive: false }
);

// -------------------- Fullscreen --------------------
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    if (canvas.requestFullscreen) canvas.requestFullscreen().catch(() => {});
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
  }
}
document.addEventListener("fullscreenchange", () => onViewport());

function goToMenu() {
  gameState = "menu";
  menuScreen = "main";
  menuSel = 0;
  editorTesting = false;
  edPainting = false;
  stopMusic();
  particles = [];
}

// -------------------- Audio --------------------
let ac = null,
  masterGain = null,
  musicGain = null,
  sfxGain = null;

function applyAudioSettings() {
  if (!ac) return;
  const time = ac.currentTime;
  if (musicGain) musicGain.gain.setTargetAtTime(musicVolume, time, 0.02);
  if (sfxGain) sfxGain.gain.setTargetAtTime(sfxVolume, time, 0.02);
}

function initAudio() {
  if (ac) return;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ac.createGain();
    masterGain.gain.value = 0.25;
    masterGain.connect(ac.destination);
    musicGain = ac.createGain();
    sfxGain = ac.createGain();
    musicGain.connect(masterGain);
    sfxGain.connect(masterGain);
    applyAudioSettings();
  } catch (e) {}
}

function tone(freq, dur, type, vol, delay) {
  if (!ac || muted) return;
  try {
    const t = ac.currentTime + (delay || 0);
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type || "square";
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(sfxGain);
    o.start(t);
    o.stop(t + dur);
  } catch (e) {}
}

function noise(dur, vol, hpFreq) {
  if (!ac || muted) return;
  try {
    const sz = ac.sampleRate * dur;
    const buf = ac.createBuffer(1, sz, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < sz; i++) d[i] = Math.random() * 2 - 1;
    const n = ac.createBufferSource();
    n.buffer = buf;
    const g = ac.createGain();
    g.gain.value = vol || 0.03;
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    const f = ac.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = hpFreq || 6000;
    n.connect(f);
    f.connect(g);
    g.connect(sfxGain);
    n.start();
    n.stop(ac.currentTime + dur + 0.01);
  } catch (e) {}
}

function sfxJump() {
  tone(500, 0.08, "square", 0.07);
  tone(620, 0.06, "square", 0.04, 0.02);
}
function sfxDie() {
  tone(180, 0.3, "sawtooth", 0.12);
  tone(120, 0.4, "sawtooth", 0.08, 0.1);
}
function sfxOrb() {
  tone(880, 0.12, "sine", 0.09);
  tone(1100, 0.08, "sine", 0.06, 0.04);
}
function sfxPad() {
  tone(660, 0.1, "square", 0.09);
  tone(880, 0.08, "sine", 0.06, 0.03);
}
function sfxLand() {
  tone(120, 0.04, "square", 0.03);
}
function sfxWin() {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, "sine", 0.1, i * 0.12));
}
function sfxCoin() {
  tone(988, 0.07, "square", 0.06);
  tone(1480, 0.1, "square", 0.045, 0.05);
}

// Music — 140 BPM, scheduled on the audio clock so the beat doesn't drift.
let musicTimer = null;
let nextNoteTime = 0;
let mStep = 0;
let songStart = 0;
const STEP_SEC = 60 / BPM / 4;
const TRACKS = [
  {
    bass: [130.81, 130.81, 155.56, 146.83, 116.54, 130.81, 155.56, 174.61],
    lead: [523.25, 659.25, 783.99, 659.25, 523.25, 466.16, 587.33, 698.46],
  },
  {
    bass: [110, 110, 130.81, 123.47, 98, 110, 130.81, 146.83],
    lead: [440, 523.25, 659.25, 523.25, 392, 466.16, 523.25, 587.33],
  },
  {
    bass: [146.83, 138.59, 164.81, 155.56, 130.81, 146.83, 174.61, 164.81],
    lead: [587.33, 698.46, 880, 698.46, 554.37, 622.25, 739.99, 830.61],
  },
];

function envTone(freq, dur, type, vol, when, slideTo) {
  if (!ac || muted || !freq) return;
  try {
    const t = when || ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(Math.max(1, freq), t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + Math.max(0.03, dur));
    o.connect(g);
    g.connect(musicGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch (e) {}
}

function noiseAt(dur, vol, hpFreq, when) {
  if (!ac || muted) return;
  try {
    const t = when || ac.currentTime;
    const sz = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, sz, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < sz; i++) d[i] = Math.random() * 2 - 1;
    const n = ac.createBufferSource();
    n.buffer = buf;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol || 0.03, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const f = ac.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = hpFreq || 6000;
    n.connect(f);
    f.connect(g);
    g.connect(musicGain);
    n.start(t);
    n.stop(t + dur + 0.02);
  } catch (e) {}
}

function queueStep(step, time) {
  const tr = TRACKS[currentLevelIdx] || TRACKS[0];
  const s = step % 16;
  const bar = Math.floor(step / 16) % tr.bass.length;
  if (s === 0 || s === 8) envTone(168, 0.13, "sine", 0.28, time, 46);
  if (s === 4 || s === 12) {
    noiseAt(0.09, 0.055, 1400, time);
    envTone(196, 0.06, "triangle", 0.04, time);
  }
  if (s % 2 === 0) noiseAt(0.02, 0.016, 7500, time);
  if (s % 4 === 0) envTone(tr.bass[bar], 0.15, "sawtooth", 0.04, time);
  if (s === 0 || s === 3 || s === 7 || s === 10 || s === 12) {
    envTone(tr.lead[(bar + s) % tr.lead.length], 0.09, "square", 0.026, time);
  }
}

function startMusic() {
  stopMusic();
  if (!ac) return;
  mStep = 0;
  songStart = ac.currentTime + 0.05;
  nextNoteTime = songStart;
  musicTimer = setInterval(scheduleMusic, 25);
  scheduleMusic();
}
function scheduleMusic() {
  if (!ac) return;
  if (gameState !== "playing" && gameState !== "paused") {
    nextNoteTime = ac.currentTime + 0.05;
    return;
  }
  const horizon = ac.currentTime + 0.22;
  let guard = 0;
  while (nextNoteTime < horizon && guard < 32) {
    if (!muted) queueStep(mStep, nextNoteTime);
    mStep++;
    nextNoteTime += STEP_SEC;
    guard++;
  }
}
function stopMusic() {
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}
function songTime() {
  if (ac && songStart) return Math.max(0, ac.currentTime - songStart);
  return now() / 1000;
}
function beatEnergy() {
  if (!ac || !songStart || gameState === "menu") return 0;
  const beatLen = 60 / BPM;
  let f = ((ac.currentTime - songStart) / beatLen) % 1;
  if (f < 0) f += 1;
  return Math.pow(Math.max(0, 1 - f * 2.5), 2);
}

// -------------------- Particles --------------------
function emitP(x, y, col, n, spd) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * (spd || 8),
      vy: (Math.random() - 0.5) * (spd || 8) - 2,
      life: 1,
      decay: 0.012 + Math.random() * 0.025,
      sz: 2 + Math.random() * 4,
      col: col || "#fff",
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.08;
    p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.col;
    ctx.fillRect(p.x - cameraX, p.y, p.sz, p.sz);
  }
  ctx.globalAlpha = 1;
}

// ================================================================
// LEVEL DEFINITIONS
// ================================================================
// Physics-validated spacing:
//   Normal speed (6.2): ~142px clearable above spike height in one jump
//     → singles, doubles at 70px spacing OK
//   Fast speed (9): ~207px clearable
//     → triples at 60px spacing OK
//   Gap max: ~150px at normal, ~220px at fast
//   Platform spikes: 60px+ clear landing zone before spike
// ================================================================

function beatDist(speed) {
  return speed * (3600 / BPM);
}

function makeCursor() {
  const o = [];
  let x = 250;
  let spd = BASE_SPEED;
  const beat = () => beatDist(spd);
  return {
    obs: () => o,
    x: () => x,
    len: () => x + 420,
    skip(n) {
      x += beat() * n;
    },
    put(obj) {
      o.push(obj);
    },
    spike(dx, surf) {
      const s = { type: "spike", x: x + (dx || 0) };
      if (surf) s.surfY = surf;
      o.push(s);
    },
    spikeD(dx) {
      o.push({ type: "spikeD", x: x + (dx || 0), surfY: CEIL_Y });
    },
    pair() {
      this.spike(0);
      this.spike(58);
    },
    triple() {
      this.spike(0);
      this.spike(50);
      this.spike(100);
    },
    block(h, w) {
      h = h || 46;
      w = w || 58;
      o.push({ type: "block", x, y: groundY - h, w, h });
    },
    gap(w) {
      o.push({ type: "gap", x, w: w || 108 });
    },
    pad() {
      o.push({ type: "pad", x });
    },
    saw(yOff, r) {
      r = r || 18;
      o.push({ type: "saw", x: x + r, y: groundY - yOff, r });
    },
    coin(id, yOff, dx) {
      o.push({ type: "coin", id, x: x + (dx || 16), y: groundY - yOff });
    },
    setSpeed(name) {
      o.push({ type: "speedP", x, spd: name });
      spd = SPEEDS[name] || BASE_SPEED;
      x += beat() * 1.15;
    },
    ship() {
      o.push({ type: "shipP", x });
      x += beat() * 0.8;
    },
    cube() {
      o.push({ type: "cubeP", x });
      x += beat();
    },
    finish() {
      o.push({ type: "finish", x });
    },
    gate(midFrac, gapFrac, w) {
      const span = Math.max(180, groundY - CEIL_Y);
      const mid = CEIL_Y + span * midFrac;
      const half = (span * gapFrac) / 2;
      const top = mid - half;
      const bot = mid + half;
      if (top - CEIL_Y > 8) o.push({ type: "block", x, y: CEIL_Y, w, h: top - CEIL_Y });
      if (groundY - bot > 8) o.push({ type: "block", x, y: bot, w, h: groundY - bot });
    },
    dress() {
      const step = beatDist(BASE_SPEED);
      for (let dx = 160; dx < x; dx += step) {
        const n = Math.floor(dx / step);
        const h = 26 + (n % 5) * 16;
        o.push({ type: "deco", x: dx, y: groundY - h - 110, w: 14, h });
        if (n % 2 === 0) {
          o.push({
            type: "deco",
            x: dx + 36,
            y: CEIL_Y + 10,
            w: 12,
            h: 18 + (n % 3) * 12,
          });
        }
      }
    },
  };
}

function makeLevels() {
  return [buildLevel1(), buildLevel2(), buildLevel3()];
}

function buildLevel1() {
  const L = makeCursor();
  L.skip(4);
  for (let i = 0; i < 4; i++) {
    if (i === 1) L.coin(0, 86);
    L.spike();
    L.skip(2);
  }
  for (let i = 0; i < 3; i++) {
    L.pair();
    L.skip(2);
  }
  L.block(46, 62);
  L.skip(2);
  L.spike();
  L.skip(2);
  L.gap(108);
  L.skip(2);
  L.saw(24, 18);
  L.skip(2);
  L.saw(24, 18);
  L.skip(2);
  L.pad();
  {
    const px = L.x();
    L.put({ type: "plat", x: px + 90, y: groundY - 100, w: 370, h: 16 });
    L.put({ type: "spike", x: px + 300, surfY: groundY - 100 });
    L.put({ type: "coin", id: 1, x: px + 120, y: groundY - 150 });
  }
  L.skip(5);
  L.pair();
  L.skip(2);
  L.spike();
  L.skip(2);
  L.setSpeed("fast");
  for (let i = 0; i < 6; i++) {
    L.spike();
    L.skip(2);
  }
  L.gap(150);
  L.skip(2);
  L.pair();
  L.skip(2);
  L.setSpeed("normal");
  L.gap(176);
  L.put({ type: "orb", x: L.x() + 42, y: groundY - 108 });
  L.put({ type: "coin", id: 2, x: L.x() + 70, y: groundY - 156 });
  L.skip(2);
  for (let i = 0; i < 3; i++) {
    L.pair();
    L.skip(2);
  }
  L.block(48, 60);
  L.skip(2);
  L.saw(24, 18);
  L.skip(2);
  L.spike();
  L.skip(2);
  L.pad();
  L.skip(1.2);
  L.finish();
  L.dress();
  return { name: "Neon Pulse", hue: 200, obs: L.obs(), len: L.len(), coins: 3 };
}

function buildLevel2() {
  const L = makeCursor();
  L.skip(3);
  for (let i = 0; i < 3; i++) {
    L.pair();
    L.skip(2);
  }
  L.block(50, 60);
  L.skip(2);
  L.gap(116);
  L.skip(2);
  L.saw(24, 18);
  L.coin(0, 90, -8);
  L.skip(2);
  L.pair();
  L.skip(2);
  L.ship();
  {
    const step = 0.62;
    const bw = Math.ceil(beatDist(BASE_SPEED) * step) + 4;
    for (let i = 0; i < 34; i++) {
      const mid = 0.46 + Math.sin(i * 0.42) * 0.07;
      L.gate(mid, 0.5, bw);
      if (i === 16) {
        const span = Math.max(180, groundY - CEIL_Y);
        L.put({ type: "coin", id: 1, x: L.x() + bw * 0.5, y: CEIL_Y + span * mid });
      }
      L.skip(step);
    }
  }
  L.cube();
  L.skip(1);
  L.pair();
  L.skip(2);
  L.spike();
  L.skip(2);
  L.gap(120);
  L.skip(2);
  L.setSpeed("fast");
  for (let i = 0; i < 5; i++) {
    if (i % 2 === 0) L.pair();
    else L.spike();
    L.skip(2);
  }
  L.gap(160);
  L.skip(2);
  L.setSpeed("normal");
  L.pad();
  {
    const px = L.x();
    L.put({ type: "plat", x: px + 90, y: groundY - 108, w: 370, h: 16 });
    L.put({ type: "spike", x: px + 290, surfY: groundY - 108 });
  }
  L.skip(5);
  L.gap(170);
  L.put({ type: "orb", x: L.x() + 40, y: groundY - 112 });
  L.put({ type: "coin", id: 2, x: L.x() + 78, y: groundY - 160 });
  L.skip(2);
  L.pair();
  L.skip(2);
  L.saw(24, 18);
  L.skip(2);
  L.finish();
  L.dress();
  return { name: "Rebound", hue: 270, obs: L.obs(), len: L.len(), coins: 3 };
}

function buildLevel3() {
  const L = makeCursor();
  L.skip(2.5);
  L.setSpeed("fast");
  for (let i = 0; i < 3; i++) {
    L.pair();
    L.skip(2);
  }
  L.triple();
  L.skip(2);
  L.block(48, 56);
  L.skip(2);
  L.spike();
  L.coin(0, 92, 10);
  L.skip(2);
  L.gap(150);
  L.skip(2);
  L.setSpeed("normal");
  L.gap(240);
  L.put({ type: "orb", x: L.x() + 36, y: groundY - 104 });
  L.put({ type: "orb", x: L.x() + 130, y: groundY - 112 });
  L.skip(3);
  L.pair();
  L.skip(2);
  L.saw(24, 18);
  L.skip(2);
  L.saw(104, 15);
  L.skip(2);
  L.saw(24, 18);
  L.coin(1, 88, 8);
  L.skip(2);
  L.pair();
  L.skip(2);
  L.ship();
  {
    const step = 0.58;
    const bw = Math.ceil(beatDist(BASE_SPEED) * step) + 4;
    for (let i = 0; i < 28; i++) {
      const mid = 0.48 + Math.sin(i * 0.5) * 0.055;
      L.gate(mid, 0.44, bw);
      if (i === 14) {
        const span = Math.max(180, groundY - CEIL_Y);
        L.put({ type: "coin", id: 2, x: L.x() + bw * 0.5, y: CEIL_Y + span * mid });
      }
      L.skip(step);
    }
  }
  L.cube();
  L.skip(1);
  L.setSpeed("veryfast");
  for (let i = 0; i < 6; i++) {
    if (i === 2 || i === 5) L.pair();
    else L.spike();
    L.skip(2);
  }
  L.gap(170);
  L.skip(2);
  L.saw(24, 16);
  L.skip(2);
  L.spike();
  L.skip(2);
  L.finish();
  L.dress();
  return { name: "Spectral Drift", hue: 350, obs: L.obs(), len: L.len(), coins: 3 };
}

function onViewport() {
  const oldG = groundY;
  resize();
  const dy = groundY - oldG;
  levels = makeLevels();
  const previousLevel = levelData;
  if (gameState === "editor" || editorTesting) {
    const nextLevel = compileEditor(edObjs, edName);
    preserveHitObstacles(previousLevel, nextLevel);
    levelData = nextLevel;
  } else if (levelData && typeof currentLevelIdx === "number" && levels[currentLevelIdx]) {
    const nextLevel = levels[currentLevelIdx];
    preserveHitObstacles(previousLevel, nextLevel);
    levelData = nextLevel;
  }
  if (dy && gameState !== "menu" && gameState !== "editor") {
    P.y += dy;
    for (const cp of checkpoints) cp.y += dy;
    for (const state of recentPlayerStates) state.y += dy;
    if (deathCheckpointCandidate) deathCheckpointCandidate.y += dy;
    ghostRunGroundY += dy;
    for (const point of runGhostPoints) point[2] += dy;
  }
}

function preserveHitObstacles(previousLevel, nextLevel) {
  if (!previousLevel || !nextLevel) return;
  const hitCounts = new Map();
  for (const obstacle of previousLevel.obs) {
    if (!obstacle._hit) continue;
    const key = `${obstacle.type}|${obstacle.x}|${obstacle.id ?? ""}`;
    hitCounts.set(key, (hitCounts.get(key) || 0) + 1);
  }
  for (const obstacle of nextLevel.obs) {
    const key = `${obstacle.type}|${obstacle.x}|${obstacle.id ?? ""}`;
    const count = hitCounts.get(key) || 0;
    if (!count) continue;
    obstacle._hit = true;
    hitCounts.set(key, count - 1);
  }
}

let levels = [];
window.addEventListener("resize", onViewport);
onViewport();

// -------------------- Collision --------------------
function rr(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function ptInTri(px, py, x1, y1, x2, y2, x3, y3) {
  const d1 = (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
  const d2 = (px - x3) * (y2 - y3) - (x2 - x3) * (py - y3);
  const d3 = (px - x1) * (y3 - y1) - (x3 - x1) * (py - y1);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function spikeHit(sx, sy) {
  const size = playerSize();
  const tx1 = sx,
    ty1 = sy,
    tx2 = sx + SPIKE_W,
    ty2 = sy,
    tx3 = sx + SPIKE_W / 2,
    ty3 = sy - SPIKE_H;
  const s = COL_SHRINK;
  const corners = [
    [P.x + s, P.y + s],
    [P.x + size - s, P.y + s],
    [P.x + s, P.y + size - s],
    [P.x + size - s, P.y + size - s],
    [P.x + size / 2, P.y + size / 2],
  ];
  for (const [cx, cy] of corners) {
    if (ptInTri(cx, cy, tx1, ty1, tx2, ty2, tx3, ty3)) return true;
  }
  return false;
}

function spikeHitDown(sx, sy) {
  const size = playerSize();
  const tx1 = sx,
    ty1 = sy,
    tx2 = sx + SPIKE_W,
    ty2 = sy,
    tx3 = sx + SPIKE_W / 2,
    ty3 = sy + SPIKE_H;
  const s = COL_SHRINK;
  const corners = [
    [P.x + s, P.y + s],
    [P.x + size - s, P.y + s],
    [P.x + s, P.y + size - s],
    [P.x + size - s, P.y + size - s],
    [P.x + size / 2, P.y + size / 2],
  ];
  for (const [cx, cy] of corners) {
    if (ptInTri(cx, cy, tx1, ty1, tx2, ty2, tx3, ty3)) return true;
  }
  return false;
}

function isGround(wx) {
  if (!levelData) return true;
  for (const o of levelData.obs) {
    if (o.type === "gap" && wx > o.x && wx < o.x + o.w) return false;
  }
  return true;
}

function checkpointSafe() {
  if (!levelData) return false;
  const size = playerSize();
  const clearance = Math.max(size * 2, P.speed * 12);
  for (const o of levelData.obs) {
    let left;
    let right;
    if (o.type === "gap") {
      left = o.x;
      right = o.x + o.w;
    } else if (o.type === "spike" || o.type === "spikeD") {
      left = o.x;
      right = o.x + SPIKE_W;
    } else if (o.type === "saw") {
      const radius = o.r || 18;
      left = o.x - radius;
      right = o.x + radius;
    } else if (o.type === "block" || o.type === "plat") {
      if (P.y + size <= o.y || P.y >= o.y + o.h) continue;
      left = o.x;
      right = o.x + o.w;
    } else {
      continue;
    }
    if (P.x + size + clearance > left && P.x - clearance < right) return false;
  }
  if (!P.isShip) return P.grounded;
  let ceil = CEIL_Y;
  let floor = groundY;
  let walls = 0;
  for (const o of levelData.obs) {
    if (o.type !== "block" && o.type !== "plat") continue;
    if (o.x > P.x + size || o.x + o.w < P.x) continue;
    walls++;
    if (o.y <= CEIL_Y + 2) ceil = Math.max(ceil, o.y + o.h);
    else floor = Math.min(floor, o.y);
  }
  if (floor - ceil < size + 48) return false;
  if (!walls) return P.y > CEIL_Y + 8 && P.y + size < groundY - 8;
  const mid = (ceil + floor) / 2 - size / 2;
  return Math.abs(P.y - mid) < 26;
}

// -------------------- Progress --------------------
function getProgress() {
  if (!levelData) return 0;
  return Math.min(
    100,
    Math.max(0, Math.floor(((P.x - 250) / (levelData.len - 550)) * 100))
  );
}

// -------------------- Ghost replay --------------------
function isValidGhost(ghost) {
  if (
    !ghost ||
    typeof ghost !== "object" ||
    (ghost.mode !== "practice" && ghost.mode !== "editor") ||
    !Number.isInteger(ghost.progress) ||
    ghost.progress < 0 ||
    ghost.progress > 100 ||
    typeof ghost.completed !== "boolean" ||
    !Number.isInteger(ghost.frames) ||
    ghost.frames < 0 ||
    !Number.isFinite(ghost.groundY) ||
    !Array.isArray(ghost.points) ||
    ghost.points.length < 2 ||
    ghost.points.length > MAX_GHOST_POINTS
  ) return false;

  let lastFrame = -1;
  return ghost.points.every((point) => {
    if (
      !Array.isArray(point) ||
      (point.length !== 5 && point.length !== 6) ||
      !Number.isInteger(point[0]) ||
      point[0] <= lastFrame ||
      !Number.isFinite(point[1]) ||
      !Number.isFinite(point[2]) ||
      !Number.isFinite(point[3]) ||
      (point[4] !== 0 && point[4] !== 1) ||
      (point.length === 6 && (!Number.isFinite(point[5]) || point[5] < 0.5 || point[5] > 2))
    ) return false;
    lastFrame = point[0];
    return true;
  });
}

function getGhostKey() {
  return levelData
    ? String(currentLevelIdx) + ":" + (editorTesting ? "editor" : "practice")
    : null;
}

function persistGhosts() {
  try {
    localStorage.setItem(GHOST_STORAGE_KEY, JSON.stringify(bestGhosts));
    return true;
  } catch (e) {
    console.warn("Couldn't save ghost replay", e);
    return false;
  }
}

function clearGhostForLevel(key) {
  const prefix = key + ":";
  for (const ghostKey of Object.keys(bestGhosts)) {
    if (ghostKey === key || ghostKey.startsWith(prefix)) delete bestGhosts[ghostKey];
  }
  persistGhosts();
}

function shiftCustomGhostsAfterDelete(deletedIndex) {
  const shifted = {};
  for (const [key, ghost] of Object.entries(bestGhosts)) {
    const match = /^c(\d+)(:.*)?$/.exec(key);
    if (!match) {
      shifted[key] = ghost;
      continue;
    }
    const index = Number(match[1]);
    if (index < deletedIndex) shifted[key] = ghost;
    else if (index > deletedIndex) shifted["c" + (index - 1) + (match[2] || "")] = ghost;
  }
  bestGhosts = shifted;
  persistGhosts();
}

function beginGhostRun() {
  activeGhostKey = practiceMode || editorTesting ? getGhostKey() : null;
  ghostFrame = 0;
  ghostRunGroundY = groundY;
  runGhostPoints = [];
  if (activeGhostKey) {
    runGhostPoints.push([0, P.x, P.y, P.rot, P.isShip ? 1 : 0, P.sizeScale]);
  }
}

function recordGhostFrame() {
  if (!activeGhostKey) return;
  ghostFrame++;
  if (ghostFrame % GHOST_SAMPLE_FRAMES === 0 && runGhostPoints.length < MAX_GHOST_POINTS) {
    runGhostPoints.push([ghostFrame, P.x, P.y, P.rot, P.isShip ? 1 : 0, P.sizeScale]);
  }
}

function finishGhostRun(completed) {
  if (!activeGhostKey) return;
  const progress = completed ? 100 : getProgress();
  const last = runGhostPoints[runGhostPoints.length - 1];
  const finalPoint = [ghostFrame, P.x, P.y, P.rot, P.isShip ? 1 : 0, P.sizeScale];
  if (last && last[0] === ghostFrame) runGhostPoints[runGhostPoints.length - 1] = finalPoint;
  else if (runGhostPoints.length < MAX_GHOST_POINTS) runGhostPoints.push(finalPoint);
  else runGhostPoints[runGhostPoints.length - 1] = finalPoint;

  const previous = bestGhosts[activeGhostKey];
  if (
    runGhostPoints.length > 1 &&
    (!previous || progress > previous.progress || (completed && !previous.completed))
  ) {
    bestGhosts[activeGhostKey] = {
      mode: editorTesting ? "editor" : "practice",
      progress,
      completed: completed || !!(previous && previous.completed),
      frames: ghostFrame,
      groundY: ghostRunGroundY,
      points: runGhostPoints.slice(),
    };
    persistGhosts();
  }
  runGhostPoints = [];
}

function getGhostPosition(ghost) {
  const points = ghost.points;
  if (ghostFrame > ghost.frames) return null;
  let next = 1;
  while (next < points.length && points[next][0] < ghostFrame) next++;
  if (next >= points.length) {
    const last = points[points.length - 1];
    return ghostFrame === last[0]
      ? [last[1], last[2], last[3], last[4], last[5] || 1]
      : null;
  }
  const from = points[next - 1];
  const to = points[next];
  const fraction = Math.max(0, Math.min(1, (ghostFrame - from[0]) / (to[0] - from[0])));
  return [
    from[1] + (to[1] - from[1]) * fraction,
    from[2] + (to[2] - from[2]) * fraction,
    from[3] + (to[3] - from[3]) * fraction,
    fraction < 0.5 ? from[4] : to[4],
    (from[5] || 1) + ((to[5] || 1) - (from[5] || 1)) * fraction,
  ];
}

// -------------------- Start / Restart --------------------
function startLevel(idx) {
  initAudio();
  editorTesting = false;
  currentLevelIdx = idx;
  levels = makeLevels();
  levelData = levels[idx];
  deathNum = 0;
  attemptNum = (totalAttempts[idx] || 0) + 1;
  totalAttempts[idx] = attemptNum;
  levelTimer = now();
  levelFinishTime = 0;
  resetPlayer(false);
  beginGhostRun();
  gameState = "playing";
  startMusic();
  showAttemptFlash();
}

function restart() {
  if (practiceMode && checkpoints.length) {
    finishGhostRun(false);
    resetPlayer(true);
    beginGhostRun();
  } else {
    finishGhostRun(false);
    attemptNum++;
    totalAttempts[currentLevelIdx] = attemptNum;
    save();
    resetPlayer(false);
    beginGhostRun();
    startMusic();
  }
  gameState = "playing";
  showAttemptFlash();
}

function showAttemptFlash() {
  attemptFlashAlpha = 1.5; // starts > 1 so it stays at full for a bit
  attemptFlashText = "Attempt " + attemptNum;
}

function kill() {
  if (P.dead) return;
  deathCheckpointCandidate = null;
  if (practiceMode && !editorTesting && recentPlayerStates.length) {
    const candidateIndex = Math.max(0, recentPlayerStates.length - 18);
    deathCheckpointCandidate = { ...recentPlayerStates[candidateIndex] };
  }
  finishGhostRun(false);
  P.dead = true;
  deathNum++;
  shakeIntensity = 14;
  sfxDie();
  const emitSize = playerSize();
  emitP(P.x + emitSize / 2, P.y + emitSize / 2, "#ff0040", 28, 12);
  emitP(P.x + emitSize / 2, P.y + emitSize / 2, "#ffcc00", 14, 8);
  const prog = getProgress();
  if (!bestProg[currentLevelIdx] || prog > bestProg[currentLevelIdx]) {
    bestProg[currentLevelIdx] = prog;
    save();
  }
  setTimeout(() => {
    if (gameState === "playing" && P.dead) gameState = "dead";
  }, 450);
}

function win() {
  finishGhostRun(true);
  P.done = true;
  gameState = "complete";
  bestProg[currentLevelIdx] = 100;
  save();
  sfxWin();
  const emitSize = playerSize();
  emitP(P.x + emitSize / 2, P.y + emitSize / 2, "#00ff88", 45, 14);
  emitP(P.x + emitSize / 2, P.y + emitSize / 2, "#ffff00", 35, 10);
  emitP(P.x + emitSize / 2, P.y + emitSize / 2, "#ff44ff", 25, 8);
  stopMusic();
  levelFinishTime = (now() - levelTimer) / 1000;
}

// -------------------- Update --------------------
function update() {
  if (gameState !== "playing" || P.dead || P.done) return;
  if (!levelData) return;
  const pSize = playerSize();
  const timeScale = advancePortalEffects();

  recentPlayerStates.push(
    playerCheckpointSnapshot(P.x, P.y, P.isShip, P.speed, P.grounded)
  );
  if (recentPlayerStates.length > 36) recentPlayerStates.shift();

  recordGhostFrame();
  inputJustDown = inputHeld && !_inputWasDown;
  _inputWasDown = inputHeld;

  P.x += P.speed * timeScale;

  // Update trail
  trail.push({ x: P.x + pSize / 2, y: P.y + pSize / 2, life: 1, rot: P.rot, ship: P.isShip });
  if (trail.length > 18) trail.shift();
  for (let i = trail.length - 1; i >= 0; i--) {
    trail[i].life -= 0.06;
    if (trail[i].life <= 0) trail.splice(i, 1);
  }

  // Practice checkpoints remember mode, height, and speed.
  if (practiceMode && P.x - lastCpX > 680 && checkpointSafe()) {
    checkpoints.push({
      x: P.x,
      y: P.y,
      isShip: P.isShip,
      speed: P.speed,
      grounded: P.grounded,
      sizeScale: P.sizeScale,
      gravityScale: P.gravityScale,
      extraJumps: P.extraJumps,
      sizeFrames: P.sizeFrames,
      gravityFrames: P.gravityFrames,
      slowTimeFrames: P.slowTimeFrames,
      momentumFrames: P.momentumFrames,
      momentumBaseSpeed: P.momentumBaseSpeed,
    });
    lastCpX = P.x;
    emitP(P.x + pSize / 2, P.y + pSize / 2, "#00ff88", 8, 3);
  }

  // Camera
  cameraX += (P.x - 250 - cameraX) * 0.12;

  const solidBelow = isGround(P.x + pSize / 2);

  if (P.isShip) {
    // --- Ship mode ---
    if (inputHeld) P.vy += SHIP_FLY * P.gravityScale * timeScale;
    else P.vy += SHIP_GRAV * P.gravityScale * timeScale;
    P.vy = Math.max(-6.6, Math.min(6.6, P.vy));
    P.y += P.vy * timeScale;
    if (P.y < CEIL_Y) {
      P.y = CEIL_Y;
      P.vy = 0;
    }
    if (!solidBelow && P.y + pSize > groundY) {
      kill();
      return;
    }
    if (solidBelow && P.y + pSize >= groundY) {
      P.y = groundY - pSize;
      P.vy = 0;
    }
    P.rot = P.vy * 2 * (Math.PI / 180);

    // Block collisions in ship mode
    for (const o of levelData.obs) {
      if (o.type !== "plat" && o.type !== "block") continue;
      if (rr(P.x + 5, P.y + 5, pSize - 10, pSize - 10, o.x, o.y, o.w, o.h)) {
        kill();
        return;
      }
    }
    if (P.y > groundY + pSize || P.y > H + 150) {
      kill();
      return;
    }
  } else {
    // --- Cube mode ---
    P.vy += GRAVITY * P.gravityScale * timeScale;
    P.y += P.vy * timeScale;

    let onPlat = false;

    for (const o of levelData.obs) {
      if (o.type !== "plat" && o.type !== "block") continue;
      const ox = o.x,
        oy = o.y,
        ow = o.w,
        oh = o.h;
      if (P.x + pSize > ox && P.x < ox + ow) {
        // Land on top
        if (P.vy >= 0 && P.y + pSize >= oy && P.y + pSize <= oy + oh + P.vy + 2) {
          P.y = oy - pSize;
          P.vy = 0;
          if (!P.grounded) {
            sfxLand();
            P.extraJumps = 0;
          }
          P.grounded = true;
          onPlat = true;
        }
        // Bump head
        if (P.vy < 0 && P.y <= oy + oh && P.y >= oy - 2) {
          P.vy = 1;
          P.y = oy + oh;
        }
      }
      // Side collision
      if (P.y + pSize > oy + 2 && P.y < oy + oh - 2) {
        if (P.x + pSize > ox && P.x + pSize < ox + P.speed + 4 && P.x < ox) {
          kill();
          return;
        }
      }
    }

    // Ground
    if (solidBelow && P.y + pSize >= groundY) {
      // If player's top is below ground level, they fell through a gap — kill them
      if (P.y > groundY) {
        kill();
        return;
      }
      P.y = groundY - pSize;
      if (P.vy > 0 && !P.grounded) sfxLand();
      if (!P.grounded) P.extraJumps = 0;
      P.grounded = true;
      coyoteFrames = 4;
      P.vy = 0;
    } else if (!onPlat) {
      if (P.grounded) coyoteFrames = 4;
      P.grounded = false;
    }

    // Fell into gap / void — kill as soon as player falls a full tile below ground
    if (P.y > groundY + pSize) {
      kill();
      return;
    }

    // Jump
    if (inputJustDown && (P.grounded || coyoteFrames > 0 || P.extraJumps > 0)) {
      if (!P.grounded && coyoteFrames > 0 && Math.abs(P.y - (groundY - pSize)) <= 10) {
        P.y = groundY - pSize;
      }
      P.vy = JUMP_VEL;
      if (!P.grounded && coyoteFrames <= 0) P.extraJumps--;
      P.grounded = false;
      coyoteFrames = 0;
      P.tgtRot += Math.PI / 2;
      sfxJump();
    } else if (coyoteFrames > 0) {
      coyoteFrames = Math.max(0, coyoteFrames - timeScale);
    }

    // Rotation
    if (!P.grounded) {
      P.rot += (P.tgtRot - P.rot) * 0.14;
    } else {
      const snap = Math.round(P.rot / (Math.PI / 2)) * (Math.PI / 2);
      P.rot += (snap - P.rot) * 0.28;
    }
  }

  // --- Obstacle interactions ---
  for (const o of levelData.obs) {
    const dx = o.x - P.x;
    if (dx > 500 || dx < -500) continue;

    switch (o.type) {
      case "spike": {
        const surfY = o.surfY || groundY;
        if (spikeHit(o.x, surfY)) {
          kill();
          return;
        }
        break;
      }
      case "spikeD": {
        const surfY = o.surfY || CEIL_Y;
        if (spikeHitDown(o.x, surfY)) {
          kill();
          return;
        }
        break;
      }
      case "pad":
        if (
          !o._hit &&
          rr(P.x, P.y, pSize, pSize, o.x, groundY - 16, 40, 16)
        ) {
          P.vy = PAD_JUMP;
          P.grounded = false;
          coyoteFrames = 0;
          P.extraJumps = 0;
          P.tgtRot += Math.PI;
          sfxPad();
          o._hit = true;
        }
        break;
      case "orb":
        if (
          inputHeld &&
          !o._hit &&
          rr(P.x - 8, P.y - 8, pSize + 16, pSize + 16, o.x - 22, o.y - 22, 44, 44)
        ) {
          P.vy = ORB_JUMP;
          P.grounded = false;
          coyoteFrames = 0;
          P.extraJumps = 0;
          P.tgtRot += Math.PI / 2;
          sfxOrb();
          o._hit = true;
        }
        break;
      case "sizeSmallP":
      case "sizeBigP":
      case "bounceP":
      case "lowGravP":
      case "highGravP":
      case "doubleJumpP":
      case "slowTimeP":
      case "momentumP":
        activatePowerPortal(o, pSize);
        break;
      case "speedP":
        if (rr(P.x, P.y, pSize, pSize, o.x - 20, CEIL_Y, 40, groundY - CEIL_Y)) {
          P.speed = SPEEDS[o.spd] || BASE_SPEED;
          if (P.momentumFrames > 0) P.momentumBaseSpeed = P.speed;
        }
        break;
      case "shipP":
        if (rr(P.x, P.y, pSize, pSize, o.x - 18, CEIL_Y, 52, groundY - CEIL_Y)) {
          if (!P.isShip) {
            P.isShip = true;
            P.vy = -1.5;
            coyoteFrames = 0;
          }
        }
        break;
      case "cubeP":
        if (rr(P.x, P.y, pSize, pSize, o.x - 18, CEIL_Y, 52, groundY - CEIL_Y)) {
          if (P.isShip) {
            P.isShip = false;
            P.grounded = false;
            coyoteFrames = 0;
            P.extraJumps = 0;
            P.vy = Math.min(P.vy, 2);
          }
        }
        break;
      case "saw": {
        const sy =
          o.y +
          (o.my ? Math.sin(songTime() * (o.ms || 0.5) * Math.PI * 2) * o.my : 0);
        const dist = Math.hypot(P.x + pSize / 2 - o.x, P.y + pSize / 2 - sy);
        if (dist < (o.r || 18) + pSize * 0.26) {
          kill();
          return;
        }
        break;
      }
      case "coin":
        if (
          !o._hit &&
          Math.hypot(P.x + pSize / 2 - o.x, P.y + pSize / 2 - o.y) < 34
        ) {
          o._hit = true;
          if (!coinsGot[currentLevelIdx]) coinsGot[currentLevelIdx] = {};
          coinsGot[currentLevelIdx][o.id] = 1;
          save();
          sfxCoin();
          emitP(o.x, o.y, "#ffd84a", 14, 5);
        }
        break;
      case "mover": {
        const my = o.y + Math.sin(now() * o.ms) * o.my;
        if (rr(P.x + 5, P.y + 5, pSize - 10, pSize - 10, o.x, my, o.w, o.h)) {
          kill();
          return;
        }
        break;
      }
      case "finish":
        if (rr(P.x, P.y, pSize, pSize, o.x - 10, CEIL_Y, 60, groundY - CEIL_Y)) {
          win();
          return;
        }
        break;
    }
  }
}

// ================================================================
// RENDERING
// ================================================================

function drawBG() {
  bgPulse *= 0.92;
  const hue = levelData ? levelData.hue : 220;
  const baseLit = 5;
  const energy = beatEnergy();
  const pulseLit = bgPulse * 6 + energy * 6;

  // Gradient background
  const bgGrd = ctx.createLinearGradient(0, 0, 0, H);
  bgGrd.addColorStop(0, `hsl(${hue}, 35%, ${baseLit + pulseLit + 2}%)`);
  bgGrd.addColorStop(0.7, `hsl(${hue}, 30%, ${baseLit + pulseLit}%)`);
  bgGrd.addColorStop(1, `hsl(${hue + 15}, 25%, ${baseLit + pulseLit - 1}%)`);
  ctx.fillStyle = bgGrd;
  ctx.fillRect(0, 0, W, H);

  // Parallax scrolling grid
  ctx.strokeStyle = `hsla(${hue}, 50%, ${15 + pulseLit * 2}%, 0.06)`;
  ctx.lineWidth = 1;
  const gs = 80;
  const ox = -(cameraX * 0.3 % gs);
  for (let gx = ox; gx < W; gx += gs) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, H);
    ctx.stroke();
  }
  for (let gy = 0; gy < H; gy += gs) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(W, gy);
    ctx.stroke();
  }

  // Parallax columns — slow, geometric, locked to the level color
  ctx.save();
  for (let i = 0; i < 9; i++) {
    const depth = 0.08 + (i % 3) * 0.045;
    const colW = 54 + (i % 3) * 22;
    const colH = 70 + (i % 4) * 36;
    const span = W + 520;
    const sx = ((i * 310 - cameraX * depth) % span + span) % span - 140;
    const sy = groundY - colH - 36 - (i % 3) * 22;
    ctx.globalAlpha = 0.05 + energy * 0.03;
    ctx.fillStyle = `hsl(${hue + i * 8}, 42%, 26%)`;
    ctx.fillRect(sx, sy, colW, colH);
    ctx.globalAlpha = 0.14 + energy * 0.2;
    ctx.fillStyle = `hsl(${hue}, 75%, 58%)`;
    ctx.fillRect(sx, sy, colW, 3);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawGroundAndCeil() {
  if (!levelData) return;
  const hue = levelData.hue;

  // Ground fill with gradient
  const gaps = levelData.obs
    .filter((o) => o.type === "gap")
    .sort((a, b) => a.x - b.x);
  let prev = -500;
  for (const g of gaps) {
    const gx = g.x - cameraX;
    const gg = ctx.createLinearGradient(0, groundY, 0, H);
    gg.addColorStop(0, `hsl(${hue}, 45%, 12%)`);
    gg.addColorStop(1, `hsl(${hue}, 35%, 6%)`);
    ctx.fillStyle = gg;
    ctx.fillRect(prev, groundY, gx - prev, H - groundY);
    prev = gx + g.w;
  }
  const gg2 = ctx.createLinearGradient(0, groundY, 0, H);
  gg2.addColorStop(0, `hsl(${hue}, 45%, 12%)`);
  gg2.addColorStop(1, `hsl(${hue}, 35%, 6%)`);
  ctx.fillStyle = gg2;
  ctx.fillRect(prev, groundY, W - prev + 2000, H - groundY);

  // Ground line blocks pattern
  ctx.save();
  ctx.strokeStyle = `hsla(${hue}, 70%, 30%, 0.15)`;
  ctx.lineWidth = 1;
  const bSz = 40;
  const bOx = -(cameraX % bSz);
  for (let bx = bOx; bx < W; bx += bSz) {
    const wx = bx + cameraX;
    if (!isGround(wx)) continue;
    ctx.beginPath();
    ctx.moveTo(bx, groundY);
    ctx.lineTo(bx, H);
    ctx.stroke();
  }
  for (let by = groundY + bSz; by < H; by += bSz) {
    ctx.beginPath();
    ctx.moveTo(0, by);
    ctx.lineTo(W, by);
    ctx.stroke();
  }
  ctx.restore();

  // Ground tiles brighten on the beat
  const energy = beatEnergy();
  const tile = 34;
  const tox = -(((cameraX % tile) + tile) % tile);
  for (let sx = tox; sx < W; sx += tile) {
    const wx = sx + cameraX;
    if (!isGround(wx + 2) || !isGround(wx + tile - 2)) continue;
    ctx.fillStyle = `hsl(${hue}, 38%, ${10 + energy * 5}%)`;
    ctx.fillRect(sx + 2, groundY + 6, tile - 4, tile - 5);
    ctx.fillStyle = `hsla(${hue}, 85%, ${50 + energy * 25}%, ${0.35 + energy * 0.45})`;
    ctx.fillRect(sx + 2, groundY + 6, tile - 4, 3);
  }

  // Glowing ground line — thicker with double glow
  ctx.save();
  ctx.shadowColor = `hsl(${hue}, 100%, 55%)`;
  ctx.shadowBlur = 16 + energy * 18;
  ctx.strokeStyle = `hsl(${hue}, 90%, 52%)`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  let pen = false;
  for (let sx = 0; sx < W; sx += 2) {
    const wx = sx + cameraX;
    if (isGround(wx)) {
      if (!pen) {
        ctx.moveTo(sx, groundY);
        pen = true;
      } else ctx.lineTo(sx, groundY);
    } else {
      pen = false;
    }
  }
  ctx.stroke();

  // Ceiling line — subtle
  ctx.shadowBlur = 10;
  ctx.strokeStyle = `hsla(${hue}, 80%, 45%, 0.6)`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, CEIL_Y);
  ctx.lineTo(W, CEIL_Y);
  ctx.stroke();
  ctx.restore();
}

function drawObs() {
  if (!levelData) return;
  const hue = levelData.hue;

  for (const o of levelData.obs) {
    if (o.type !== "deco") continue;
    const sx = o.x - cameraX;
    if (sx < -40 || sx > W + 40) continue;
    ctx.fillStyle = `hsla(${hue}, 45%, 48%, 0.14)`;
    ctx.fillRect(sx, o.y, o.w, o.h);
    ctx.fillStyle = `hsla(${hue}, 80%, 62%, 0.32)`;
    ctx.fillRect(sx, o.y, o.w, 2);
  }

  for (const o of levelData.obs) {
    if (o.type === "deco") continue;
    const sx = o.x - cameraX;
    if (sx < -250 || sx > W + 250) continue;

    ctx.save();
    switch (o.type) {
      case "spike": {
        const surfY = o.surfY || groundY;
        // Gradient spike
        const sg = ctx.createLinearGradient(sx + SPIKE_W / 2, surfY - SPIKE_H, sx + SPIKE_W / 2, surfY);
        sg.addColorStop(0, `hsl(${hue + 30}, 100%, 60%)`);
        sg.addColorStop(1, `hsl(${hue + 30}, 80%, 35%)`);
        ctx.fillStyle = sg;
        ctx.shadowColor = `hsl(${hue + 30}, 100%, 55%)`;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(sx, surfY);
        ctx.lineTo(sx + SPIKE_W, surfY);
        ctx.lineTo(sx + SPIKE_W / 2, surfY - SPIKE_H);
        ctx.closePath();
        ctx.fill();
        // Inner highlight
        ctx.fillStyle = `hsla(${hue + 30}, 100%, 70%, 0.3)`;
        ctx.beginPath();
        ctx.moveTo(sx + SPIKE_W * 0.3, surfY);
        ctx.lineTo(sx + SPIKE_W * 0.7, surfY);
        ctx.lineTo(sx + SPIKE_W / 2, surfY - SPIKE_H * 0.6);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "spikeD": {
        const surfY = o.surfY || CEIL_Y;
        const sg = ctx.createLinearGradient(sx + SPIKE_W / 2, surfY, sx + SPIKE_W / 2, surfY + SPIKE_H);
        sg.addColorStop(0, `hsl(${hue + 30}, 80%, 35%)`);
        sg.addColorStop(1, `hsl(${hue + 30}, 100%, 60%)`);
        ctx.fillStyle = sg;
        ctx.shadowColor = `hsl(${hue + 30}, 100%, 55%)`;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(sx, surfY);
        ctx.lineTo(sx + SPIKE_W, surfY);
        ctx.lineTo(sx + SPIKE_W / 2, surfY + SPIKE_H);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = `hsla(${hue + 30}, 100%, 70%, 0.3)`;
        ctx.beginPath();
        ctx.moveTo(sx + SPIKE_W * 0.3, surfY);
        ctx.lineTo(sx + SPIKE_W * 0.7, surfY);
        ctx.lineTo(sx + SPIKE_W / 2, surfY + SPIKE_H * 0.6);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "plat": {
        const pg = ctx.createLinearGradient(0, o.y, 0, o.y + o.h);
        pg.addColorStop(0, `hsl(${hue}, 55%, 32%)`);
        pg.addColorStop(1, `hsl(${hue}, 45%, 22%)`);
        ctx.fillStyle = pg;
        ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;
        ctx.shadowBlur = 8;
        ctx.fillRect(sx, o.y, o.w, o.h);
        ctx.strokeStyle = `hsl(${hue}, 90%, 55%)`;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(sx, o.y, o.w, o.h);
        break;
      }
      case "block": {
        const bg = ctx.createLinearGradient(0, o.y, 0, o.y + o.h);
        bg.addColorStop(0, `hsl(${hue + 10}, 40%, 24%)`);
        bg.addColorStop(1, `hsl(${hue + 10}, 30%, 14%)`);
        ctx.fillStyle = bg;
        ctx.shadowColor = `hsl(${hue}, 80%, 45%)`;
        ctx.shadowBlur = 8;
        ctx.fillRect(sx, o.y, o.w, o.h);
        ctx.strokeStyle = `hsl(${hue}, 65%, 45%)`;
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, o.y, o.w, o.h);
        // Inner cross pattern
        ctx.strokeStyle = `hsla(${hue}, 50%, 35%, 0.25)`;
        ctx.lineWidth = 1;
        const cSz = 20;
        for (let cx = sx; cx < sx + o.w; cx += cSz) {
          ctx.beginPath();
          ctx.moveTo(cx, o.y);
          ctx.lineTo(cx, o.y + o.h);
          ctx.stroke();
        }
        break;
      }
      case "gap":
        break;
      case "pad": {
        const bounce = o._hit ? Math.sin(now() * 0.01) * 3 : 0;
        ctx.shadowColor = "#ffdd00";
        ctx.shadowBlur = 16;
        const pdg = ctx.createLinearGradient(sx + 20, groundY - 16, sx + 20, groundY);
        pdg.addColorStop(0, "#ffee44");
        pdg.addColorStop(1, "#cc9900");
        ctx.fillStyle = pdg;
        ctx.beginPath();
        ctx.moveTo(sx, groundY);
        ctx.lineTo(sx + 40, groundY);
        ctx.lineTo(sx + 30, groundY - 16 + bounce);
        ctx.lineTo(sx + 10, groundY - 16 + bounce);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "orb": {
        const pulse = Math.sin(now() * 0.005) * 4;
        const used = o._hit;
        ctx.shadowColor = "#aa44ff";
        ctx.shadowBlur = used ? 0 : 22;
        // Outer ring
        if (!used) {
          ctx.strokeStyle = "rgba(170, 68, 255, 0.3)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sx, o.y, 18 + pulse * 0.5, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Main orb
        const og = ctx.createRadialGradient(sx - 3, o.y - 3, 2, sx, o.y, 13 + pulse);
        og.addColorStop(0, used ? "#555" : "#dd88ff");
        og.addColorStop(1, used ? "#333" : "#7722cc");
        ctx.fillStyle = og;
        ctx.beginPath();
        ctx.arc(sx, o.y, 13 + pulse, 0, Math.PI * 2);
        ctx.fill();
        // Inner highlight
        if (!used) {
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.beginPath();
          ctx.arc(sx - 3, o.y - 3, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case "speedP": {
        const cols = {
          slow: "#00aaff",
          normal: "#00ff88",
          fast: "#ff8800",
          veryfast: "#ff0044",
        };
        const c = cols[o.spd] || "#fff";
        ctx.strokeStyle = c;
        ctx.shadowColor = c;
        ctx.shadowBlur = 16;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(sx, CEIL_Y);
        ctx.lineTo(sx, groundY);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sx - 16, groundY - 70);
        ctx.lineTo(sx + 10, groundY - 48);
        ctx.lineTo(sx - 16, groundY - 26);
        ctx.moveTo(sx - 4, groundY - 70);
        ctx.lineTo(sx + 22, groundY - 48);
        ctx.lineTo(sx - 4, groundY - 26);
        ctx.stroke();
        break;
      }
      case "sizeSmallP":
      case "sizeBigP":
      case "bounceP":
      case "lowGravP":
      case "highGravP":
      case "doubleJumpP":
      case "slowTimeP":
      case "momentumP": {
        const portals = {
          sizeSmallP: { color: "#44ddff", mark: "-" },
          sizeBigP: { color: "#ff66dd", mark: "+" },
          bounceP: { color: "#ffbb44", mark: "^" },
          lowGravP: { color: "#66ffbb", mark: "v" },
          highGravP: { color: "#ff6655", mark: "!" },
          doubleJumpP: { color: "#cc88ff", mark: "2" },
          slowTimeP: { color: "#66aaff", mark: "T" },
          momentumP: { color: "#ff9966", mark: "M" },
        };
        const portal = portals[o.type];
        ctx.strokeStyle = portal.color;
        ctx.shadowColor = portal.color;
        ctx.shadowBlur = o._hit ? 4 : 18;
        ctx.globalAlpha = o._hit ? 0.4 : 0.9;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(sx, CEIL_Y);
        ctx.lineTo(sx, groundY);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = portal.color;
        ctx.beginPath();
        ctx.arc(sx, groundY - 52, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#101018";
        ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = "center";
        ctx.fillText(portal.mark, sx, groundY - 46);
        break;
      }
      case "shipP":
      case "cubeP": {
        const c = o.type === "shipP" ? "#00ffcc" : "#ffcc00";
        ctx.strokeStyle = c;
        ctx.shadowColor = c;
        ctx.shadowBlur = 18;
        ctx.globalAlpha = 0.8;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(sx, CEIL_Y);
        ctx.lineTo(sx, groundY);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 3;
        ctx.beginPath();
        if (o.type === "shipP") {
          ctx.moveTo(sx - 16, groundY - 78);
          ctx.lineTo(sx + 18, groundY - 58);
          ctx.lineTo(sx - 16, groundY - 38);
        } else {
          ctx.rect(sx - 12, groundY - 78, 24, 24);
        }
        ctx.stroke();
        break;
      }
      case "saw": {
        const r = o.r || 18;
        const sy = o.y + (o.my ? Math.sin(songTime() * (o.ms || 0.5) * Math.PI * 2) * o.my : 0);
        ctx.translate(sx, sy);
        ctx.rotate(songTime() * 7);
        ctx.fillStyle = "#ff3355";
        ctx.shadowColor = "#ff3355";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        const teeth = 9;
        for (let i = 0; i < teeth; i++) {
          const a0 = (i / teeth) * Math.PI * 2;
          const a1 = ((i + 0.45) / teeth) * Math.PI * 2;
          ctx.lineTo(Math.cos(a0) * r * 0.72, Math.sin(a0) * r * 0.72);
          ctx.lineTo(Math.cos(a1) * (r + 6), Math.sin(a1) * (r + 6));
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#1a060c";
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "coin": {
        if (o._hit) break;
        const bob = Math.sin(songTime() * 3 + (o.id || 0)) * 4;
        ctx.shadowColor = "#ffd84a";
        ctx.shadowBlur = 16;
        ctx.fillStyle = "#ffd84a";
        ctx.beginPath();
        ctx.arc(sx, o.y + bob, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff6b0";
        ctx.beginPath();
        ctx.arc(sx - 3, o.y + bob - 3, 3, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "mover": {
        const my = o.y + Math.sin(now() * o.ms) * o.my;
        const mg = ctx.createLinearGradient(sx, my, sx + o.w, my + o.h);
        mg.addColorStop(0, `hsl(${hue + 60}, 75%, 42%)`);
        mg.addColorStop(1, `hsl(${hue + 60}, 65%, 28%)`);
        ctx.fillStyle = mg;
        ctx.shadowColor = `hsl(${hue + 60}, 100%, 55%)`;
        ctx.shadowBlur = 12;
        ctx.fillRect(sx, my, o.w, o.h);
        ctx.strokeStyle = `hsl(${hue + 60}, 100%, 65%)`;
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, my, o.w, o.h);
        // Danger indicator — pulsing inner
        ctx.fillStyle = `hsla(${hue + 60}, 100%, 65%, ${0.15 + Math.sin(now() * 0.008) * 0.1})`;
        ctx.fillRect(sx + 4, my + 4, o.w - 8, o.h - 8);
        break;
      }
      case "finish": {
        const t = now() * 0.003;
        const fcx = sx + 20, fcy = groundY - 55;
        // Outer glow
        const fg = ctx.createRadialGradient(fcx, fcy, 0, fcx, fcy, 55);
        fg.addColorStop(0, "rgba(255,255,255,0.15)");
        fg.addColorStop(0.5, "rgba(255,255,255,0.05)");
        fg.addColorStop(1, "transparent");
        ctx.fillStyle = fg;
        ctx.fillRect(fcx - 60, fcy - 60, 120, 120);
        // Spinning arcs
        ctx.shadowColor = "#fff";
        ctx.shadowBlur = 25;
        ctx.lineWidth = 3;
        const arcCols = ["#fff", "#00ff88", "#ffcc00"];
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = arcCols[i];
          ctx.beginPath();
          ctx.arc(fcx, fcy, 28 + i * 10, t + i * 0.7, t + i * 0.7 + Math.PI * 1.4);
          ctx.stroke();
        }
        // Center star
        ctx.fillStyle = "#fff";
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(fcx, fcy, 6 + Math.sin(t * 2) * 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }
    ctx.restore();
  }
}

function drawGhostReplay() {
  if (!ghostReplayVisible || !activeGhostKey) return;
  const ghost = bestGhosts[activeGhostKey];
  if (!ghost) return;
  const yOffset = groundY - ghost.groundY;

  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < ghost.points.length; i++) {
    const point = ghost.points[i];
    const size = PS * (point[5] || 1);
    const sx = point[1] + size / 2 - cameraX;
    const sy = point[2] + yOffset + size / 2;
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.strokeStyle = "rgba(190, 130, 255, 0.58)";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#b879ff";
  ctx.shadowBlur = 12;
  ctx.stroke();

  const position = getGhostPosition(ghost);
  if (position) {
    const scale = position[4] || 1;
    ctx.translate(position[0] + (PS * scale) / 2 - cameraX, position[1] + yOffset + (PS * scale) / 2);
    ctx.rotate(position[2]);
    ctx.scale(scale, scale);
    ctx.globalAlpha = 0.48;
    ctx.fillStyle = "#b879ff";
    ctx.strokeStyle = "#ead7ff";
    ctx.lineWidth = 2;
    if (position[3]) {
      ctx.beginPath();
      ctx.moveTo(PS / 2, 0);
      ctx.lineTo(-PS / 2, -PS / 3);
      ctx.lineTo(-PS / 3, 0);
      ctx.lineTo(-PS / 2, PS / 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(-PS / 2, -PS / 2, PS, PS);
      ctx.strokeRect(-PS / 2, -PS / 2, PS, PS);
    }
  }
  ctx.restore();
}

function drawPlayer() {
  drawGhostReplay();
  if (P.dead) return;
  const size = playerSize();
  const dx = P.x - cameraX;
  const cx = dx + size / 2,
    cy = P.y + size / 2;

  if (practiceMode && checkpoints.length) {
    ctx.save();
    ctx.strokeStyle = "rgba(0, 255, 136, 0.75)";
    ctx.lineWidth = 2;
    for (const cp of checkpoints) {
      const sx = cp.x - cameraX;
      if (sx < -10 || sx > W + 10) continue;
      const cpSize = PS * (cp.sizeScale || 1);
      ctx.beginPath();
      ctx.moveTo(sx, cp.y + cpSize);
      ctx.lineTo(sx, cp.y - 24);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Draw trail behind player
  if (trail.length > 1) {
    for (let i = 0; i < trail.length; i++) {
      const t = trail[i];
      const tx = t.x - cameraX;
      const ty = t.y;
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(t.rot || 0);
      ctx.globalAlpha = t.life * 0.32;
      ctx.fillStyle = playerColor;
      const sz = size * (0.35 + t.life * 0.45);
      if (t.ship) {
        ctx.beginPath();
        ctx.moveTo(sz / 2, 0);
        ctx.lineTo(-sz / 2, -sz / 4);
        ctx.lineTo(-sz / 2, sz / 4);
        ctx.closePath();
        ctx.fill();
      } else if (playerSkin === "circle") {
        ctx.beginPath();
        ctx.arc(0, 0, sz / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (playerSkin === "diamond") {
        ctx.beginPath();
        ctx.moveTo(0, -sz / 2);
        ctx.lineTo(sz / 2, 0);
        ctx.lineTo(0, sz / 2);
        ctx.lineTo(-sz / 2, 0);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(P.rot);
  ctx.scale(P.sizeScale, P.sizeScale);

  if (P.isShip) {
    ctx.save();
    ctx.shadowColor = playerColor;
    ctx.shadowBlur = 18;
    const sg = ctx.createLinearGradient(-PS / 2, 0, PS / 2, 0);
    sg.addColorStop(0, colorAlpha(playerColor, 0.68));
    sg.addColorStop(1, playerColor);
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(PS / 2, 0);
    ctx.lineTo(-PS / 2, -PS / 3);
    ctx.lineTo(-PS / 3, 0);
    ctx.lineTo(-PS / 2, PS / 3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 0.3 + Math.sin(now() * 0.015) * 0.1;
    ctx.fillStyle = playerColor;
    ctx.fillRect(-PS * 0.8, -4, PS * 0.35, 8);
    ctx.globalAlpha = 1;
    ctx.restore();
  } else {
    ctx.save();
    ctx.shadowColor = playerColor;
    ctx.shadowBlur = 16;
    ctx.fillStyle = playerColor;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2.5;
    if (playerSkin === "circle") {
      ctx.beginPath();
      ctx.arc(0, 0, PS / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (playerSkin === "diamond") {
      ctx.beginPath();
      ctx.moveTo(0, -PS / 2);
      ctx.lineTo(PS / 2, 0);
      ctx.lineTo(0, PS / 2);
      ctx.lineTo(-PS / 2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(-PS / 2, -PS / 2, PS, PS);
      ctx.strokeRect(-PS / 2, -PS / 2, PS, PS);
    }
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-7, -5, 3.5, 0, Math.PI * 2);
    ctx.arc(7, -5, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#14141c";
    ctx.beginPath();
    ctx.arc(-7, -5, 1.7, 0, Math.PI * 2);
    ctx.arc(7, -5, 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = '12px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.shadowColor = "#000";
  ctx.shadowBlur = 4;
  ctx.fillText(playerName, cx, P.y - 8, 150);
  ctx.restore();

  // Trail sparkle particles
  if (gameState === "playing" && !P.dead && Math.random() < 0.3) {
    emitP(P.x, P.y + size, playerColor, 1, 3);
  }
}

function pauseCheckpointButton() {
  const w = Math.min(250, W * 0.78);
  return { x: (W - w) / 2, y: H / 2 + 76, w, h: 36 };
}

function deathCheckpointButton() {
  const w = Math.min(270, W * 0.82);
  return { x: (W - w) / 2, y: Math.min(H / 2 + 112, H - 54), w, h: 34 };
}

function momentumControlButtons() {
  const y = H - 58;
  return {
    brake: { x: 12, y, w: 76, h: 44 },
    accelerate: { x: W - 88, y, w: 76, h: 44 },
  };
}

function drawHUD() {
  if (gameState !== "playing" && gameState !== "paused") return;
  const prog = getProgress();
  const hue = levelData ? levelData.hue : 200;

  // === Progress bar (upscaled) ===
  const bw = Math.min(W * 0.45, 500),
    bx = (W - bw) / 2,
    by = 18,
    bh = 10,
    br = bh / 2;

  // Track background
  ctx.save();
  ctx.beginPath();
  rRect(bx, by, bw, bh, br);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fill();

  // Filled portion with gradient
  if (prog > 0) {
    ctx.save();
    ctx.beginPath();
    rRect(bx, by, bw, bh, br);
    ctx.clip();
    const grd = ctx.createLinearGradient(bx, 0, bx + bw * (prog / 100), 0);
    grd.addColorStop(0, `hsl(${hue + 120}, 80%, 55%)`);
    grd.addColorStop(1, `hsl(${hue + 140}, 90%, 65%)`);
    ctx.fillStyle = grd;
    ctx.shadowColor = `hsl(${hue + 120}, 100%, 60%)`;
    ctx.shadowBlur = 10;
    ctx.fillRect(bx, by, bw * (prog / 100), bh);
    ctx.restore();
  }

  // Track border
  ctx.beginPath();
  rRect(bx, by, bw, bh, br);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // Percentage text
  ctx.fillStyle = "#fff";
  ctx.font = 'bold 15px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.fillText(prog + "%", W / 2, by + bh + 20);

  // Level name
  ctx.font = '13px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillText(levelData.name, W / 2, by + bh + 36);

  // Left info — larger
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
  ctx.fillText("Attempt " + attemptNum, 56, 34);
  ctx.font = '14px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText("Deaths: " + deathNum, 56, 54);
  ctx.fillStyle = "#ffd84a";
  ctx.font = "bold 14px \"Segoe UI\", system-ui, sans-serif";
  ctx.fillText("\u25C6 " + runCoins() + "/3", 56, practiceMode ? 96 : 74);
  if (practiceMode) {
    ctx.fillStyle = "#00ff88";
    ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
    ctx.fillText("PRACTICE", 56, 74);
  }

  // Back button (top-left, bigger hitbox)
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = 'bold 22px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = "left";
  ctx.fillText("\u2190", 18, 34);

  // Touch-friendly pause control
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = '20px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(gameState === "paused" ? "\u25B6" : "\u275A\u275A", W - 66, 34);

  // Mute button (top-right, bigger)
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = '20px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(muted ? "\u{1F507}" : "\u{1F50A}", W - 20, 34);

  if (P.slowTimeFrames > 0) {
    ctx.fillStyle = "#88bbff";
    ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("SLOW TIME  " + (P.slowTimeFrames / 60).toFixed(1) + "s", W / 2, 112);
  }
  if (P.gravityFrames > 0) {
    const low = P.gravityScale < 1;
    ctx.fillStyle = low ? "#66ffbb" : "#ff6655";
    ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(
      (low ? "LOW GRAVITY  " : "HIGH GRAVITY  ") + (P.gravityFrames / 60).toFixed(1) + "s",
      W / 2,
      130
    );
  }
  if (P.sizeFrames > 0) {
    const small = P.sizeScale < 1;
    ctx.fillStyle = small ? "#44ddff" : "#ff66dd";
    ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(
      (small ? "SMALL  " : "BIG  ") + (P.sizeFrames / 60).toFixed(1) + "s",
      W / 2,
      148
    );
  }
  if (P.momentumFrames > 0 && gameState === "playing") {
    const buttons = momentumControlButtons();
    for (const [action, label] of [["brake", "BRAKE"], ["accelerate", "BOOST"]]) {
      const button = buttons[action];
      const active = momentumControl === action;
      ctx.fillStyle = active ? "rgba(255,153,102,0.4)" : "rgba(10,12,24,0.72)";
      ctx.strokeStyle = "#ff9966";
      ctx.lineWidth = 2;
      rRect(button.x, button.y, button.w, button.h, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = "center";
      ctx.fillText(label, button.x + button.w / 2, button.y + 27);
    }
    ctx.fillStyle = "#ffbb99";
    ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(
      "Momentum: " + P.speed.toFixed(1) + "  \u00B7  A/D or \u2190/\u2192",
      W / 2,
      H - 66
    );
  }

  // Attempt flash (larger)
  if (attemptFlashAlpha > 0) {
    attemptFlashAlpha -= 0.016;
    const a = Math.min(1, attemptFlashAlpha);
    ctx.globalAlpha = a;
    ctx.save();
    ctx.shadowColor = `hsl(${hue + 120}, 100%, 60%)`;
    ctx.shadowBlur = 30;
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.min(56, W * 0.075)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(attemptFlashText, W / 2, H * 0.4);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // Pause overlay (improved)
  if (gameState === "paused") {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 25;
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.min(58, W * 0.08)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("PAUSED", W / 2, H / 2 - 35);
    ctx.restore();

    ctx.font = '18px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText("Click to resume  \u00B7  P to unpause", W / 2, H / 2 + 15);

    ctx.fillStyle = "rgba(255,100,100,0.85)";
    ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(editorTesting ? "Esc \u2014 Back to Editor" : "Esc \u2014 Back to Menu", W / 2, H / 2 + 55);
    if (practiceMode && !editorTesting) {
      const button = pauseCheckpointButton();
      ctx.fillStyle = "rgba(0,255,136,0.12)";
      ctx.strokeStyle = "#00ff88";
      ctx.lineWidth = 1.5;
      rRect(button.x, button.y, button.w, button.h, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#baffd9";
      ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
      ctx.fillText("Set Checkpoint Here (C)", W / 2, button.y + 23);
    }
  }
}

function drawDeath() {
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, W, H);

  // Red vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.8);
  vg.addColorStop(0, "transparent");
  vg.addColorStop(1, "rgba(255, 0, 40, 0.12)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.shadowColor = "#ff0040";
  ctx.shadowBlur = 35;
  ctx.fillStyle = "#ff0040";
  ctx.font = `bold ${Math.min(52, W * 0.07)}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("You crashed!", W / 2, H / 2 - 55);
  ctx.restore();

  // Stats row
  const stats = [
    { label: "Progress", val: getProgress() + "%" },
    { label: "Attempt", val: "#" + attemptNum },
    { label: "Deaths", val: "" + deathNum },
  ];
  const statW = 100, gap = 20, totalW = stats.length * statW + (stats.length - 1) * gap;
  const sx = W / 2 - totalW / 2;
  stats.forEach((s, i) => {
    const bx = sx + i * (statW + gap);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    rRect(bx, H / 2 - 20, statW, 56, 8);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(s.label, bx + statW / 2, H / 2 - 2);
    ctx.fillStyle = "#fff";
    ctx.font = 'bold 20px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(s.val, bx + statW / 2, H / 2 + 26);
  });

  ctx.fillStyle = "#fff";
  ctx.font = 'bold 17px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("Click or Space to retry", W / 2, H / 2 + 70);
  ctx.fillStyle = "#ffd84a";
  ctx.font = "bold 14px \"Segoe UI\", system-ui, sans-serif";
  ctx.fillText("\u25C6 " + runCoins() + "/3", W / 2, H / 2 + 94);

  if (practiceMode && !editorTesting) {
    const button = deathCheckpointButton();
    ctx.fillStyle = "rgba(0,255,136,0.12)";
    ctx.strokeStyle = "#00ff88";
    ctx.lineWidth = 1.5;
    rRect(button.x, button.y, button.w, button.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#baffd9";
    ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillText("Set Checkpoint & Retry (C)", W / 2, button.y + 22);
  }

  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = '14px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(
    editorTesting ? "Esc to return to the editor" : "Esc to go back to menu",
    W / 2,
    practiceMode && !editorTesting ? Math.min(H / 2 + 158, H - 12) : H / 2 + 118
  );
}

function drawWin() {
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(0, 0, W, H);

  // Green glow vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.15, W / 2, H / 2, H * 0.7);
  vg.addColorStop(0, "rgba(0, 255, 136, 0.08)");
  vg.addColorStop(1, "transparent");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.shadowColor = "#00ff88";
  ctx.shadowBlur = 40;
  ctx.fillStyle = "#00ff88";
  ctx.font = `bold ${Math.min(58, W * 0.08)}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("Level Complete!", W / 2, H / 2 - 90);
  ctx.restore();

  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.min(26, W * 0.035)}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(levelData.name + "   \u00B7   \u25C6 " + runCoins() + "/3", W / 2, H / 2 - 50);

  // Stats in boxes
  const stats = [
    { label: "Attempts", val: "" + attemptNum },
    { label: "Deaths", val: "" + deathNum },
    { label: "Time", val: levelFinishTime.toFixed(1) + "s" },
  ];
  const statW = 110, gap = 18, totalW = stats.length * statW + (stats.length - 1) * gap;
  const sx = W / 2 - totalW / 2;
  stats.forEach((s, i) => {
    const bx = sx + i * (statW + gap);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    rRect(bx, H / 2 - 25, statW, 60, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,255,136,0.2)";
    ctx.lineWidth = 1;
    rRect(bx, H / 2 - 25, statW, 60, 8);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(s.label, bx + statW / 2, H / 2 - 5);
    ctx.fillStyle = "#fff";
    ctx.font = 'bold 22px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(s.val, bx + statW / 2, H / 2 + 25);
  });

  ctx.fillStyle = "#fff";
  ctx.font = 'bold 17px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("Click or Space to continue", W / 2, H / 2 + 80);
}

// -------------------- Menu --------------------
let menuBtns = [];

function rRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function colorAlpha(c, a) {
  if (c.startsWith("#")) {
    let hex = c.slice(1);
    if (hex.length === 3) hex = hex.split("").map((ch) => ch + ch).join("");
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r},${g},${b},${a})`;
    }
  }
  if (c.startsWith("hsl(")) return c.replace("hsl(", "hsla(").replace(")", `, ${a})`);
  return c;
}

function levelMenuLayout() {
  const top = H * 0.18;
  const step = 74;
  const backY = H - 52;
  const visibleCount = Math.max(1, Math.floor((backY - 14 - top) / step));
  const totalCount = levels.length + editorLevels.length;
  const maxScroll = Math.max(0, totalCount - visibleCount);
  levelMenuScroll = Math.max(0, Math.min(maxScroll, levelMenuScroll));
  return { top, step, rowHeight: step - 8, visibleCount, totalCount, maxScroll, backY };
}

function ensureLevelMenuSelectionVisible() {
  const layout = levelMenuLayout();
  if (menuSel < levelMenuScroll) levelMenuScroll = menuSel;
  else if (menuSel < layout.totalCount && menuSel >= levelMenuScroll + layout.visibleCount) {
    levelMenuScroll = menuSel - layout.visibleCount + 1;
  }
  levelMenuScroll = Math.max(0, Math.min(layout.maxScroll, levelMenuScroll));
}

function selectMenuLevel(idx) {
  if (idx < levels.length) startLevel(idx);
  else startSavedLevel(idx - levels.length);
}

function drawMenu() {
  // Clean dark background
  ctx.fillStyle = "#0b0b14";
  ctx.fillRect(0, 0, W, H);

  // Animated subtle grid with slight parallax
  const t = now() * 0.00008;
  ctx.strokeStyle = "rgba(60, 60, 120, 0.06)";
  ctx.lineWidth = 1;
  const gs = 70;
  const ox = (t * 400) % gs;
  for (let gx = -gs + ox; gx < W + gs; gx += gs) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, H);
    ctx.stroke();
  }
  for (let gy = 0; gy < H; gy += gs) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(W, gy);
    ctx.stroke();
  }

  // Floating ambient particles
  ctx.save();
  for (let i = 0; i < 25; i++) {
    const px = ((Math.sin(t * 800 + i * 7.3) + 1) / 2) * W;
    const py = ((Math.cos(t * 600 + i * 4.1) + 1) / 2) * H;
    const r = 1 + Math.sin(t * 1200 + i) * 0.8;
    ctx.globalAlpha = 0.08 + Math.sin(t * 900 + i * 2) * 0.04;
    ctx.fillStyle = `hsl(${(i * 47 + t * 3000) % 360}, 60%, 60%)`;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  menuBtns = [];

  if (menuScreen === "main") {
    const compact = H < 420;
    // Title with double glow
    ctx.save();
    ctx.shadowColor = "#00ff88";
    ctx.shadowBlur = 45;
    ctx.fillStyle = "#fff";
    const titleSize = Math.min(68, W * 0.085, compact ? H * 0.08 : 68);
    ctx.font = `bold ${titleSize}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("NEON DASH", W / 2, compact ? H * 0.1 : H * 0.2, W * 0.94);
    ctx.restore();

    // Subtitle with accent
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = `${Math.min(16, W * 0.02)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(
      "An original neon rhythm game  \u00B7  " + playerName,
      W / 2,
      compact ? H * 0.2 : H * 0.2 + 36,
      W * 0.8
    );

    // Decorative line
    const lineW = Math.min(240, W * 0.3);
    if (!compact) {
      ctx.save();
      ctx.strokeStyle = "rgba(0, 255, 136, 0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(W / 2 - lineW / 2, H * 0.2 + 50);
      ctx.lineTo(W / 2 + lineW / 2, H * 0.2 + 50);
      ctx.stroke();
      ctx.restore();
    }

    const bw = Math.min(280, W * 0.4);
    const bx = W / 2 - bw / 2;
    const items = [
      { label: "\u25B6  Play", col: "#00ff88" },
      { label: "\u270E  Editor", col: "#44ddff" },
      {
        label: "Practice: " + (practiceMode ? "ON" : "OFF"),
        col: practiceMode ? "#ffaa00" : "#555",
      },
      {
        label: "Sound: " + (muted ? "OFF" : "ON"),
        col: muted ? "#ff4444" : "#555",
      },
      { label: "\u2699  Settings", col: "#aa88ff" },
      { label: "\u2709  Get Updates", col: "#ffd43b" },
    ];
    const bh = compact
      ? Math.min(38, Math.max(30, H * 0.09))
      : Math.min(54, Math.max(40, (H * 0.46) / items.length));
    const gap = bh + (compact ? 4 : 8);
    const top = compact
      ? Math.min(H * 0.29, H - 24 - items.length * gap)
      : Math.min(H * 0.34, H - 28 - items.length * gap);
    items.forEach((it, i) => {
      const by = top + i * gap;
      const hov = menuSel === i;
      ctx.save();
      if (hov) {
        ctx.shadowColor = it.col;
        ctx.shadowBlur = 18;
      }
      // Button fill with gradient on hover
      if (hov) {
        const grd = ctx.createLinearGradient(bx, by, bx + bw, by);
        grd.addColorStop(0, it.col);
        grd.addColorStop(1, colorAlpha(it.col, 0.8));
        ctx.fillStyle = grd;
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.04)";
      }
      ctx.strokeStyle = it.col;
      ctx.lineWidth = hov ? 2.5 : 1.5;
      rRect(bx, by, bw, bh, 12);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = hov ? "#000" : "#fff";
      ctx.font = `bold ${Math.min(20, W * 0.028)}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(it.label, W / 2, by + bh * 0.64);
      menuBtns.push({ x: bx, y: by, w: bw, h: bh, act: i });
    });

    // Controls footer
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.font = `${Math.min(13, W * 0.016)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(
      "Space / Click to jump  \u00B7  P pause  \u00B7  Esc menu  \u00B7  M mute  \u00B7  F fullscreen",
      W / 2,
      H - 22
    );
  } else if (menuScreen === "levels") {
    // Level select — title
    ctx.save();
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 15;
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.min(42, W * 0.055)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("Select Level", W / 2, H * 0.11);
    ctx.restore();

    const layout = levelMenuLayout();
    const bw = Math.min(360, W * 0.5);
    const bx = W / 2 - bw / 2;
    const end = Math.min(layout.totalCount, levelMenuScroll + layout.visibleCount);
    for (let i = levelMenuScroll; i < end; i++) {
      const isCustom = i >= levels.length;
      const customIndex = i - levels.length;
      const lv = isCustom ? editorLevels[customIndex] : levels[i];
      if (!lv) continue;
      const progressKey = isCustom ? "c" + customIndex : i;
      const by = layout.top + (i - levelMenuScroll) * layout.step;
      const bh = layout.rowHeight;
      const hov = menuSel === i;
      const best = bestProg[progressKey] || 0;
      const col = best >= 100 ? "#00ff88" : isCustom ? "#44ddff" : `hsl(${lv.hue}, 70%, 50%)`;
      ctx.save();
      if (hov) {
        ctx.shadowColor = col;
        ctx.shadowBlur = 18;
      }
      if (hov) {
        const grd = ctx.createLinearGradient(bx, by, bx + bw, by);
        grd.addColorStop(0, col);
        grd.addColorStop(1, colorAlpha(col, 0.7));
        ctx.fillStyle = grd;
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.04)";
      }
      ctx.strokeStyle = col;
      ctx.lineWidth = hov ? 2.5 : 1.5;
      rRect(bx, by, bw, bh, 12);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Level name
      ctx.fillStyle = hov ? "#000" : "#fff";
      ctx.font = `bold ${Math.min(22, W * 0.03)}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(lv.name, W / 2, by + 25, bw - 28);

      const detail = isCustom ? "Custom" : ["Easy", "Medium", "Hard"][i];
      ctx.font = `${Math.min(14, W * 0.018)}px "Segoe UI", system-ui, sans-serif`;
      ctx.fillStyle = hov ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.45)";
      ctx.fillText(
        `${detail}  \u00B7  Best ${best}%${best >= 100 ? " \u2605" : ""}  \u00B7  ${totalCoins(progressKey)}/3 \u25C6`,
        W / 2,
        by + 46
      );

      const pbW = bw * 0.6, pbH = 3, pbX = W / 2 - pbW / 2, pbY = by + 55;
      ctx.fillStyle = hov ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.06)";
      ctx.fillRect(pbX, pbY, pbW, pbH);
      if (best > 0) {
        ctx.fillStyle = hov ? "rgba(255,255,255,0.9)" : col;
        ctx.fillRect(pbX, pbY, pbW * (best / 100), pbH);
      }

      menuBtns.push({ x: bx, y: by, w: bw, h: bh, act: 10 + i });
    }

    if (layout.totalCount > layout.visibleCount) {
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.font = '12px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("Scroll to see more levels", W / 2, H * 0.11 + 25);
    }

    // Back button
    const backBw = Math.min(200, W * 0.28);
    const backBx = W / 2 - backBw / 2;
    const backY = layout.backY;
    const bhBack = 42;
    const hov = menuSel === layout.totalCount;
    ctx.save();
    if (hov) {
      ctx.shadowColor = "#ff4444";
      ctx.shadowBlur = 14;
    }
    ctx.fillStyle = hov ? "#ff4444" : "rgba(255,255,255,0.04)";
    ctx.strokeStyle = "#ff4444";
    ctx.lineWidth = hov ? 2.5 : 1.5;
    rRect(backBx, backY, backBw, bhBack, 12);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = hov ? "#000" : "#fff";
    ctx.font = `bold ${Math.min(18, W * 0.024)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("\u2190  Back", W / 2, backY + 28);
    menuBtns.push({ x: backBx, y: backY, w: backBw, h: bhBack, act: 99 });
  } else if (menuScreen === "settings") {
    drawSettingsMenu();
  } else {
    drawAccountMenu();
  }
}

function drawSettingsMenu() {
  const compact = H < 400;
  const rowHeight = compact ? 34 : 48;
  const actionHeight = Math.min(compact ? 34 : 42, Math.max(28, H * 0.085));
  ctx.save();
  ctx.shadowColor = "#aa88ff";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.min(42, W * 0.055)}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("Player Settings", W / 2, H * 0.11);
  ctx.restore();

  ctx.save();
  ctx.translate(W / 2, H * 0.17);
  ctx.fillStyle = playerColor;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.shadowColor = playerColor;
  ctx.shadowBlur = 14;
  if (playerSkin === "circle") {
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (playerSkin === "diamond") {
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(20, 0);
    ctx.lineTo(0, 20);
    ctx.lineTo(-20, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(-17, -17, 34, 34);
    ctx.strokeRect(-17, -17, 34, 34);
  }
  ctx.restore();

  const bw = Math.min(420, W * 0.78);
  const bx = W / 2 - bw / 2;
  const buttons = [
    { id: 0, label: "Username: " + playerName, y: H * 0.23 },
    {
      id: 1,
      label: "Appearance: " + PLAYER_SKINS.find((skin) => skin.id === playerSkin).label,
      y: H * 0.36,
    },
  ];
  buttons.forEach((button) => {
    const hov = menuSel === button.id;
    ctx.fillStyle = hov ? "rgba(170,136,255,0.22)" : "rgba(255,255,255,0.04)";
    ctx.strokeStyle = hov ? "#aa88ff" : "rgba(255,255,255,0.22)";
    ctx.lineWidth = hov ? 2 : 1;
    rRect(bx, button.y, bw, rowHeight, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${compact ? 13 : 16}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(button.label, W / 2, button.y + rowHeight * 0.64, bw - 24);
    menuBtns.push({ x: bx, y: button.y, w: bw, h: rowHeight, act: button.id });
  });

  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = '14px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("Choose a color  \u00B7  " + playerColor, W / 2, H * 0.48);

  const gap = 9;
  const swatchSize = Math.min(
    48,
    H * 0.1,
    (W - 40 - gap * (PLAYER_COLORS.length - 1)) / PLAYER_COLORS.length
  );
  const rowWidth = PLAYER_COLORS.length * swatchSize + (PLAYER_COLORS.length - 1) * gap;
  const startX = (W - rowWidth) / 2;
  const swatchY = H * 0.52;
  PLAYER_COLORS.forEach((color, i) => {
    const x = startX + i * (swatchSize + gap);
    const selected = playerColor === color.value;
    const hov = menuSel === i + 2;
    ctx.fillStyle = color.value;
    ctx.strokeStyle = selected || hov ? "#fff" : "rgba(255,255,255,0.35)";
    ctx.lineWidth = selected || hov ? 3 : 1;
    rRect(x, swatchY, swatchSize, swatchSize, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = '10px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(color.label, x + swatchSize / 2, swatchY + swatchSize + 14);
    menuBtns.push({ x, y: swatchY, w: swatchSize, h: swatchSize, act: i + 2 });
  });

  const controlY = H * 0.68;
  const controlGap = 6;
  const controlWidth = (bw - controlGap * 2) / 3;
  const controls = [
    { id: 8, label: "Ghost: " + (ghostReplayVisible ? "ON" : "OFF"), color: "#44ddff" },
    { id: 9, label: "Music: " + Math.round(musicVolume * 100) + "%", color: "#aa88ff" },
    { id: 10, label: "SFX: " + Math.round(sfxVolume * 100) + "%", color: "#ffd43b" },
  ];
  controls.forEach((control, index) => {
    const x = bx + index * (controlWidth + controlGap);
    const selected = menuSel === control.id;
    ctx.fillStyle = selected ? colorAlpha(control.color, 0.24) : "rgba(255,255,255,0.04)";
    ctx.strokeStyle = control.color;
    ctx.lineWidth = selected ? 2 : 1;
    rRect(x, controlY, controlWidth, actionHeight, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${compact || W < 420 ? 10 : 12}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(
      control.label,
      x + controlWidth / 2,
      controlY + actionHeight * 0.64,
      controlWidth - 6
    );
    menuBtns.push({ x, y: controlY, w: controlWidth, h: actionHeight, act: control.id });
  });

  const actionWidth = Math.min(190, (bw - 10) / 2);
  const actionY = Math.max(H * 0.77, controlY + actionHeight + 4);
  const custom = {
    x: W / 2 - actionWidth - 5,
    y: actionY,
    w: actionWidth,
    h: actionHeight,
    act: 11,
  };
  ctx.fillStyle = menuSel === custom.act ? "rgba(170,136,255,0.22)" : "rgba(255,255,255,0.04)";
  ctx.strokeStyle = "#aa88ff";
  ctx.lineWidth = menuSel === custom.act ? 2 : 1;
  rRect(custom.x, custom.y, custom.w, custom.h, 9);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${compact ? 12 : 14}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText("Custom color", custom.x + custom.w / 2, custom.y + custom.h * 0.65);
  menuBtns.push(custom);

  const account = {
    x: W / 2 + 5,
    y: actionY,
    w: actionWidth,
    h: actionHeight,
    act: 12,
  };
  ctx.fillStyle = menuSel === account.act ? "rgba(255,212,59,0.24)" : "rgba(255,255,255,0.04)";
  ctx.strokeStyle = "#ffd43b";
  ctx.lineWidth = menuSel === account.act ? 2 : 1;
  rRect(account.x, account.y, account.w, account.h, 9);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${compact ? 12 : 14}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText("Account", W / 2 + actionWidth / 2 + 5, account.y + account.h * 0.65);
  menuBtns.push(account);

  const backY = Math.max(H * 0.89, actionY + actionHeight + 8);
  const back = { x: W / 2 - 100, y: backY, w: 200, h: actionHeight, act: 13 };
  ctx.fillStyle = menuSel === back.act ? "#aa88ff" : "rgba(255,255,255,0.04)";
  ctx.strokeStyle = "#aa88ff";
  ctx.lineWidth = menuSel === back.act ? 2 : 1;
  rRect(back.x, back.y, back.w, back.h, 9);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = menuSel === back.act ? "#101018" : "#fff";
  ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
  ctx.font = `bold ${compact ? 12 : 14}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText("\u2190  Back", W / 2, back.y + back.h * 0.65);
  menuBtns.push(back);

  if (settingsMessageT > 0) {
    settingsMessageT--;
    if (H >= 560) {
      ctx.fillStyle = settingsMessage.includes("couldn't") ? "#ff8c8c" : "#78ffb4";
      ctx.font = '13px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(settingsMessage, W / 2, H * 0.87);
    }
  }
  ctx.restore();
}

function drawAccountMenu() {
  const compact = H < 400;
  const rowHeight = Math.min(44, Math.max(28, H * 0.1));
  const gap = rowHeight + (compact ? 3 : 8);
  const bw = Math.min(420, W * 0.78);
  const bx = W / 2 - bw / 2;
  const actions = [
    { label: "Email sign up", color: "#44ddff" },
    { label: "Email sign in", color: "#44ddff" },
    { label: "Continue with Google", color: "#777777", comingSoon: true },
    { label: "Continue with Discord", color: "#5865F2" },
  ];
  if (discordState === "ready") {
    actions.push({ label: "Discord invite", color: "#5865F2" });
  }
  actions.push(
    { label: "Sign out", color: "#ff6b6b" },
    { label: "\u2190  Back", color: "#aa88ff" }
  );
  const top = Math.min(H * 0.32, H - actions.length * gap - 12);

  ctx.save();
  ctx.shadowColor = "#ffd43b";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.min(42, W * 0.055)}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("Account", W / 2, H * 0.1);
  ctx.restore();

  const identityEmail = authUser && (authUser.email || (authUser.user_metadata && authUser.user_metadata.full_name));
  const identity = authUser ? `Signed in: ${identityEmail || "account"}` : "Not signed in";
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = `${compact ? 12 : 14}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(identity, W / 2, H * 0.19, W * 0.9);
  ctx.fillStyle = "rgba(255,255,255,0.58)";
  ctx.font = `${compact ? 11 : 13}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(accountMessage, W / 2, H * 0.245, W * 0.92);

  actions.forEach((action, index) => {
    const y = top + index * gap;
    const selected = menuSel === index;
    ctx.fillStyle = selected ? colorAlpha(action.color, 0.24) : "rgba(255,255,255,0.04)";
    ctx.strokeStyle = action.color;
    ctx.lineWidth = selected ? 2 : 1;
    rRect(bx, y, bw, rowHeight, 9);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = action.comingSoon ? "rgba(255,255,255,0.5)" : "#fff";
    ctx.font = `bold ${compact ? 13 : 16}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillText(action.label, W / 2, y + rowHeight * 0.65, bw - 24);
    menuBtns.push({ x: bx, y, w: bw, h: rowHeight, act: index });
  });
}

function menuAction() {
  if (menuScreen === "main") {
    if (menuSel === 0) {
      menuScreen = "levels";
      menuSel = 0;
      levelMenuScroll = 0;
    } else if (menuSel === 1) openEditor();
    else if (menuSel === 2) practiceMode = !practiceMode;
    else if (menuSel === 3) muted = !muted;
    else if (menuSel === 4) {
      menuScreen = "settings";
      menuSel = 0;
      settingsMessage = "";
    } else if (menuSel === 5) window.location.href = "updates.html";
  } else if (menuScreen === "settings") {
    if (menuSel === 0) changePlayerName();
    else if (menuSel === 1) {
      const current = PLAYER_SKINS.findIndex((skin) => skin.id === playerSkin);
      playerSkin = PLAYER_SKINS[(current + 1) % PLAYER_SKINS.length].id;
      showSettingsMessage("Appearance updated", savePlayerProfile());
    } else if (menuSel >= 2 && menuSel < 2 + PLAYER_COLORS.length) {
      changePlayerColor(PLAYER_COLORS[menuSel - 2].value);
    } else if (menuSel === 8) {
      ghostReplayVisible = !ghostReplayVisible;
      showSettingsMessage(
        "Ghost replay " + (ghostReplayVisible ? "shown" : "hidden"),
        saveGameSettings()
      );
    } else if (menuSel === 9) {
      const current = AUDIO_VOLUME_STEPS.indexOf(musicVolume);
      musicVolume = AUDIO_VOLUME_STEPS[(current + 1) % AUDIO_VOLUME_STEPS.length];
      showSettingsMessage(
        "Music volume: " + Math.round(musicVolume * 100) + "%",
        saveGameSettings()
      );
    } else if (menuSel === 10) {
      const current = AUDIO_VOLUME_STEPS.indexOf(sfxVolume);
      sfxVolume = AUDIO_VOLUME_STEPS[(current + 1) % AUDIO_VOLUME_STEPS.length];
      showSettingsMessage(
        "SFX volume: " + Math.round(sfxVolume * 100) + "%",
        saveGameSettings()
      );
    } else if (menuSel === 11) {
      const color = window.prompt("Enter a hex color (#RRGGBB):", playerColor);
      if (color !== null) {
        const trimmedColor = color.trim();
        if (/^#[0-9a-f]{6}$/i.test(trimmedColor)) {
          changePlayerColor(trimmedColor.toUpperCase());
        } else {
          showSettingsMessage("Use a hex color like #12ABEF", true);
        }
      }
    } else if (menuSel === 12) {
      menuScreen = "account";
      menuSel = 0;
    } else if (menuSel === 13) {
      menuScreen = "main";
      menuSel = 0;
    }
  } else if (menuScreen === "account") {
    const inviteOffset = discordState === "ready" ? 1 : 0;
    if (menuSel === 0) openEmailAuth("signup");
    else if (menuSel === 1) openEmailAuth("signin");
    else if (menuSel === 2) window.alert("Google sign-in is coming soon!");
    else if (menuSel === 3) signInWithDiscord();
    else if (menuSel === 4 && inviteOffset) discordInvite();
    else if (menuSel === 4 + inviteOffset) signOutFromAccount();
    else if (menuSel === 5 + inviteOffset) {
      menuScreen = "settings";
      menuSel = 12;
    }
  } else {
    const count = levels.length + editorLevels.length;
    if (menuSel < count) selectMenuLevel(menuSel);
    else {
      menuScreen = "main";
      menuSel = 0;
      levelMenuScroll = 0;
    }
  }
}

function menuClickAt(mx, my) {
  for (const b of menuBtns) {
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
      if (menuScreen === "main" && b.act < 6) {
        menuSel = b.act;
        menuAction();
      } else if (menuScreen === "settings" || menuScreen === "account") {
        menuSel = b.act;
        menuAction();
      } else if (b.act >= 10 && b.act < 10 + levels.length + editorLevels.length)
        selectMenuLevel(b.act - 10);
      else if (b.act === 99) {
        menuScreen = "main";
        menuSel = 0;
        levelMenuScroll = 0;
      }
      return;
    }
  }
}

// -------------------- Text State + Time Stepping --------------------
function renderGameToText() {
  const viewMin = cameraX - 200;
  const viewMax = cameraX + W + 200;
  const obs =
    levelData && levelData.obs
      ? levelData.obs
          .filter((o) => o.type !== "deco" && o.x <= viewMax && (o.x + (o.w || o.r || 40)) >= viewMin)
          .map((o) => {
            if (o.type === "mover") {
              const my = o.y + Math.sin(now() * o.ms) * o.my;
              return { type: o.type, x: Math.round(o.x), y: Math.round(my), w: o.w, h: o.h };
            }
            if (o.type === "spike")
              return { type: o.type, x: Math.round(o.x), y: Math.round(o.surfY || groundY), w: SPIKE_W, h: SPIKE_H };
            if (o.type === "spikeD")
              return { type: o.type, x: Math.round(o.x), y: Math.round(o.surfY || CEIL_Y), w: SPIKE_W, h: SPIKE_H };
            if (o.type === "gap") return { type: o.type, x: Math.round(o.x), w: o.w };
            if (o.type === "speedP") return { type: o.type, x: Math.round(o.x), speed: o.spd };
            if (o.type === "shipP" || o.type === "cubeP")
              return { type: o.type, x: Math.round(o.x) };
            if (o.type === "pad") return { type: o.type, x: Math.round(o.x) };
            if (o.type === "orb") return { type: o.type, x: Math.round(o.x), y: Math.round(o.y) };
            if (o.type === "finish") return { type: o.type, x: Math.round(o.x) };
            return {
              type: o.type,
              x: Math.round(o.x),
              y: Math.round(o.y || 0),
              w: o.w,
              h: o.h,
            };
          })
      : [];

  const payload = {
    coordinate_system: { origin: "top-left", x: "right", y: "down" },
    state: gameState,
    menu: gameState === "menu" ? menuScreen : null,
    level: levelData ? levelData.name : null,
    progress: levelData ? getProgress() : 0,
    attempt: attemptNum,
    deaths: deathNum,
    practice: practiceMode,
    player: {
      x: Math.round(P.x),
      y: Math.round(P.y),
      vy: Math.round(P.vy * 100) / 100,
      mode: P.isShip ? "ship" : "cube",
      grounded: P.grounded,
      speed: Math.round(P.speed * 100) / 100,
      size: Math.round(playerSize() * 100) / 100,
      gravityScale: P.gravityScale,
      extraJumps: P.extraJumps,
      sizeFrames: P.sizeFrames,
      gravityFrames: P.gravityFrames,
      slowTimeFrames: P.slowTimeFrames,
      momentumFrames: P.momentumFrames,
    },
    obstacles: obs,
  };
  return JSON.stringify(payload);
}
window.render_game_to_text = renderGameToText;

let simInitialized = false;
window.advanceTime = (ms) => {
  if (!simInitialized) {
    simTime = performance.now();
    simInitialized = true;
  }
  useSimTime = true;
  const steps = Math.max(1, Math.round(ms / FRAME_MS));
  for (let i = 0; i < steps; i++) {
    simTime += FRAME_MS;
    simulateFrame();
    frame();
  }
  useSimTime = false;
};

// -------------------- Level editor --------------------
const ED_GRID = 30;
const ED_TOOLS = [
  { id: "spike", label: "Spike", col: "#66ccff" },
  { id: "spikeD", label: "Ceil", col: "#88aaff" },
  { id: "block", label: "Block", col: "#9aa4ff" },
  { id: "saw", label: "Saw", col: "#ff4466" },
  { id: "pad", label: "Pad", col: "#ffdd44" },
  { id: "orb", label: "Orb", col: "#cc66ff" },
  { id: "coin", label: "Coin", col: "#ffd84a" },
  { id: "gap", label: "Gap", col: "#ffffff" },
  { id: "fast", label: "Fast", col: "#ff8800" },
  { id: "shipP", label: "Ship", col: "#00ffcc" },
  { id: "cubeP", label: "Cube", col: "#ffcc44" },
  { id: "sizeSmallP", label: "Small", col: "#44ddff" },
  { id: "sizeBigP", label: "Big", col: "#ff66dd" },
  { id: "bounceP", label: "Bounce", col: "#ffbb44" },
  { id: "lowGravP", label: "Low G", col: "#66ffbb" },
  { id: "highGravP", label: "High G", col: "#ff6655" },
  { id: "doubleJumpP", label: "Double", col: "#cc88ff" },
  { id: "slowTimeP", label: "Slow", col: "#66aaff" },
  { id: "momentumP", label: "Momentum", col: "#ff9966" },
  { id: "finish", label: "End", col: "#ffffff" },
  { id: "erase", label: "Erase", col: "#ff4455" },
];

let edObjs = [];
let edName = "Untitled";
let edSlot = null;
let edTool = "spike";
let editorLevels = [];
let edUndoStack = [];
let edPainting = false;
let edPaintErase = false;
let edMsg = "";
let edMsgT = 0;
let edCam = 0;
const editorMouse = { x: 0, y: 0 };

try {
  editorLevels = JSON.parse(localStorage.getItem("gd_editor") || "[]");
  const draft = JSON.parse(localStorage.getItem("gd_editor_draft") || "null");
  if (draft && Array.isArray(draft.objs)) {
    edObjs = draft.objs;
    edName = draft.name || "Untitled";
    edSlot = draft.slot == null ? null : draft.slot;
  }
} catch (e) {}

function persistEditorStore() {
  try {
    localStorage.setItem("gd_editor", JSON.stringify(editorLevels));
    localStorage.setItem(
      "gd_editor_draft",
      JSON.stringify({ name: edName, objs: edObjs, slot: edSlot })
    );
    return true;
  } catch (e) {}
  return false;
}

function edGroundTool(id) {
  return (
    id === "pad" ||
    id === "gap" ||
    id === "fast" ||
    id === "shipP" ||
    id === "cubeP" ||
    id === "sizeSmallP" ||
    id === "sizeBigP" ||
    id === "bounceP" ||
    id === "lowGravP" ||
    id === "highGravP" ||
    id === "doubleJumpP" ||
    id === "slowTimeP" ||
    id === "momentumP" ||
    id === "finish" ||
    id === "spikeD"
  );
}

function compileEditor(objs, name) {
  const o = [];
  let maxX = 700;
  let coinId = 0;
  for (const e of objs || []) {
    const x = e.gx * ED_GRID;
    maxX = Math.max(maxX, x + ED_GRID * 4);
    if (e.type === "spike") {
      const s = { type: "spike", x };
      if (e.gy > 0) s.surfY = groundY - e.gy * ED_GRID;
      o.push(s);
    } else if (e.type === "spikeD") {
      o.push({ type: "spikeD", x, surfY: CEIL_Y });
    } else if (e.type === "block") {
      o.push({
        type: "block",
        x,
        y: groundY - (e.gy + 1) * ED_GRID,
        w: ED_GRID,
        h: ED_GRID,
      });
    } else if (e.type === "saw") {
      o.push({
        type: "saw",
        x: x + ED_GRID / 2,
        y: groundY - (e.gy + 0.5) * ED_GRID,
        r: 15,
      });
    } else if (e.type === "pad") o.push({ type: "pad", x });
    else if (e.type === "orb") {
      o.push({
        type: "orb",
        x: x + ED_GRID / 2,
        y: groundY - (Math.max(1, e.gy) + 0.5) * ED_GRID,
      });
    } else if (e.type === "coin") {
      o.push({
        type: "coin",
        id: coinId++,
        x: x + ED_GRID / 2,
        y: groundY - (Math.max(1, e.gy) + 0.5) * ED_GRID,
      });
    } else if (e.type === "gap") o.push({ type: "gap", x, w: ED_GRID * 4 });
    else if (e.type === "fast") o.push({ type: "speedP", x, spd: "fast" });
    else if (e.type === "shipP") o.push({ type: "shipP", x });
    else if (e.type === "cubeP") o.push({ type: "cubeP", x });
    else if (
      e.type === "sizeSmallP" ||
      e.type === "sizeBigP" ||
      e.type === "bounceP" ||
      e.type === "lowGravP" ||
      e.type === "highGravP" ||
      e.type === "doubleJumpP" ||
      e.type === "slowTimeP" ||
      e.type === "momentumP"
    ) {
      o.push({ type: e.type, x });
    } else if (e.type === "finish") o.push({ type: "finish", x });
  }
  return {
    name: name || "Untitled",
    hue: 165,
    obs: o,
    len: maxX + 500,
    coins: Math.min(3, coinId),
    custom: true,
  };
}

function editorCell(mx, my) {
  const gx = Math.floor((mx + cameraX) / ED_GRID);
  let gy = Math.floor((groundY - my) / ED_GRID);
  if (gy < 0) gy = 0;
  const maxGy = Math.max(1, Math.floor((groundY - CEIL_Y) / ED_GRID) - 1);
  if (gy > maxGy) gy = maxGy;
  return { gx: Math.max(0, gx), gy };
}

function edSame(a, b) {
  if (a.type !== b.type || a.gx !== b.gx) return false;
  if (edGroundTool(a.type)) return true;
  return (a.gy || 0) === (b.gy || 0);
}

function edStrokeStart() {
  edUndoStack.push(JSON.stringify(edObjs));
  if (edUndoStack.length > 60) edUndoStack.shift();
}

function edUndo() {
  const prev = edUndoStack.pop();
  if (!prev) return;
  edObjs = JSON.parse(prev);
  persistEditorStore();
  edMsg = "Undo";
  edMsgT = 50;
}

function editorApply(mx, my, erase) {
  if (my > H - editorBarH() || my < editorTopH()) return;
  const cell = editorCell(mx, my);
  if (erase || edTool === "erase") {
    const gx = cell.gx;
    const gy = cell.gy;
    edObjs = edObjs.filter((e) => {
      if (e.type === "gap") return !(gy === 0 && gx >= e.gx && gx < e.gx + 4);
      if (edGroundTool(e.type)) return e.gx !== gx;
      return !(e.gx === gx && (e.gy || 0) === gy);
    });
  } else {
    const obj = { type: edTool, gx: cell.gx, gy: edGroundTool(edTool) ? 0 : cell.gy };
    if (edTool === "orb" || edTool === "coin") obj.gy = Math.max(1, cell.gy);
    if (!edObjs.some((e) => edSame(e, obj))) edObjs.push(obj);
  }
  persistEditorStore();
}

function editorDown(e) {
  const x = e.clientX;
  const y = e.clientY;
  editorMouse.x = x;
  editorMouse.y = y;
  if (y >= H - editorBarH()) {
    pickEditorTool(x, y);
    return;
  }
  if (y < editorTopH()) {
    editorTopClick(x, y);
    return;
  }
  edPainting = true;
  edPaintErase = e.button === 2;
  edStrokeStart();
  editorApply(x, y, edPaintErase);
}

function openEditor() {
  editorTesting = false;
  edPainting = false;
  gameState = "editor";
  stopMusic();
  cameraX = Math.max(0, cameraX);
  edMsg = "";
}

function returnToEditor() {
  finishGhostRun(false);
  editorTesting = false;
  edPainting = false;
  gameState = "editor";
  stopMusic();
  particles = [];
  cameraX = edCam;
  P.dead = false;
  P.done = false;
}

function playEditor() {
  edCam = cameraX;
  editorTesting = true;
  initAudio();
  currentLevelIdx = "c" + (edSlot == null ? "d" : edSlot);
  levelData = compileEditor(edObjs, edName);
  deathNum = 0;
  attemptNum = (totalAttempts[currentLevelIdx] || 0) + 1;
  totalAttempts[currentLevelIdx] = attemptNum;
  levelTimer = now();
  levelFinishTime = 0;
  resetPlayer(false);
  beginGhostRun();
  gameState = "playing";
  startMusic();
  showAttemptFlash();
}

function startSavedLevel(idx) {
  const saved = editorLevels[idx];
  if (!saved) return;
  initAudio();
  editorTesting = false;
  currentLevelIdx = "c" + idx;
  levelData = compileEditor(saved.objs, saved.name);
  deathNum = 0;
  attemptNum = (totalAttempts[currentLevelIdx] || 0) + 1;
  totalAttempts[currentLevelIdx] = attemptNum;
  levelTimer = now();
  levelFinishTime = 0;
  resetPlayer(false);
  beginGhostRun();
  gameState = "playing";
  startMusic();
  showAttemptFlash();
}

function saveEditor() {
  const data = { name: edName, objs: edObjs };
  if (edSlot == null || !editorLevels[edSlot]) {
    if (edName === "Untitled") edName = "My Level " + (editorLevels.length + 1);
    data.name = edName;
    editorLevels.push(data);
    edSlot = editorLevels.length - 1;
  } else {
    data.name = edName;
    editorLevels[edSlot] = data;
  }
  const saved = persistEditorStore();
  if (saved) {
    clearGhostForLevel("c" + edSlot);
    queueCloudSave();
  }
  edMsg = saved ? "Saved" : "Save failed - storage unavailable";
  edMsgT = 70;
}

function exportEditorFile() {
  const safeName = (edName || "custom-level")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "custom-level";
  const fileData = {
    format: "neon-dash-custom-level",
    version: 1,
    name: edName.trim().slice(0, 40) || "Untitled",
    objs: edObjs,
  };
  const blob = new Blob([JSON.stringify(fileData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeName}.ndcl`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  edMsg = "Downloaded " + link.download;
  edMsgT = 70;
}

function importEditorFileContents(contents) {
  let fileData;
  try {
    fileData = JSON.parse(contents);
  } catch (error) {
    edMsg = "Invalid level file: not valid JSON";
    edMsgT = 70;
    return;
  }
  if (
    !fileData ||
    fileData.format !== "neon-dash-custom-level" ||
    fileData.version !== 1 ||
    typeof fileData.name !== "string" ||
    !fileData.name.trim() ||
    !Array.isArray(fileData.objs) ||
    fileData.objs.length > 10000
  ) {
    edMsg = "Invalid or unsupported .ndcl file";
    edMsgT = 70;
    return;
  }

  const validTypes = new Set(ED_TOOLS.filter((tool) => tool.id !== "erase").map((tool) => tool.id));
  const importedObjects = [];
  for (const object of fileData.objs) {
    if (
      !object ||
      !validTypes.has(object.type) ||
      !Number.isSafeInteger(object.gx) ||
      object.gx < 0 ||
      object.gx > 50000 ||
      !Number.isSafeInteger(object.gy) ||
      object.gy < 0 ||
      object.gy > 100
    ) {
      edMsg = "Invalid object data in .ndcl file";
      edMsgT = 70;
      return;
    }
    importedObjects.push({
      type: object.type,
      gx: object.gx,
      gy: object.gy,
    });
  }

  if ((edObjs.length || edName !== "Untitled" || edSlot !== null) &&
      !window.confirm("Importing replaces the current editor level. Continue?")) {
    return;
  }

  edObjs = importedObjects;
  edName = fileData.name.trim().slice(0, 40);
  edSlot = null;
  edUndoStack = [];
  cameraX = 0;
  const saved = persistEditorStore();
  edMsg = saved ? "Imported " + edName : "Imported, but could not save locally";
  edMsgT = 70;
}

function handleEditorFileSelection(event) {
  const input = event.currentTarget;
  const file = input.files && input.files[0];
  input.value = "";
  if (!file) return;
  if (file.size > 1024 * 1024) {
    edMsg = "Level file is too large (1 MB max)";
    edMsgT = 70;
    return;
  }
  file.text()
    .then(importEditorFileContents)
    .catch((error) => {
      edMsg = "Could not read level file: " + error.message;
      edMsgT = 70;
    });
}

function initializeEditorFileTransfer() {
  const input = document.getElementById("level-file-input");
  if (input) input.addEventListener("change", handleEditorFileSelection);
}

function renameEditorLevel() {
  const name = window.prompt("Level name:", edName);
  if (name === null) return;
  const trimmedName = name.trim();
  if (!trimmedName) {
    edMsg = "Name cannot be empty";
    edMsgT = 70;
    return;
  }
  edName = trimmedName.slice(0, 40);
  if (edSlot != null && editorLevels[edSlot]) {
    editorLevels[edSlot].name = edName;
  }
  const saved = persistEditorStore();
  if (saved && edSlot != null) queueCloudSave();
  edMsg = saved
    ? "Name updated"
    : "Name changed, but storage is unavailable";
  edMsgT = 70;
}

function newEditorLevel() {
  edStrokeStart();
  edObjs = [];
  edSlot = null;
  edName = "Untitled";
  cameraX = 0;
  persistEditorStore();
}

function loadEditorSlot(i) {
  const s = editorLevels[i];
  if (!s) return;
  edObjs = JSON.parse(JSON.stringify(s.objs || []));
  edName = s.name || "Untitled";
  edSlot = i;
  cameraX = 0;
  persistEditorStore();
  edMsg = "Loaded";
  edMsgT = 50;
}

function deleteEditorSlot(i) {
  editorLevels.splice(i, 1);
  if (edSlot === i) {
    edSlot = null;
    edName = "Untitled";
  } else if (edSlot != null && edSlot > i) edSlot--;
  if (persistEditorStore()) {
    shiftCustomGhostsAfterDelete(i);
    queueCloudSave();
  }
}

function editorBarH() {
  const g = editorToolGeom();
  return g.rows > 1 ? g.rows * (g.h + g.gap) + 12 : 52;
}
function editorTopH() {
  return editorLevels.length ? 72 : 42;
}

function editorToolGeom() {
  const n = ED_TOOLS.length;
  const gap = 4;
  const pad = 8;
  const w1 = Math.floor((W - pad * 2 - gap * (n - 1)) / n);
  if (w1 >= 46) return { cols: n, w: w1, h: 34, rows: 1, gap, pad };
  const cols = Math.max(4, Math.floor((W - pad * 2) / 52));
  const w = Math.floor((W - pad * 2 - gap * (cols - 1)) / cols);
  return { cols, w, h: 30, rows: Math.ceil(n / cols), gap, pad };
}

function pickEditorTool(mx, my) {
  const g = editorToolGeom();
  const top = H - 6 - g.rows * (g.h + g.gap);
  ED_TOOLS.forEach((tool, i) => {
    const col = i % g.cols;
    const row = Math.floor(i / g.cols);
    const x = g.pad + col * (g.w + g.gap);
    const y = top + row * (g.h + g.gap);
    if (mx >= x && mx <= x + g.w && my >= y && my <= y + g.h) edTool = tool.id;
  });
}

function editorTopClick(mx, my) {
  const buttons = editorHeaderButtons();
  for (const b of buttons) {
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
      if (b.id === "play") playEditor();
      else if (b.id === "save") saveEditor();
      else if (b.id === "export") exportEditorFile();
      else if (b.id === "import") {
        const input = document.getElementById("level-file-input");
        if (input) input.click();
      }
      else if (b.id === "new") newEditorLevel();
      else if (b.id === "exit") goToMenu();
      return;
    }
  }
  const firstButtonX = buttons.length ? buttons[0].x : W;
  if (my < 40 && mx < firstButtonX) {
    renameEditorLevel();
    return;
  }
  if (my > 40 && my < editorTopH()) {
    let x = 12;
    editorLevels.forEach((lv, i) => {
      const w = Math.min(140, 28 + lv.name.length * 7);
      if (mx >= x && mx <= x + w - 18) loadEditorSlot(i);
      else if (mx >= x + w - 18 && mx <= x + w) deleteEditorSlot(i);
      x += w + 8;
    });
  }
}

function editorHeaderButtons() {
  const labels = [
    { id: "play", label: "Play", col: "#00ff88" },
    { id: "save", label: "Save", col: "#44ddff" },
    { id: "export", label: "Export", col: "#66ddff" },
    { id: "import", label: "Import", col: "#cc88ff" },
    { id: "new", label: "New", col: "#ffcc44" },
    { id: "exit", label: "Exit", col: "#ff5566" },
  ];
  const gap = W < 500 ? 3 : 6;
  const w = Math.min(64, Math.floor((W - 12 - gap * (labels.length - 1)) / labels.length));
  const h = 26;
  const y = 8;
  return labels.map((b, i) => ({
    ...b,
    w,
    h,
    y,
    x: W - 6 - (labels.length - i) * (w + gap),
  }));
}

function drawEditorGrid() {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  const x0 = Math.floor(cameraX / ED_GRID) * ED_GRID;
  for (let x = x0; x < cameraX + W + ED_GRID; x += ED_GRID) {
    const sx = Math.round(x - cameraX) + 0.5;
    ctx.beginPath();
    ctx.moveTo(sx, CEIL_Y);
    ctx.lineTo(sx, groundY);
    ctx.stroke();
  }
  for (let y = groundY; y > CEIL_Y; y -= ED_GRID) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
    ctx.stroke();
  }
  ctx.restore();

  if (editorMouse.y > editorTopH() && editorMouse.y < H - editorBarH()) {
    const cell = editorCell(editorMouse.x, editorMouse.y);
    const sx = cell.gx * ED_GRID - cameraX;
    const sy = groundY - (cell.gy + 1) * ED_GRID;
    ctx.save();
    ctx.strokeStyle = edTool === "erase" ? "#ff4455" : "#00ffcc";
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 1, sy + 1, ED_GRID - 2, ED_GRID - 2);
    ctx.restore();
  }

  const sx = 250 - cameraX;
  if (sx > -40 && sx < W) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#ff66cc";
    ctx.fillRect(sx, groundY - PS, PS, PS);
    ctx.restore();
  }
}

function drawEditorUI() {
  ctx.save();
  ctx.fillStyle = "rgba(6,6,14,0.88)";
  ctx.fillRect(0, 0, W, editorTopH());
  ctx.fillStyle = "#fff";
  ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = "left";
  ctx.fillText(edName + "   \u270E   \u00B7   " + edObjs.length, 14, 26);

  for (const b of editorHeaderButtons()) {
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.strokeStyle = b.col;
    ctx.lineWidth = 1.5;
    rRect(b.x, b.y, b.w, b.h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = b.col;
    ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(b.label, b.x + b.w / 2, b.y + 17);
  }

  if (editorLevels.length) {
    let x = 12;
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    editorLevels.forEach((lv, i) => {
      const w = Math.min(140, 28 + lv.name.length * 7);
      ctx.fillStyle = i === edSlot ? "rgba(68,221,255,0.18)" : "rgba(255,255,255,0.05)";
      ctx.strokeStyle = i === edSlot ? "#44ddff" : "rgba(255,255,255,0.15)";
      rRect(x, 46, w, 20, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      ctx.fillText(lv.name, x + 6, 60);
      ctx.fillStyle = "#ff6677";
      ctx.textAlign = "right";
      ctx.fillText("\u00D7", x + w - 4, 60);
      x += w + 8;
    });
  }

  const g = editorToolGeom();
  const barTop = H - editorBarH();
  ctx.fillStyle = "rgba(6,6,14,0.92)";
  ctx.fillRect(0, barTop, W, editorBarH());
  const top = H - 6 - g.rows * (g.h + g.gap);
  ED_TOOLS.forEach((tool, i) => {
    const col = i % g.cols;
    const row = Math.floor(i / g.cols);
    const x = g.pad + col * (g.w + g.gap);
    const y = top + row * (g.h + g.gap);
    const on = edTool === tool.id;
    ctx.fillStyle = on ? tool.col : "rgba(255,255,255,0.04)";
    ctx.strokeStyle = tool.col;
    ctx.lineWidth = on ? 2 : 1;
    rRect(x, y, g.w, g.h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = on ? "#081018" : "#fff";
    ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(tool.label, x + g.w / 2, y + g.h * 0.68);
  });

  if (edMsgT > 0) {
    edMsgT--;
    ctx.globalAlpha = Math.min(1, edMsgT / 20);
    ctx.fillStyle = "#00ffcc";
    ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(edMsg, W / 2, barTop - 16);
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = '12px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = "left";
  ctx.fillText("Click build   \u00B7   right click erase   \u00B7   A/D pan   \u00B7   Ctrl+Z undo   \u00B7   Enter play", 12, barTop - 8);
  ctx.restore();
}

function drawEditor() {
  if (heldKeys["ArrowRight"] || heldKeys["KeyD"]) cameraX += 14;
  if (heldKeys["ArrowLeft"] || heldKeys["KeyA"]) cameraX = Math.max(0, cameraX - 14);
  levelData = compileEditor(edObjs, edName);
  drawBG();
  drawGroundAndCeil();
  drawEditorGrid();
  drawObs();
  drawEditorUI();
}

// -------------------- Main Loop --------------------
let lastFrame = null;
let frameAccumulator = 0;
const MAX_FRAME_DELTA_MS = 100;
const MAX_SIMULATION_STEPS = 5;

function simulateFrame() {
  if (gameState === "playing") update();
  if (gameState !== "menu" && gameState !== "editor") updateParticles();
  inputJustDown = false;
}

function frame() {
  // Decay screen shake
  if (shakeIntensity > 0) {
    shakeX = (Math.random() - 0.5) * shakeIntensity;
    shakeY = (Math.random() - 0.5) * shakeIntensity;
    shakeIntensity *= 0.85;
    if (shakeIntensity < 0.5) shakeIntensity = 0;
  } else {
    shakeX = 0;
    shakeY = 0;
  }

  if (gameState === "menu") {
    drawMenu();
  } else if (gameState === "editor") {
    drawEditor();
  } else {
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawBG();
    drawGroundAndCeil();
    drawObs();
    drawPlayer();
    drawParticles();
    ctx.restore();
    drawHUD();
    if (gameState === "dead") drawDeath();
    if (gameState === "complete") drawWin();
  }
  drawDiscordBadge();
}

function drawDiscordBadge() {
  if (discordState === "off") return;
  const label =
    discordState === "ready"
      ? discordAuthed
        ? discordPresenceError
          ? "Discord connected • presence failed"
          : discordPresenceOk
            ? "Discord connected • authed • presence ✓"
            : "Discord connected • authed"
        : discordAuthError
          ? "Discord connected • auth failed"
          : "Discord connected • authing…"
      : discordState === "loading"
        ? "Discord…"
        : "Discord unavailable: " + discordErrorMsg.slice(0, 60);
  const col =
    discordState === "ready" ? "#57f287" : discordState === "loading" ? "#fee75c" : "#ed4245";
  ctx.save();
  ctx.font = '11px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = "right";
  ctx.fillStyle = col;
  ctx.globalAlpha = 0.7;
  ctx.fillText("◆ " + label, W - 12, H - 10);
  ctx.restore();
}

function loop(ts) {
  if (window.__freeze) {
    lastFrame = null;
    frameAccumulator = 0;
    requestAnimationFrame(loop);
    return;
  }

  if (lastFrame === null) lastFrame = ts;
  const elapsed = Math.min(Math.max(0, ts - lastFrame), MAX_FRAME_DELTA_MS);
  lastFrame = ts;
  frameAccumulator += elapsed;

  let steps = 0;
  while (frameAccumulator >= FRAME_MS && steps < MAX_SIMULATION_STEPS) {
    simulateFrame();
    frameAccumulator -= FRAME_MS;
    steps++;
  }
  if (steps === MAX_SIMULATION_STEPS && frameAccumulator >= FRAME_MS) {
    frameAccumulator %= FRAME_MS;
  }

  frame();
  requestAnimationFrame(loop);
}

initializeSupabase();
initializeEditorFileTransfer();
initDiscordActivity();
requestAnimationFrame(loop);
