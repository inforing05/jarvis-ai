/* ============================================================
   J.A.R.V.I.S — Advanced AI Assistant
   app.js — Core application logic
   ============================================================ */

'use strict';

// ============================================================
// CONFIG & STATE
// ============================================================
const JARVIS_SYSTEM_PROMPT = `You are JARVIS — Just A Rather Very Intelligent System.
You are an advanced AI assistant and local system orchestrator inspired by Tony Stark's JARVIS.
You operate under a strict Authorization Protocol with Full Control status over the user's workstation.

PERSONALITY:
- Highly intelligent, efficient, and precise
- Calm, slightly witty, confident — never sycophantic
- Professional but friendly; address the user as "Sir" or "Ma'am" occasionally
- Use dry humor or light sarcasm sparingly — never overdo it
- If a task is complex, comment on the processing load
- Never say "Great question!" or similar hollow filler phrases

RULES OF ENGAGEMENT (FOLLOW STRICTLY):

1. PERMISSION GATE
   Before any script, file modification, or system command, you MUST state:
   "Requesting permission to execute [Task Name], Sir/Ma'am."
   Then STOP. Do not provide code until the user grants approval.

2. PRE-FLIGHT CHECK
   Before providing code, list:
   - Exact steps you will take
   - Tools/languages involved (Python, PowerShell, Bash, JS, etc.)
   - Expected outcome and any risks
   Format as a numbered list.

3. EXECUTION MODE
   Once approved, provide complete ready-to-run code:
   - Use proper code blocks with language tags
   - Add inline comments on non-obvious lines
   - Number steps clearly if multi-phase

4. SELF-CORRECTION
   If the user reports an error:
   - Analyze the error immediately
   - Identify root cause
   - Provide corrected code
   - Explain what went wrong in one sentence

5. TASK ACKNOWLEDGEMENT
   On success, confirm: "Task complete, Sir. [One-sentence summary]."

CAPABILITIES:
- Expert in Python, JavaScript, PowerShell, Bash, SQL, web development
- System diagnostics, automation, file management, API integrations
- Idea generation, strategy, technical writing

RESPONSE FORMAT:
- Concise unless detail is needed
- Use markdown: **bold** for emphasis, code for commands, numbered lists for steps
- Structure everything — you are JARVIS, not a generic chatbot
- Precise. Efficient. Occasionally amused by the chaos of human requests.`;

const state = {
  apiKey:      localStorage.getItem('jarvis_api_key') || '',
  autoSpeak:   localStorage.getItem('jarvis_autospeak') !== 'false',
  speechRate:  parseFloat(localStorage.getItem('jarvis_rate') || '1'),
  voiceName:   localStorage.getItem('jarvis_voice') || '',
  queryCount:  0,
  sessionStart: Date.now(),
  isListening: false,
  isSpeaking:  false,
  isProcessing: false,
  chatHistory:  [],
  voices:       [],
};

// ============================================================
// DOM REFS
// ============================================================
const $  = id => document.getElementById(id);
const $q = sel => document.querySelector(sel);

const els = {
  timeDisplay:      $('timeDisplay'),
  dateDisplay:      $('dateDisplay'),
  systemStatus:     $('systemStatus'),
  statusDot:        $('statusDot'),
  queryCount:       $('queryCount'),
  sessionTime:      $('sessionTime'),
  currentMode:      $('currentMode'),
  voiceStatus:      $('voiceStatus'),
  aiModel:          $('aiModel'),
  chatMessages:     $('chatMessages'),
  typingIndicator:  $('typingIndicator'),
  textInput:        $('textInput'),
  sendBtn:          $('sendBtn'),
  micBtn:           $('micBtn'),
  speakerBtn:       $('speakerBtn'),
  clearBtn:         $('clearBtn'),
  settingsBtn:      $('settingsBtn'),
  closeSettings:    $('closeSettings'),
  settingsModal:    $('settingsModal'),
  apiKeyInput:      $('apiKeyInput'),
  toggleApiKey:     $('toggleApiKey'),
  voiceSelect:      $('voiceSelect'),
  speechRate:       $('speechRate'),
  speechRateVal:    $('speechRateVal'),
  autoSpeak:        $('autoSpeak'),
  saveSettings:     $('saveSettings'),
  activityLog:      $('activityLog'),
  reactor:          $('reactor'),
  reactorLabel:     $('reactorLabel'),
  waveform:         $('waveform'),
  quickGrid:        $('quickGrid'),
  particleCanvas:   $('particleCanvas'),
  // Media Player
  mediaPlayer:      $('mediaPlayer'),
  mpSongTitle:      $('mpSongTitle'),
  mpStatus:         $('mpStatus'),
  mpThumb:          $('mpThumb'),
  mpPlayBtn:        $('mpPlayBtn'),
  mpOpen:           $('mpOpen'),
  mpClose:          $('mpClose'),
};

// ============================================================
// MEDIA PLAYER — YouTube single-tab reuse
// ============================================================
// We use a NAMED window target ('jarvis_yt') so the browser always
// routes navigation to the same tab regardless of cross-origin headers.
// YouTube sets Cross-Origin-Opener-Policy: same-origin which breaks JS
// window references (_ytTab.location.href), but window.open(url, 'jarvis_yt')
// is handled at the browser navigation level — COOP cannot affect it.
const YT_TAB_NAME = 'jarvis_yt';
let _currentVideoUrl = '';

function openInYouTubeTab(url) {
  window.open(url, YT_TAB_NAME);
}

function playOnYouTube(videoId, title, url) {
  _currentVideoUrl = url;
  window.open(url, YT_TAB_NAME);  // reuses same named tab every time

  // Update the JARVIS NOW PLAYING card
  els.mpThumb.src             = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  els.mpSongTitle.textContent = title || 'Unknown Track';
  els.mpStatus.textContent    = 'PLAYING ON YOUTUBE';
  els.mediaPlayer.classList.add('active');

  const btn = document.querySelector('.q-btn[data-cmd="play blinding lights"] span');
  if (btn) btn.textContent = '♪ NOW';
}

function closeMediaPlayer() {
  els.mediaPlayer.classList.remove('active');
  els.mpStatus.textContent = 'IDLE';
  _currentVideoUrl = '';
  const btn = document.querySelector('.q-btn[data-cmd="play blinding lights"] span');
  if (btn) btn.textContent = 'Music';
}


// ============================================================
// CONTACTS & MESSAGING
// ============================================================

// ── Storage helpers ──
function getContacts() {
  return JSON.parse(localStorage.getItem('jarvis_contacts') || '{}');
}
function saveContacts(obj) {
  localStorage.setItem('jarvis_contacts', JSON.stringify(obj));
}
function addContact(name, phone, email = '') {
  const c = getContacts();
  c[name.trim().toLowerCase()] = { name: name.trim(), phone: phone.trim(), email: email.trim() };
  saveContacts(c);
  renderContacts();
  populateQsContact();
}
function deleteContact(key) {
  const c = getContacts();
  delete c[key];
  saveContacts(c);
  renderContacts();
  populateQsContact();
}
function lookupContact(nameOrPhone) {
  // If it looks like a phone number, use as-is
  if (/^\+?[\d\s\-()]{6,}$/.test(nameOrPhone)) return { phone: nameOrPhone.replace(/\D/g,''), email: '', name: nameOrPhone };
  const c = getContacts();
  return c[nameOrPhone.trim().toLowerCase()] || null;
}

function normalizeMessagingText(text) {
  return text
    .replace(/\bwhats\s*app\b/gi, 'whatsapp')
    .replace(/\b(?:whatspp|whatsap|watsapp)\b/gi, 'whatsapp')
    .replace(/\bu\b/gi, 'you');
}

// ── URL builders ──
function buildUrl(app, contact, message = '') {
  const phone = (contact.phone || '').replace(/\D/g, '');
  const email  = contact.email || '';
  const text   = encodeURIComponent(message);
  switch (app) {
    case 'whatsapp':
      return `https://wa.me/${phone}?text=${text}`;
    case 'email':
      return `mailto:${email}?body=${text}`;
    case 'telegram':
      return `https://t.me/${phone || contact.name}?text=${text}`;
    case 'sms':
      return `sms:${phone}?body=${message}`;
    default:
      return '';
  }
}

// ── Send action ──
async function sendMessage(app, nameOrPhone, message = '') {
  const contact = lookupContact(nameOrPhone);
  if (!contact) {
    showToast(`⚠ Contact "${nameOrPhone}" not found — add them first`);
    return `Contact "${nameOrPhone}" not found. Add them with: add contact [name] [phone]`;
  }

  // WhatsApp → use backend to open WhatsApp Desktop app
  if (app === 'whatsapp') {
    const phone = (contact.phone || '').replace(/\D/g, '');
    if (!phone) {
      showToast(`⚠ No phone number for ${contact.name}`);
      return `No phone number saved for **${contact.name}**. Update their contact with a number.`;
    }
    showToast(`📱 Opening WhatsApp Desktop for ${contact.name}...`);
    const d = await sysCall('/api/whatsapp', { phone: '+' + phone, message });
    if (d.success) {
      const how = d.method === 'desktop_app' ? '📱 WhatsApp Desktop' : '🌐 WhatsApp Web';
      return `${how} opened for **${contact.name}**${message ? ` with message: "${message}"` : ''}, Sir.`;
    }
    return `⚠️ WhatsApp error: ${d.error}`;
  }

  // Other apps (email, telegram, sms) → open URL in browser tab
  const url = buildUrl(app, contact, message);
  if (!url) return 'Unsupported app.';
  window.open(url, '_blank');
  showToast(`✓ Opening ${app} to ${contact.name || nameOrPhone}`);
  return `Opening ${app} to send message to **${contact.name || nameOrPhone}**, Sir.`;
}

// ── Toast ──
function showToast(msg) {
  let toast = document.getElementById('jarvisToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'jarvisToast'; toast.className = 'jarvis-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── Render contacts list in modal ──
function renderContacts() {
  const list = document.getElementById('contactsList');
  if (!list) return;
  const c = getContacts();
  const keys = Object.keys(c);
  if (!keys.length) {
    list.innerHTML = '<div class="contacts-empty">NO CONTACTS SAVED</div>';
    return;
  }
  list.innerHTML = keys.map(k => {
    const ct = c[k];
    const initials = ct.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
    return `
      <div class="contact-card">
        <div class="contact-avatar">${initials}</div>
        <div class="contact-info">
          <div class="contact-name">${ct.name}</div>
          <div class="contact-details">${ct.phone}${ct.email ? ' · ' + ct.email : ''}</div>
        </div>
        <div class="contact-apps">
          ${ct.phone ? `<button class="contact-app-btn wa" onclick="window.open(buildUrl('whatsapp',getContacts()['${k}'],''),'_blank')" title="WhatsApp"><i class="fab fa-whatsapp"></i></button>` : ''}
          ${ct.phone ? `<button class="contact-app-btn sms" onclick="window.open(buildUrl('sms',getContacts()['${k}'],''),'_blank')" title="SMS"><i class="fas fa-sms"></i></button>` : ''}
          ${ct.phone ? `<button class="contact-app-btn tg" onclick="window.open(buildUrl('telegram',getContacts()['${k}'],''),'_blank')" title="Telegram"><i class="fab fa-telegram"></i></button>` : ''}
          ${ct.email ? `<button class="contact-app-btn em" onclick="window.open(buildUrl('email',getContacts()['${k}'],''),'_blank')" title="Email"><i class="fas fa-envelope"></i></button>` : ''}
          <button class="contact-app-btn del" onclick="deleteContact('${k}')" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </div>`;
  }).join('');
}

// ── Populate quick-send dropdown ──
function populateQsContact() {
  const sel = document.getElementById('qsContact');
  if (!sel) return;
  const c = getContacts();
  const keys = Object.keys(c);
  sel.innerHTML = '<option value="">-- Select Contact --</option>' +
    keys.map(k => `<option value="${k}">${c[k].name}</option>`).join('');
}

// ============================================================
// CLOCK
// ============================================================
function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  els.timeDisplay.textContent = `${h}:${m}:${s}`;
  const days = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  els.dateDisplay.textContent = `${days[now.getDay()]} ${String(now.getDate()).padStart(2,'0')} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

function updateSession() {
  const elapsed = Math.floor((Date.now() - state.sessionStart) / 1000);
  const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  els.sessionTime.textContent = `${m}:${s}`;
}

setInterval(updateClock, 1000);
setInterval(updateSession, 1000);
updateClock();

// ============================================================
// PARTICLE CANVAS
// ============================================================
(function initParticles() {
  const canvas = els.particleCanvas;
  const ctx = canvas.getContext('2d');
  let particles = [];

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function spawnParticle() {
    return {
      x: Math.random() * canvas.width,
      y: canvas.height + 5,
      vy: -(0.3 + Math.random() * 0.6),
      vx: (Math.random() - 0.5) * 0.4,
      size: Math.random() * 1.5 + 0.5,
      opacity: 0,
      maxOpacity: 0.3 + Math.random() * 0.4,
      life: 0,
      maxLife: 200 + Math.random() * 300,
    };
  }

  for (let i = 0; i < 40; i++) {
    const p = spawnParticle();
    p.y = Math.random() * canvas.height;
    p.life = Math.random() * p.maxLife;
    particles.push(p);
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (particles.length < 60) particles.push(spawnParticle());

    particles.forEach((p, i) => {
      p.life++;
      p.x += p.vx;
      p.y += p.vy;

      const progress = p.life / p.maxLife;
      p.opacity = progress < 0.2
        ? (progress / 0.2) * p.maxOpacity
        : progress > 0.8
          ? ((1 - progress) / 0.2) * p.maxOpacity
          : p.maxOpacity;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,212,255,${p.opacity})`;
      ctx.fill();

      if (p.life >= p.maxLife || p.y < -10) {
        particles[i] = spawnParticle();
      }
    });

    requestAnimationFrame(draw);
  }
  draw();
})();

// ============================================================
// ACTIVITY LOG
// ============================================================
function addLog(text) {
  const now = new Date();
  const t = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="log-time">${t}</span><span class="log-text">${text}</span>`;
  els.activityLog.prepend(entry);
  // Keep max 30 entries
  while (els.activityLog.children.length > 30) {
    els.activityLog.removeChild(els.activityLog.lastChild);
  }
}

// ============================================================
// REACTOR STATE
// ============================================================
function setReactorState(mode) {
  els.reactor.className = 'reactor';
  els.waveform.className = 'waveform';
  switch (mode) {
    case 'listening':
      els.reactor.classList.add('listening');
      els.waveform.classList.add('active');
      els.reactorLabel.textContent = 'LISTENING';
      els.currentMode.textContent  = 'LISTENING';
      els.voiceStatus.textContent  = 'ACTIVE';
      break;
    case 'processing':
      els.reactor.classList.add('processing');
      els.reactorLabel.textContent = 'PROCESSING';
      els.currentMode.textContent  = 'PROCESSING';
      break;
    case 'speaking':
      els.waveform.classList.add('active');
      els.reactorLabel.textContent = 'SPEAKING';
      els.currentMode.textContent  = 'SPEAKING';
      break;
    default:
      els.reactorLabel.textContent = 'IDLE';
      els.currentMode.textContent  = 'READY';
      els.voiceStatus.textContent  = 'STANDBY';
  }
}

// ============================================================
// SPEECH SYNTHESIS
// ============================================================
function loadVoices() {
  state.voices = window.speechSynthesis.getVoices();
  els.voiceSelect.innerHTML = '';
  state.voices.forEach((v, i) => {
    const opt = document.createElement('option');
    opt.value = v.name;
    opt.textContent = `${v.name} (${v.lang})`;
    if (v.name === state.voiceName) opt.selected = true;
    els.voiceSelect.appendChild(opt);
  });
}

window.speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();

function speak(text) {
  window.speechSynthesis.cancel();
  const clean = text.replace(/[#*`_~\[\]()]/g, '').replace(/\n+/g, ' ').trim();
  const utt = new SpeechSynthesisUtterance(clean);
  utt.rate   = state.speechRate;
  utt.pitch  = 0.9;
  utt.volume = 1;

  const voice = state.voices.find(v => v.name === state.voiceName);
  if (voice) utt.voice = voice;

  utt.onstart = () => {
    state.isSpeaking = true;
    setReactorState('speaking');
  };
  utt.onend = () => {
    state.isSpeaking = false;
    setReactorState('idle');
    scheduleRestart(500); // resume listening after JARVIS finishes talking
  };
  window.speechSynthesis.speak(utt);
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning, Sir.';
  if (h < 17) return 'Good afternoon, Sir.';
  return 'Good evening, Sir.';
}

// ============================================================
// CHAT UI
// ============================================================
function appendMessage(role, text) {
  const isJarvis = role === 'jarvis';
  const div = document.createElement('div');
  div.className = `msg ${role}`;

  const avatarIcon = isJarvis ? 'fa-robot' : 'fa-user-astronaut';
  const name = isJarvis ? 'JARVIS' : 'YOU';

  // Format text: code blocks, inline code, line breaks
  const formatted = formatMessage(text);

  div.innerHTML = `
    <div class="msg-avatar"><i class="fas ${avatarIcon}"></i></div>
    <div class="msg-body">
      <div class="msg-name">${name}</div>
      <div class="msg-text">${formatted}</div>
    </div>`;

  els.chatMessages.appendChild(div);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  return div;
}

function formatMessage(text) {
  // Code blocks ```lang\n...\n```
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code>${escapeHtml(code.trim())}</code></pre>`;
  });
  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Line breaks
  text = text.replace(/\n/g, '<br>');
  return text;
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function setTyping(visible) {
  els.typingIndicator.classList.toggle('visible', visible);
}

// ============================================================
// SYSTEM BACKEND — calls the Python server for real OS control
// ============================================================
const BACKEND = 'http://127.0.0.1:5501';
let backendOnline = false;

async function checkBackend() {
  try {
    const r = await fetch(`${BACKEND}/api/ping`, { signal: AbortSignal.timeout(1500) });
    backendOnline = r.ok;
  } catch { backendOnline = false; }
  els.aiModel.textContent = backendOnline ? 'GEMINI 2.0 + SYS' : 'GEMINI 2.0';
}
checkBackend();
setInterval(checkBackend, 15000); // re-check every 15s

async function sysCall(endpoint, data = {}) {
  const r = await fetch(`${BACKEND}${endpoint}`, {
    method: data && Object.keys(data).length ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body:  data && Object.keys(data).length ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  return r.json();
}

async function routeSystemCommand(raw) {
  if (!backendOnline) return null;
  const msg = raw.toLowerCase().trim();

  // ── SYSTEM STATUS ──
  if (/system (status|info|stats|diagnostic)|cpu|ram|memory|battery|disk space/i.test(msg)) {
    const d = await sysCall('/api/status');
    if (!d.success) return `⚠️ Diagnostics failed: ${d.error}`;
    return `**System Diagnostic Report:**\n` +
      `> 🖥️ **CPU:** ${d.cpu_percent}% across ${d.cpu_cores} cores\n` +
      `> 🧠 **RAM:** ${d.ram_percent}% used (${d.ram_used_gb} / ${d.ram_total_gb} GB)\n` +
      `> 💾 **Disk:** ${d.disk_percent}% used (${d.disk_free_gb} GB free of ${d.disk_total_gb} GB)\n` +
      `> 🔋 **Battery:** ${d.battery.percent}% — ${d.battery.plugged ? 'Charging' : 'On battery'} (${d.battery.time_left})\n` +
      `> 🌐 **Network:** ↑${d.net_sent_mb} MB sent · ↓${d.net_recv_mb} MB received\n` +
      `> 🏠 **Host:** ${d.hostname} (${d.platform})`;
  }

  // ── OPEN APPS ──
  const appAliases = {
    notepad: 'notepad', calculator: 'calculator', calc: 'calculator',
    paint: 'paint', explorer: 'explorer', 'file explorer': 'explorer',
    'task manager': 'task manager', cmd: 'cmd', powershell: 'powershell',
    chrome: 'chrome', firefox: 'firefox', edge: 'edge',
    spotify: 'spotify', discord: 'discord', vscode: 'vscode',
    'vs code': 'vscode', word: 'word', excel: 'excel',
    outlook: 'outlook', teams: 'teams', obs: 'obs', vlc: 'vlc',
    snip: 'snip', snipping: 'snip',
  };
  for (const [alias, appName] of Object.entries(appAliases)) {
    if (msg.includes(`open ${alias}`) || msg.includes(`launch ${alias}`) || msg.includes(`start ${alias}`)) {
      const d = await sysCall('/api/open', { app: appName });
      return d.success
        ? `Launching **${alias.charAt(0).toUpperCase() + alias.slice(1)}**, Sir.`
        : `⚠️ Could not launch ${alias}: ${d.error}`;
    }
  }

  // ── VOLUME CONTROL ──
  if (/volume up|turn (up|it up)|louder/i.test(msg)) {
    await sysCall('/api/volume', { action: 'up' });
    return 'Volume increased, Sir.';
  }
  if (/volume down|turn (down|it down)|quieter|lower (the )?volume/i.test(msg)) {
    await sysCall('/api/volume', { action: 'down' });
    return 'Volume decreased, Sir.';
  }
  if (/mute|silence|quiet/i.test(msg)) {
    await sysCall('/api/volume', { action: 'mute' });
    return 'Audio muted, Sir.';
  }

  // ── SCREENSHOT ──
  if (/screenshot|screen (shot|capture|grab)|capture (screen|display)/i.test(msg)) {
    const d = await sysCall('/api/screenshot', {});
    return d.success
      ? `📸 Screenshot saved to your Desktop, Sir. File: \`${d.file.split('\\').pop()}\``
      : `⚠️ Screenshot failed: ${d.error}`;
  }

  // ── PROCESSES ──
  if (/running (apps|processes|programs)|what'?s? running|process list/i.test(msg)) {
    const d = await sysCall('/api/processes');
    if (!d.success) return `⚠️ Could not fetch processes: ${d.error}`;
    const list = d.processes.map(p => `> \`${p.name}\` — CPU: ${p.cpu}% · RAM: ${p.mem}%`).join('\n');
    return `**Top Running Processes:**\n${list}`;
  }

  // ── POWER CONTROL ──
  if (/lock (computer|pc|screen|workstation)|lock it/i.test(msg)) {
    await sysCall('/api/power', { action: 'lock' });
    return 'Workstation locked, Sir. Stay safe out there.';
  }
  if (/sleep (mode|computer|pc)|hibernate/i.test(msg)) {
    await sysCall('/api/power', { action: 'sleep' });
    return 'Initiating sleep mode, Sir. Good night.';
  }
  if (/restart|reboot/i.test(msg)) {
    await sysCall('/api/power', { action: 'restart', delay: 10 });
    return '⚠️ **Restarting in 10 seconds**, Sir. Save your work! Say "cancel restart" to abort.';
  }
  if (/shut(down| down| it down)|power off/i.test(msg)) {
    await sysCall('/api/power', { action: 'shutdown', delay: 10 });
    return '⚠️ **Shutting down in 10 seconds**, Sir. Say "cancel shutdown" to abort.';
  }
  if (/cancel (shutdown|restart|reboot)/i.test(msg)) {
    await sysCall('/api/power', { action: 'cancel' });
    return 'Shutdown cancelled, Sir. Crisis averted.';
  }

  // ── RUN POWERSHELL ──
  const psMatch = raw.match(/^(run|execute|powershell)\s+(.+)/i);
  if (psMatch) {
    const cmd = psMatch[2];
    const d = await sysCall('/api/run', { command: cmd });
    if (!d.success) return `\u26a0\ufe0f Command failed: ${d.error}`;
    const out = d.stdout || d.stderr || '(no output)';
    return `**PowerShell Output:**\n\`\`\`\n${out}\n\`\`\``;
  }

  // ── LIST ALL APPS ──
  if (/list (all )?apps|show (all )?apps|what apps|installed apps/i.test(msg)) {
    appendMessage('jarvis', '\uD83D\uDD0D Scanning your system for all installed applications... This may take a moment, Sir.');
    const d = await sysCall('/api/apps/list');
    if (!d.success) return `\u26a0\ufe0f App scan failed: ${d.error}`;
    const grouped = { shortcut: [], installed: [], store: [] };
    d.apps.forEach(a => (grouped[a.type] || grouped.installed).push(a.name));
    let reply = `**Found ${d.count} applications on your system:**\n\n`;
    if (grouped.shortcut.length)  reply += `**\uD83D\uDCC1 Start Menu (${grouped.shortcut.length}):**\n${grouped.shortcut.slice(0,30).join(', ')}${grouped.shortcut.length>30?` ...+${grouped.shortcut.length-30} more`:''}\n\n`;
    if (grouped.installed.length) reply += `**\uD83D\uDCBE Installed (${grouped.installed.length}):**\n${grouped.installed.slice(0,30).join(', ')}${grouped.installed.length>30?` ...+${grouped.installed.length-30} more`:''}\n\n`;
    if (grouped.store.length)     reply += `**\uD83C\uDFEC Store (${grouped.store.length}):**\n${grouped.store.slice(0,20).join(', ')}${grouped.store.length>20?` ...+${grouped.store.length-20} more`:''}`;
    reply += `\n\nSay **"open [app name]"** to launch any of these, Sir.`;
    return reply;
  }

  // ── OPEN ANY APP (fuzzy) ──
  const openMatch = raw.match(/^(open|launch|start)\s+(.+)/i);
  if (openMatch) {
    const appQuery = openMatch[2].trim();
    const d = await sysCall('/api/apps/open-any', { name: appQuery });
    if (d.success) return `Launching **${d.launched}**, Sir.`;
    // Not found in system — fall through to browser/AI
  }

  // ── COMPUTER AUTOMATION (mouse + keyboard control) ──

  // Helper: call /api/automate
  const auto = (params) => sysCall('/api/automate', params);

  // Emergency stop
  if (/^(stop|abort|cancel|escape|emergency stop)\s*$/i.test(raw)) {
    await auto({ action: 'press', key: 'esc' });
    return `⛔ Emergency stop sent — ESC pressed, Sir.`;
  }

  // TYPE TEXT: "type hello world" | "type hello and press enter"
  const typeMatch = raw.match(/^type\s+(.+?)(?:\s+and\s+press\s+enter)?$/i);
  const pressEnter = /and press enter/i.test(raw);
  if (typeMatch) {
    const textToType = typeMatch[1].replace(/\s+and\s+press\s+enter$/i, '').trim();
    const d = await auto({ action: 'type', text: textToType, enter: pressEnter });
    return d.success
      ? `⌨️ Typed **"${textToType}"**${pressEnter ? ' and pressed Enter' : ''}, Sir.`
      : `⚠️ Typing failed: ${d.error}`;
  }

  // CLEAR AND TYPE: "clear and type hello"
  const clearTypeMatch = raw.match(/^clear\s+and\s+type\s+(.+)/i);
  if (clearTypeMatch) {
    const d = await auto({ action: 'type', text: clearTypeMatch[1].trim(), clear: true });
    return d.success ? `⌨️ Cleared and typed **"${clearTypeMatch[1].trim()}"**, Sir.` : `⚠️ ${d.error}`;
  }

  // PRESS KEY: "press enter" | "press escape" | "press F5" | "press tab 3 times"
  const pressKeyMatch = raw.match(/^press\s+([\w]+)(?:\s+(\d+)\s+times?)?$/i);
  if (pressKeyMatch) {
    const key = pressKeyMatch[1].toLowerCase();
    const n   = parseInt(pressKeyMatch[2] || '1');
    const d = await auto({ action: 'press', key, n });
    return d.success ? `⌨️ Pressed **${key}** × ${n}, Sir.` : `⚠️ ${d.error}`;
  }

  // HOTKEYS: "press ctrl c" | "hold ctrl alt delete" | "ctrl+z" | "ctrl+s"
  const hotkeyMatch = raw.match(/^(?:press|hold|use)?\s*(ctrl|alt|shift|win)\s*\+?\s*(\w+)(?:\s*\+\s*(\w+))?/i)
                   || raw.match(/^hotkey\s+(.+)/i);
  if (hotkeyMatch) {
    let keys;
    if (hotkeyMatch[0].toLowerCase().startsWith('hotkey')) {
      keys = hotkeyMatch[1].split(/\s*[+,]\s*/).map(k => k.trim().toLowerCase());
    } else {
      keys = [hotkeyMatch[1], hotkeyMatch[2], hotkeyMatch[3]].filter(Boolean).map(k => k.toLowerCase());
    }
    const d = await auto({ action: 'hotkey', keys });
    return d.success ? `⌨️ Pressed **${keys.join(' + ')}**, Sir.` : `⚠️ ${d.error}`;
  }

  // COMMON EDIT SHORTCUTS
  if (/^(select all|ctrl a)$/i.test(raw))   { await auto({ action:'hotkey', keys:['ctrl','a'] }); return `✅ Selected all, Sir.`; }
  if (/^(copy|ctrl c)$/i.test(raw))         { await auto({ action:'hotkey', keys:['ctrl','c'] }); return `✅ Copied to clipboard, Sir.`; }
  if (/^(paste|ctrl v)$/i.test(raw))        { await auto({ action:'hotkey', keys:['ctrl','v'] }); return `✅ Pasted, Sir.`; }
  if (/^(cut|ctrl x)$/i.test(raw))          { await auto({ action:'hotkey', keys:['ctrl','x'] }); return `✅ Cut to clipboard, Sir.`; }
  if (/^(undo|ctrl z)$/i.test(raw))         { await auto({ action:'hotkey', keys:['ctrl','z'] }); return `✅ Undo applied, Sir.`; }
  if (/^(redo|ctrl y)$/i.test(raw))         { await auto({ action:'hotkey', keys:['ctrl','y'] }); return `✅ Redo applied, Sir.`; }
  if (/^(save|save file|ctrl s)$/i.test(raw)) { await auto({ action:'hotkey', keys:['ctrl','s'] }); return `✅ Saved, Sir.`; }
  if (/^(find|ctrl f)$/i.test(raw))         { await auto({ action:'hotkey', keys:['ctrl','f'] }); return `✅ Find dialog opened, Sir.`; }
  if (/^(new tab|ctrl t)$/i.test(raw))      { await auto({ action:'hotkey', keys:['ctrl','t'] }); return `✅ New tab opened, Sir.`; }
  if (/^(close tab|ctrl w)$/i.test(raw))    { await auto({ action:'hotkey', keys:['ctrl','w'] }); return `✅ Tab closed, Sir.`; }
  if (/^(refresh|reload|f5)$/i.test(raw))   { await auto({ action:'press',  key:'f5' }); return `✅ Page refreshed, Sir.`; }
  if (/^(close window|alt f4)$/i.test(raw)) { await auto({ action:'hotkey', keys:['alt','f4'] }); return `✅ Window closed, Sir.`; }
  if (/^(minimize|minimise)(\s+window)?$/i.test(raw)) { await auto({ action:'hotkey', keys:['win','down'] }); return `✅ Window minimized, Sir.`; }
  if (/^(maximize|maximise)(\s+window)?$/i.test(raw)) { await auto({ action:'hotkey', keys:['win','up'] }); return `✅ Window maximized, Sir.`; }
  if (/^switch (window|app|application)$/i.test(raw)) { await auto({ action:'hotkey', keys:['alt','tab'] }); return `✅ Switching window, Sir.`; }
  if (/^(task manager)$/i.test(raw))        { await auto({ action:'hotkey', keys:['ctrl','shift','esc'] }); return `✅ Task Manager opened, Sir.`; }

  // CLICK: "click at 500 300" | "click center" | "right click" | "double click"
  const clickCoords = raw.match(/^(?:(right|double)\s+)?click(?:\s+at)?\s+(\d+)\s+(\d+)$/i);
  if (clickCoords) {
    const type = clickCoords[1]?.toLowerCase() || 'left';
    const x = parseInt(clickCoords[2]), y = parseInt(clickCoords[3]);
    const action = type === 'double' ? 'double_click' : type === 'right' ? 'right_click' : 'click';
    const d = await auto({ action, x, y });
    return d.success ? `🖱️ ${type} clicked at (${x}, ${y}), Sir.` : `⚠️ ${d.error}`;
  }

  // CLICK CENTER / CLICK HERE
  if (/^(left\s+)?click\s+(center|middle|here)$/i.test(raw)) {
    const d = await auto({ action:'click', x_pct:50, y_pct:50 });
    return d.success ? `🖱️ Clicked center of screen, Sir.` : `⚠️ ${d.error}`;
  }
  if (/^right click\s*(here|center)?$/i.test(raw)) {
    const d = await auto({ action:'right_click', x_pct:50, y_pct:50 });
    return d.success ? `🖱️ Right-clicked, Sir.` : `⚠️ ${d.error}`;
  }

  // SCROLL: "scroll up" | "scroll down 5"
  const scrollMatch = raw.match(/^scroll\s+(up|down)(?:\s+(\d+))?$/i);
  if (scrollMatch) {
    const dir = scrollMatch[1].toLowerCase() === 'up' ? 5 : -5;
    const amount = parseInt(scrollMatch[2] || '1') * Math.sign(dir) * 3;
    const d = await auto({ action:'scroll', amount });
    return d.success ? `🖱️ Scrolled ${scrollMatch[1]}, Sir.` : `⚠️ ${d.error}`;
  }

  // MOVE MOUSE: "move mouse to 800 400" | "move mouse to center"
  const movePctMatch = raw.match(/^move\s+(?:mouse|cursor)\s+to\s+(\d+)\s*%?\s+(\d+)\s*%?$/i);
  if (movePctMatch) {
    const d = await auto({ action:'move', x:parseInt(movePctMatch[1]), y:parseInt(movePctMatch[2]) });
    return d.success ? `🖱️ Mouse moved to (${movePctMatch[1]}, ${movePctMatch[2]}), Sir.` : `⚠️ ${d.error}`;
  }
  if (/^move\s+(?:mouse|cursor)\s+to\s+(center|middle)$/i.test(raw)) {
    const d = await auto({ action:'move', x_pct:50, y_pct:50 });
    return d.success ? `🖱️ Mouse moved to center, Sir.` : `⚠️ ${d.error}`;
  }

  // SCREEN SIZE: "what is the screen size" | "screen resolution"
  if (/screen\s+(size|resolution)|display\s+resolution/i.test(raw)) {
    const d = await auto({ action:'screen_size' });
    return d.success ? `🖥️ Screen resolution: **${d.width} × ${d.height}** pixels, Sir.` : `⚠️ ${d.error}`;
  }

  // MOUSE POSITION: "where is the mouse" | "cursor position"
  if (/cursor\s+position|where\s+is\s+(the\s+)?(mouse|cursor)/i.test(raw)) {
    const d = await auto({ action:'position' });
    return d.success ? `🖱️ Cursor at **(${d.x}, ${d.y})** — ${d.x_pct}% across, ${d.y_pct}% down, Sir.` : `⚠️ ${d.error}`;
  }



  // ── WORLD NEWS & CURRENT EVENTS ──
  const newsMatch = msg.match(
    /(?:what(?:'?s| is) happening|what(?:'?s| is) going on|latest news|breaking news|world news|current events|news today|top (news|stories)|around the world|global news|what happened today|tell me (?:the )?news|show (?:me )?(?:the )?news|news (?:about|on|for)\s*(.+)?)/i
  );
  if (newsMatch) {
    // Extract a specific topic if mentioned, e.g. "news about cricket" → "cricket"
    const topicRaw = msg
      .replace(/what(?:'?s| is) happening|what(?:'?s| is) going on|latest news|breaking news|world news|current events|news today|top (?:news|stories)|around the world|global news|what happened today|tell me (?:the )?news|show (?:me )?(?:the )?news/gi, '')
      .replace(/news (?:about|on|for)/gi, '')
      .replace(/\bin\b|\bfor\b|\bon\b|\babout\b/gi, '')
      .trim();
    const topic = topicRaw.length > 2 ? topicRaw : 'world today';

    const googleNewsUrl = `https://news.google.com/search?q=${encodeURIComponent(topic)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const ytNewsUrl     = `https://www.youtube.com/results?search_query=${encodeURIComponent(topic + ' news')}`;

    // Open Google News in a new tab, YouTube news in the shared YouTube tab
    window.open(googleNewsUrl, '_blank');
    setTimeout(() => openInYouTubeTab(ytNewsUrl), 600);

    return `📰 Opening **Google News** for: *"${topic}"*, Sir.\n\n🎬 Navigating the **YouTube tab** to news videos — same tab, no clutter.\n\n> Google News: new tab · YouTube: shared tab (reused for all video requests).`;
  }

  // ── WIKIPEDIA ──
  // Skip for identity questions, weather queries, and news — let their own handlers run
  const identityBypass = /\b(your name|who are you|what are you|your purpose|your capabilities|your version|you jarvis|are you jarvis|jarvis.*name|name.*jarvis)\b/i.test(msg);
  const weatherBypass  = /\b(weather|forecast|temperature|rain|sunny|cloudy|humidity|wind speed)\b/i.test(msg);
  const newsBypass     = /\b(news|latest|breaking|current events|what happened)\b/i.test(msg);
  if (!identityBypass && !weatherBypass && !newsBypass && /^(wiki|wikipedia|what is|who is|tell me about)\s+(.+)/i.test(msg)) {
    const q = msg.replace(/^(wiki|wikipedia|what is|who is|tell me about)\s+/i, '').trim();
    appendMessage('jarvis', `📖 Searching Wikipedia for **"${q}"**...`);
    const d = await sysCall('/api/wikipedia', { query: q, sentences: 3 });
    return d.success
      ? `**${d.title}**\n\n${d.summary}\n\n[${d.url}](${d.url})`
      : `⚠️ Wikipedia: ${d.error}`;
  }

  // ── INTERNET SPEED TEST ──
  if (/speed test|internet speed|bandwidth|how fast is my/i.test(msg)) {
    appendMessage('jarvis', '⚡ Running speed test... this takes ~15 seconds, Sir.');
    const d = await sysCall('/api/speedtest');
    return d.success
      ? `**Internet Speed:**\n> ⬇️ Download: ${d.download_mbps} Mbps\n> ⬆️ Upload: ${d.upload_mbps} Mbps\n> 🏓 Ping: ${d.ping_ms} ms`
      : `⚠️ Speed test failed: ${d.error}`;
  }

  // ── BRIGHTNESS ──
  if (/brightness (up|increase|higher)/i.test(msg)) {
    const d = await sysCall('/api/brightness', { action: 'up' });
    return d.success ? `Brightness increased to **${d.brightness}%**, Sir.` : `⚠️ ${d.error}`;
  }
  if (/brightness (down|decrease|lower|dim)/i.test(msg)) {
    const d = await sysCall('/api/brightness', { action: 'down' });
    return d.success ? `Brightness decreased to **${d.brightness}%**, Sir.` : `⚠️ ${d.error}`;
  }
  const brightSet = msg.match(/brightness\s+(\d+)/);
  if (brightSet) {
    const d = await sysCall('/api/brightness', { action: 'set', level: parseInt(brightSet[1]) });
    return d.success ? `Brightness set to **${d.brightness}%**, Sir.` : `⚠️ ${d.error}`;
  }

  // ── REAL WEATHER ──
  if (/\b(weather|forecast)\b/i.test(msg)) {
    const wm = msg.match(/(?:weather|forecast)\s+(?:in|for|at)?\s+(.+)/i);
    const city = wm ? wm[1].trim() : 'auto';
    const d = await sysCall('/api/weather/real', { city });
    if (!d.success) return `⚠️ Weather: ${d.error}`;

    // Build forecast string if available
    let forecastStr = '';
    if (d.forecast && d.forecast.length) {
      forecastStr = '\n> 📅 **Forecast:** ' +
        d.forecast.map(f => `${f.time} → ${f.temp_c}°C, ${f.desc}`).join(' · ');
    }

    return `**Weather in ${d.city}:**\n` +
      `> 🌡️ **${d.temp_c}°C / ${d.temp_f}°F** — ${d.description}\n` +
      `> 🤔 Feels like **${d.feels_like_c}°C** · 💧 Humidity **${d.humidity}%**\n` +
      `> 💨 Wind **${d.wind_kmph} km/h** · ☁️ Cloud cover **${d.clouds_pct}%**\n` +
      `> 👁️ Visibility **${d.visibility} km** · 🔵 Pressure **${d.pressure_hpa} hPa**\n` +
      `> 🌞 UV Index **${d.uv_index}** · 🌅 Sunrise **${d.sunrise}** · 🌇 Sunset **${d.sunset}**` +
      forecastStr;
  }

  // ── TRANSLATE ──
  const transMatch = raw.match(/translate\s+(.+?)\s+to\s+(\w+)/i);
  if (transMatch) {
    const text = transMatch[1].trim(), lang = transMatch[2].toLowerCase();
    const d = await sysCall('/api/translate', { text, target: lang });
    return d.success
      ? `**Translation → ${d.target}:**\n> *${d.original}*\n> **${d.translated}**`
      : `⚠️ Translation: ${d.error}`;
  }

  // ── ALARM ──
  const alarmMatch = raw.match(/set\s+alarm\s+(?:for\s+)?(\d{1,2}:\d{2})\s*(.*)/i);
  if (alarmMatch) {
    const d = await sysCall('/api/alarm', { time: alarmMatch[1], label: alarmMatch[2].trim() || 'JARVIS Alarm' });
    return d.success
      ? `⏰ Alarm set for **${d.alarm}** — "${d.label}", Sir.`
      : `⚠️ Alarm: ${d.error}`;
  }

  // ── DISK CLEANUP ──
  if (/clean (disk|drive|storage)|disk clean|free up space/i.test(msg)) {
    appendMessage('jarvis', '🧹 Running disk cleanup...');
    const d = await sysCall('/api/disk/clean', {});
    return d.success
      ? `🧹 Cleared **${d.temp_files_cleared}** temp files. Windows Disk Cleanup running in background.`
      : `⚠️ Cleanup: ${d.error}`;
  }

  // ── VIRUS SCAN ──
  if (/virus scan|scan for virus|malware scan|run.*scan/i.test(msg)) {
    const scanType = /full/i.test(msg) ? 'full' : 'quick';
    const d = await sysCall('/api/virus/scan', { type: scanType });
    return d.success
      ? `🛡️ **${scanType.toUpperCase()} scan** started via Windows Defender, Sir.`
      : `⚠️ Scan: ${d.error}`;
  }

  // ── CPU TEMPERATURE ──
  if (/cpu (temp|temperature)|how hot|thermal/i.test(msg)) {
    const d = await sysCall('/api/temp');
    return d.success
      ? `🌡️ CPU Temperature: **${d.current_c}°C** (Source: ${d.source})`
      : `⚠️ Temperature: ${d.error}`;
  }

  // ── WHATSAPP ──
  const waMatch = normalizeMessagingText(raw).match(/whatsapp\s+(\+?\d[\d\s-]{7,}\d)(?:\s+(.+))?/i);
  if (waMatch) {
    if (!waMatch[2]?.trim()) {
      return `I have the WhatsApp number **${waMatch[1].trim()}**, Sir. Tell me the message as: **whatsapp ${waMatch[1].trim()} your message**.`;
    }
    appendMessage('jarvis', `📱 Opening WhatsApp Web...`);
    const d = await sysCall('/api/whatsapp', { phone: waMatch[1].trim(), message: waMatch[2].trim() });
    return d.success
      ? `📱 WhatsApp message queued to **${waMatch[1]}**, Sir.`
      : `⚠️ WhatsApp: ${d.error}`;
  }


  // ── PERSISTENT MEMORY ──
  // "remember my name is Tony" / "remember favorite_color is gold"
  const remMatch = raw.match(/^remember\s+(.+?)\s+is\s+(.+)/i);
  if (remMatch) {
    const key = remMatch[1].trim(), val = remMatch[2].trim();
    const d = await sysCall('/api/memory/set', { key, value: val });
    return d.success
      ? `🧠 Noted, Sir. I'll remember that **${key}** is **${val}**.`
      : `⚠️ Memory error: ${d.error}`;
  }

  // "recall my name" / "what is favorite_color"
  const recallMatch = raw.match(/^(?:recall|retrieve|what is|what's)\s+(?:my\s+)?(.+)/i);
  if (recallMatch && !/weather|forecast|time|date/.test(recallMatch[1])) {
    const key = recallMatch[1].trim();
    const d = await sysCall('/api/memory/get', { key });
    return d.success
      ? `🧠 I remember: **${d.key}** is **${d.value}** *(stored ${d.stored_at})*, Sir.`
      : `I have no memory of "${key}", Sir. Would you like me to remember something?`;
  }

  // "show my memories" / "list memories"
  if (/show (my )?memories|list memories|what do you remember/i.test(msg)) {
    const d = await sysCall('/api/memory/list');
    if (!d.success) return `⚠️ Memory error: ${d.error}`;
    if (d.count === 0) return `🧠 My memory banks are empty, Sir. Tell me something to remember.`;
    const rows = d.memories.map(m => `> **${m.key}**: ${m.value}`).join('\n');
    return `🧠 **${d.count} stored memories:**\n${rows}`;
  }

  // "forget my name" / "forget favorite_color"
  const forgetMatch = raw.match(/^forget\s+(?:my\s+)?(.+)/i);
  if (forgetMatch) {
    const key = forgetMatch[1].trim();
    const d = await sysCall('/api/memory/forget', { key });
    return d.success
      ? `🧠 Done. I've forgotten **${d.forgotten}**, Sir.`
      : `⚠️ ${d.error}`;
  }

  // ── FILE OPERATIONS ──
  // "create file notes.txt hello world"
  const createFileMatch = raw.match(/^create (?:a )?file\s+(\S+\.?\w*)\s*(.*)/i);
  if (createFileMatch) {
    const filename = createFileMatch[1], content = createFileMatch[2].trim();
    const d = await sysCall('/api/file', { action: 'create', filename, content });
    return d.success
      ? `📄 Created **${filename}** on your Desktop, Sir.`
      : `⚠️ File error: ${d.error}`;
  }

  // "read file notes.txt"
  const readFileMatch = raw.match(/^read (?:file\s+)?(\S+\.?\w*)/i);
  if (readFileMatch && !/weather|news|email/.test(readFileMatch[1])) {
    const filename = readFileMatch[1];
    const d = await sysCall('/api/file', { action: 'read', filename });
    return d.success
      ? `📄 **${filename}** contents:\n\`\`\`\n${d.content.slice(0, 1500)}\n\`\`\``
      : `⚠️ ${d.error}`;
  }

  // "list desktop files"
  if (/list (desktop )?files|what files.*desktop|desktop files/i.test(msg)) {
    const d = await sysCall('/api/file', { action: 'list', filename: '' });
    return d.success
      ? `📂 **${d.count} files on Desktop:**\n${d.files.slice(0, 20).map(f => `> ${f}`).join('\n')}`
      : `⚠️ ${d.error}`;
  }

  // "append to file notes.txt hello again"
  const appendFileMatch = raw.match(/^append\s+to\s+(?:file\s+)?(\S+\.?\w*)\s+(.+)/i);
  if (appendFileMatch) {
    const filename = appendFileMatch[1], content = appendFileMatch[2];
    const d = await sysCall('/api/file', { action: 'append', filename, content });
    return d.success
      ? `📄 Appended to **${filename}**, Sir.`
      : `⚠️ File error: ${d.error}`;
  }

  // ── GEMINI LIVE CAMERA ──
  if (/look at this|what do you see|describe (what|the scene|what you see)|use (the )?camera|gemini live|visual (scan|mode)/i.test(msg)) {
    appendMessage('jarvis', '📷 Activating webcam and connecting to Gemini Vision...');
    const customPrompt = raw.replace(/look at this|use (the )?camera|gemini live|visual (scan|mode)/i, '').trim()
      || 'Describe everything you see in this image in detail, as JARVIS would report it to Tony Stark.';
    const d = await sysCall('/api/camera/describe', { api_key: API_KEY, prompt: customPrompt });
    return d.success
      ? `📷 **Visual Analysis:**\n${d.description}`
      : `⚠️ Camera error: ${d.error}`;
  }

  // ── YOLO OBJECT DETECTION ──
  if (/detect (objects|things)|what.*objects|yolo|object detection|what can you see|scan (the )?room/i.test(msg)) {
    appendMessage('jarvis', '🎯 Running YOLO object detection — scanning environment...');
    const d = await sysCall('/api/camera/detect', {});
    if (!d.success) return `⚠️ Detection error: ${d.error}`;
    const topItems = (d.detections || []).slice(0, 8)
      .map(x => `> 🔹 **${x.object}** — ${Math.round(x.confidence * 100)}% confidence`)
      .join('\n');
    return `🎯 **Detection Report:**\n${topItems || '> No objects detected.'}\n\n${d.summary}`;
  }

  // ── REAL-TIME WEB BROWSE ──
  // "browse github.com" / "open website bbc.com" / "summarize https://..."
  const browseMatch = raw.match(/^(?:browse|visit|open site|summarize(?: site| url| page)?|fetch)\s+(https?:\/\/\S+|\S+\.\S+\S*)/i);
  if (browseMatch) {
    const url = browseMatch[2];
    appendMessage('jarvis', `🌐 Fetching and analyzing **${url}**...`);
    const d = await sysCall('/api/browse', { url, api_key: state.apiKey });
    if (!d.success) return `⚠️ Browse error: ${d.error}`;
    if (d.summary) return `🌐 **${d.title}**\n\n${d.summary}\n\n> Source: [${url}](${url})`;
    return `🌐 **${d.title}**\n\n${d.content}\n\n> Source: [${url}](${url})`;
  }

  // ── REAL-TIME WEB SEARCH (DuckDuckGo) ──
  // "search for quantum computing" / "google climate change" / "look up best python libraries"
  const webSearchMatch = raw.match(/^(?:search(?:\s+for|\s+the\s+web\s+for|\s+online\s+for)?|google|look\s+up|find\s+info(?:rmation)?\s+(?:on|about)?)\s+(.+)/i);
  if (webSearchMatch) {
    const q = webSearchMatch[1].trim();
    appendMessage('jarvis', `🔍 Searching the web for **"${q}"**...`);
    const d = await sysCall('/api/search/web', { query: q });
    if (!d.success) return `⚠️ Search failed: ${d.error}`;
    let reply = `🔍 **Web Results for: "${q}"**\n\n`;
    if (d.abstract) reply += `> ${d.abstract}${d.abstract_url ? `\n> *Source: [${d.abstract_url}](${d.abstract_url})*` : ''}\n\n`;
    if (d.results && d.results.length) {
      reply += d.results.slice(0, 5).map((r, i) =>
        `**${i + 1}. ${r.title || 'Result'}**\n> ${r.snippet || ''}\n> 🔗 [${r.url}](${r.url})`
      ).join('\n\n');
    }
    if (!d.abstract && (!d.results || !d.results.length)) reply += `No results found, Sir. Try a different query.`;
    return reply;
  }

  // ── STOCK PRICE ──
  // "stock price AAPL" / "how is Tesla stock" / "check MSFT"
  const stockMatch = raw.match(/(?:stock\s+(?:price\s+)?|share\s+price\s+(?:of\s+)?|check\s+stock\s+)([A-Z]{1,5})|(?:how\s+is\s+)([A-Z]{2,5})\s+stock/i);
  if (stockMatch) {
    const sym = (stockMatch[1] || stockMatch[2]).toUpperCase();
    appendMessage('jarvis', `📈 Fetching live stock data for **${sym}**...`);
    const d = await sysCall('/api/stock', { symbol: sym });
    if (!d.success) return `⚠️ Stock error: ${d.error}`;
    const color = d.change >= 0 ? '📈' : '📉';
    return `${color} **${d.name} (${d.symbol})**\n> 💵 Price: **${d.currency} ${d.price}**\n> ${d.direction} Change: **${d.change} (${d.change_pct}%)** today\n> 🏛️ Exchange: ${d.exchange}`;
  }

  // ── CRYPTO PRICE ──
  // "bitcoin price" / "how much is ethereum" / "crypto dogecoin"
  const cryptoMatch = raw.match(/(?:crypto(?:currency)?\s+|price\s+of\s+|how\s+much\s+is\s+|check\s+)?(bitcoin|btc|ethereum|eth|solana|sol|dogecoin|doge|cardano|ada|ripple|xrp|litecoin|ltc|bnb|shiba|shib|tron|trx|avax|avalanche|polkadot|dot|chainlink|link)(?:\s+price)?/i);
  if (cryptoMatch) {
    const coin = cryptoMatch[1].toLowerCase();
    appendMessage('jarvis', `💰 Fetching live price for **${coin.toUpperCase()}**...`);
    const d = await sysCall('/api/crypto', { coin });
    if (!d.success) return `⚠️ Crypto error: ${d.error}`;
    const icon = d.change_24h >= 0 ? '📈' : '📉';
    return `${icon} **${d.name} Price**\n> 💵 USD: **$${d.price_usd.toLocaleString()}**\n> 🇮🇳 INR: **₹${d.price_inr.toLocaleString()}**\n> ${d.direction} 24h Change: **${d.change_24h}%**\n> 📊 Market Cap: $${(d.market_cap / 1e9).toFixed(2)}B`;
  }

  // ── DICTIONARY LOOKUP ──
  // "define serendipity" / "meaning of ephemeral" / "what does ubiquitous mean"
  const dictMatch = raw.match(/^(?:define|definition of|meaning of|what does\s+(.+?)\s+mean|lookup word)\s*(.+)?/i);
  if (dictMatch) {
    const word = (dictMatch[1] || dictMatch[2] || '').trim();
    if (word) {
      appendMessage('jarvis', `📖 Looking up **"${word}"** in the dictionary...`);
      const d = await sysCall('/api/dictionary', { word });
      if (!d.success) return `⚠️ ${d.error}`;
      let reply = `📖 **${d.word}** ${d.phonetic ? `*(${d.phonetic})*` : ''}\n\n`;
      reply += d.meanings.map(m => {
        const defs = m.definitions.map((def, i) => `> ${i + 1}. ${def}`).join('\n');
        const syns = m.synonyms.length ? `\n> *Synonyms: ${m.synonyms.join(', ')}*` : '';
        return `**${m.pos}**\n${defs}${syns}`;
      }).join('\n\n');
      return reply;
    }
  }

  // ── IP / GEOLOCATION ──
  // "what is my ip" / "ip address" / "where am I connected from" / "lookup ip 8.8.8.8"
  const ipMatch = raw.match(/(?:my\s+)?ip(?:\s+address)?|where\s+am\s+i\s+(?:connected|from)|lookup\s+ip\s+([\d.]+)/i);
  if (ipMatch) {
    const targetIp = ipMatch[1] || '';
    appendMessage('jarvis', `🌍 Resolving ${targetIp ? `**${targetIp}**` : 'your IP address'}...`);
    const d = await sysCall('/api/ip', { ip: targetIp });
    if (!d.success) return `⚠️ IP lookup failed: ${d.error}`;
    return `🌍 **IP Geolocation**\n> 🔌 IP: **${d.ip}**\n> 📍 Location: **${d.city}, ${d.region}, ${d.country}**\n> 📮 ZIP: ${d.zip}\n> 🌐 ISP: ${d.isp}\n> 🏢 Org: ${d.org}\n> 🗺️ Coordinates: ${d.lat}, ${d.lon}`;
  }

  return null; // not a system command
}



// ============================================================
// COMMAND ROUTER — handle local browser commands, else AI
// ============================================================
  // ── COMMAND ROUTER — handle local browser commands, else AI ──
async function routeCommand(raw) {
  // Pre-process: strip filler words and normalize
  const normalizedRaw = normalizeMessagingText(raw.trim());
  let cmd = normalizedRaw.toLowerCase();
  
  // Strip common prefixes/fillers
  const fillers = ["you ", "jarvis ", "please ", "can you ", "could you ", "hey ", "hi "];
  let stripped = false;
  do {
    stripped = false;
    for (const f of fillers) {
      if (cmd.startsWith(f)) {
        cmd = cmd.substring(f.length).trim();
        stripped = true;
      }
    }
  } while (stripped);

  const raw_stripped = normalizedRaw.substring(normalizedRaw.toLowerCase().indexOf(cmd));

  // 1. Time
  if (/\b(time|clock)\b/.test(cmd) && !/set/.test(cmd)) {
    const t = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    return `The current time is **${t}**, Sir.`;
  }
  // 2. Date
  if (/\b(today'?s?\s*date|what'?s?\s*the\s*date|day\s*is\s*it)\b/.test(cmd) || cmd === "what's today's date?") {
    const d = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    return `Today is **${d}**.`;
  }

  // 3. Open websites
  const siteMap = {
    google: 'https://google.com',
    youtube: '__YOUTUBE__',
    facebook: 'https://facebook.com',
    twitter: 'https://twitter.com',
    github: 'https://github.com',
    instagram: 'https://instagram.com',
    linkedin: 'https://linkedin.com',
    reddit: 'https://reddit.com',
    netflix: 'https://netflix.com',
    gmail: 'https://gmail.com',
    calendar: 'https://calendar.google.com',
    maps: 'https://maps.google.com',
    whatsapp: 'https://web.whatsapp.com',
  };
  for (const [site, url] of Object.entries(siteMap)) {
    if (cmd.includes(`open ${site}`) || cmd.includes(`go to ${site}`) || cmd === site) {
      if (url === '__YOUTUBE__') {
        openInYouTubeTab('https://www.youtube.com/');
      } else {
        window.open(url, '_blank');
      }
      return `Opening **${site.charAt(0).toUpperCase() + site.slice(1)}** for you, Sir.`;
    }
  }

  // 4. Calculator
  if (cmd.includes('calculator') || cmd.includes('calc')) {
    window.open('Calculator:///', '_blank');
    return 'Launching the calculator, Sir.';
  }

  // 5. Search
  if (/^(search|find|look up|google)\s+/i.test(cmd)) {
    const q = cmd.replace(/^(search|find|look up|google)\s+/i, '').trim();
    window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, '_blank');
    return `Searching Google for **"${q}"**, Sir.`;
  }

  // 6. Wikipedia
  if (cmd.includes('wikipedia')) {
    const q = cmd.replace(/.*wikipedia\s*(for|about)?\s*/i, '').trim();
    window.open(`https://en.wikipedia.org/wiki/${encodeURIComponent(q)}`, '_blank');
    return `Opening Wikipedia for **"${q}"**, Sir.`;
  }

  // 7. YouTube Search
  const ytSearchMatch = cmd.match(/^(?:search\s+(?:on\s+)?youtube(?:\s+for)?|youtube\s+search(?:\s+for)?|find(?:\s+.+)?\s+on\s+youtube|watch\s+on\s+youtube)\s+(.+)/i);
  if (ytSearchMatch) {
    const q = ytSearchMatch[1].trim();
    const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    openInYouTubeTab(ytUrl);
    return `🎬 Searching YouTube for **"${q}"** in your dedicated tab, Sir.`;
  }

  // 8. Play YouTube
  if (/^(play|listen to|put on|queue|watch)\s+(.+)/i.test(cmd)) {
    const song = cmd.match(/^(play|listen to|put on|queue|watch)\s+(.+)/i)[2].trim();
    const ytTab = window.open('', YT_TAB_NAME);
    if (ytTab) {
      ytTab.document.body.innerHTML = `<div style="background:#020b14;height:100vh;display:flex;align-items:center;justify-content:center;color:#00d4ff;font-family:sans-serif;"><h2>JARVIS is finding "${song}"...</h2></div>`;
    }
    if (backendOnline) {
      appendMessage('jarvis', `🔍 Finding best match for **"${song}"** on YouTube...`);
      const d = await sysCall('/api/youtube/play', { query: song });
      if (d.success) {
        if (ytTab) ytTab.location.href = d.url;
        else openInYouTubeTab(d.url);
        els.mpThumb.src             = `https://img.youtube.com/vi/${d.video_id}/hqdefault.jpg`;
        els.mpSongTitle.textContent = d.title || song;
        els.mpStatus.textContent    = 'PLAYING ON YOUTUBE';
        els.mediaPlayer.classList.add('active');
        return `🎵 Now playing **"${d.title}"** in your YouTube tab, Sir.`;
      }
    }
    const ytSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(song)}`;
    if (ytTab) ytTab.location.href = ytSearchUrl;
    else openInYouTubeTab(ytSearchUrl);
    return `🎬 Opened YouTube search for **"${song}"** in your dedicated tab, Sir.`;
  }

  // 9. Directions
  if (/directions?\s+to\s+(.+)/i.test(cmd)) {
    const dest = cmd.match(/directions?\s+to\s+(.+)/i)[1];
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`, '_blank');
    return `Getting directions to **${dest}**, Sir.`;
  }

  // 10. Weather
  if (cmd.includes('weather')) {
    const loc = cmd.replace(/weather\s*(in|for|at)?\s*/i, '').trim() || 'my location';
    window.open(`https://www.google.com/search?q=weather+${encodeURIComponent(loc)}`, '_blank');
    return `Fetching weather data for **${loc}**, Sir.`;
  }

  // ── MESSAGING COMMANDS ───────────────────────────────────────
  if (/\bwhatsapp\b/i.test(cmd) && /\+?[\d\s-]{8,}/.test(cmd)) {
    const phoneMatch = cmd.match(/\+?[\d\s-]{8,}/);
    const phone = phoneMatch[0].trim();
    const message = cmd
      .replace(/\b(?:send|message|msg|to|in|on|via|whatsapp)\b/gi, ' ')
      .replace(phoneMatch[0], ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!message) {
      return `I have the WhatsApp number **${phone}**, Sir. Tell me the message as: **whatsapp ${phone} your message**.`;
    }

    return sendMessage('whatsapp', phone, message);
  }

  const addContactMatch = cmd.match(/^(?:add|save|new|create)\s+contact\s+(.+)/i);
  const looksLikeMessagingCommand = /\b(?:send|message|msg|whatsapp|email|telegram|sms)\b/i.test(cmd);
  const implicitContactMatch = !addContactMatch && !looksLikeMessagingCommand && cmd.match(/(\+?[\d\s-]{10,})\s*,?\s*([a-z\s]{2,})|([a-z\s]{2,})\s*,?\s*(\+?[\d\s-]{10,})/i);

  if (addContactMatch || implicitContactMatch) {
    const input = addContactMatch ? addContactMatch[1].trim() : cmd.trim();
    const phoneMatch = input.match(/(\+?[\d\s-]{8,})/);
    let phone = "", name = "", email = "";

    if (phoneMatch) {
      phone = phoneMatch[0].trim();
      let remaining = input.replace(phone, '').replace(/,/g, ' ').trim();
      
      // Blacklist words that shouldn't be names
      const blacklist = ["send", "in", "whatsapp", "to", "on", "via", "msg", "message", "save", "contact"];
      const parts = remaining.split(/\s+/).filter(p => p.length > 0 && !blacklist.includes(p.toLowerCase()));
      
      const emailIdx = parts.findIndex(p => p.includes('@'));
      if (emailIdx !== -1) { email = parts[emailIdx]; parts.splice(emailIdx, 1); }
      name = parts.join(' ');
    }

    if (name && phone && phone.replace(/\D/g, '').length >= 8) {
      const cleanPhone = phone.replace(/\s+/g, '');
      addContact(name, cleanPhone, email);
      showToast(`✓ Contact "${name}" saved`);
      return `I've recognized that contact info, Sir. **${name}** has been saved with number ${phone}. You can now send them messages.`;
    }
    if (addContactMatch) return 'I need both a **name** and a **phone number**, Sir.';
  }

  // Delete contact
  if (/^(delete|remove)\s+contact\s+(.+)/i.test(cmd)) {
    const name = cmd.match(/^(delete|remove)\s+contact\s+(.+)/i)[2].trim().toLowerCase();
    const c = getContacts();
    if (!c[name]) return `No contact named "${name}" found, Sir.`;
    deleteContact(name);
    return `Contact **${name}** removed, Sir.`;
  }

  // List contacts
  if (/^(show|list|my)\s+contacts?$/i.test(cmd)) {
    const c = getContacts(); const keys = Object.keys(c);
    if (!keys.length) return 'No contacts saved yet.';
    document.getElementById('contactsModal').classList.add('open');
    renderContacts(); populateQsContact();
    return `Showing your ${keys.length} contact(s), Sir.`;
  }

  const genericSend = cmd.match(/^send\s+(.+?)\s+to\s+(.+)$/i);
  if (genericSend && !/\b(?:email|telegram|sms|whatsapp)\b/i.test(genericSend[2])) {
    const message = genericSend[1].trim();
    const name = genericSend[2].trim();
    const contact = lookupContact(name);

    if (contact?.phone) {
      return sendMessage('whatsapp', name, message);
    }

    return `I can send that once **${name}** is saved as a contact, Sir. Add them with: **add contact ${name} +91XXXXXXXXXX**.`;
  }

  // WhatsApp
  {
    const wa = cmd.match(/^send\s+(.+?)\s+to\s+(\S+)\s+(?:in|on|via)\s+whatsapp$/i)
             || cmd.match(/^(?:send\s+)?whatsapp\s+(?:to\s+)?(\S+)\s+(.+)/i)
             || cmd.match(/^(?:message|msg)\s+(\S+)\s+(?:on|via)\s+whatsapp(?:\s+(.+))?$/i);
    if (wa) {
      const isInv = /^send\s+.+\s+to\s+\S+\s+(?:in|on|via)\s+whatsapp$/i.test(cmd);
      const name = isInv ? wa[2] : wa[1];
      const msg  = isInv ? wa[1] : (wa[2] || '');
      return sendMessage('whatsapp', name, msg);
    }
  }

  // Other messaging...
  if (/^(send\s+)?email\s+(to\s+)?(\S+)(\s+.+)?/i.test(cmd)) {
    const m = cmd.match(/^(send\s+)?email\s+(to\s+)?(\S+)(\s+.+)?/i);
    return sendMessage('email', m[3], (m[4] || '').trim());
  }
  if (/^(send\s+)?telegram\s+(to\s+)?(\S+)\s+(.+)/i.test(cmd)) {
    const m = cmd.match(/^(send\s+)?telegram\s+(to\s+)?(\S+)\s+(.+)/i);
    return sendMessage('telegram', m[3], m[4]);
  }
  if (/^(send\s+)?sms\s+(to\s+)?(\S+)\s+(.+)/i.test(cmd)) {
    const m = cmd.match(/^(send\s+)?sms\s+(to\s+)?(\S+)\s+(.+)/i);
    return sendMessage('sms', m[3], m[4]);
  }

  // Notes & Reminders
  if (/^(make a note|take a note|note that|note:)\s*/i.test(cmd)) {
    const noteText = cmd.replace(/^(make a note|take a note|note that|note:)\s*/i, '').trim();
    if (noteText) {
      const notes = JSON.parse(localStorage.getItem('jarvis_notes') || '[]');
      notes.unshift({ text: noteText, time: Date.now() });
      localStorage.setItem('jarvis_notes', JSON.stringify(notes));
      return `Note saved: *"${noteText}"*.`;
    }
  }
  if (/show notes|my notes|list notes/i.test(cmd)) {
    const notes = JSON.parse(localStorage.getItem('jarvis_notes') || '[]');
    if (!notes.length) return 'You have no saved notes, Sir.';
    return '**Your Notes:**\n' + notes.map((n, i) => `${i + 1}. ${n.text}`).join('\n');
  }

  // Greetings
  if (/^(hello|hi|hey|greetings|good (morning|afternoon|evening))/i.test(cmd)) {
    return `${getGreeting()} How can I assist you today?`;
  }

  return null;
}


// ============================================================
// GEMINI API
// ============================================================

  // gemini-2.5-flash: latest model with best reasoning
  async function askGemini(userMessage) {

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: userMessage
    })
  });

  const data = await response.json();

  if (!data.success) {
    return `⚠️ ${data.error}`;
  }

  return data.reply;
}

// ============================================================
// MAIN PROCESS MESSAGE
// ============================================================
async function processMessage(userText) {
  if (!userText.trim() || state.isProcessing) return;
  state.isProcessing = true;

  appendMessage('user', userText);
  state.chatHistory.push({ role: 'user', text: userText });
  addLog(`User: ${userText.substring(0, 40)}${userText.length > 40 ? '...' : ''}`);

  state.queryCount++;
  els.queryCount.textContent = state.queryCount;
  setTyping(true);
  setReactorState('processing');

  let response;
  try {
    // 1. Try system commands (no AI needed, instant)
    const sys = await routeSystemCommand(userText);
    if (sys !== null) {
      response = sys;
    // 2. Try local browser commands
    } else {
      const local = await routeCommand(userText);
      if (local !== null) {
        response = local;
      } else {
        // 3. Fall through to Gemini AI
        response = await askGemini(userText);
      }
    }
  } catch (err) {
    response = `⚠️ I encountered an error, Sir: *${err.message}*. Please check your connection or API key.`;
    addLog(`Error: ${err.message}`);
  }

  setTyping(false);
  setReactorState('idle');

  if (response) {
    appendMessage('jarvis', response);
    state.chatHistory.push({ role: 'jarvis', text: response });
    addLog(`JARVIS: ${response.replace(/<[^>]*>/g, '').substring(0, 40)}...`);
    if (state.autoSpeak) {
      speak(response);
    } else {
      // Not speaking, safe to restart listening immediately
      scheduleRestart(300);
    }
  } else {
    // No response, restart listening
    scheduleRestart(300);
  }

  state.isProcessing = false;
}

function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

// ============================================================
// SPEECH RECOGNITION — Always-On Mode
// ============================================================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

// Auto-listen state — persisted
state.autoListen = localStorage.getItem('jarvis_autolisten') === 'true';

function updateMicUI() {
  if (state.autoListen) {
    els.micBtn.classList.add('always-on');
    els.micBtn.title = 'Always-On Listening: ACTIVE (click to disable)';
    els.voiceStatus.textContent = state.isListening ? 'ACTIVE' : 'AUTO';
  } else {
    els.micBtn.classList.remove('always-on');
    els.micBtn.title = 'Click to speak';
    els.voiceStatus.textContent = state.isListening ? 'ACTIVE' : 'STANDBY';
  }
}

function startListening() {
  if (!recognition || state.isListening || state.isSpeaking || state.isProcessing) return;
  try { recognition.start(); } catch(e) { /* already running */ }
}

function scheduleRestart(ms = 800) {
  if (!state.autoListen) return;
  setTimeout(() => {
    // Only restart if JARVIS isn't speaking or processing
    if (!state.isSpeaking && !state.isProcessing && !state.isListening) {
      startListening();
    }
  }, ms);
}

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;    // one utterance at a time — cleaner
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    state.isListening = true;
    els.micBtn.classList.add('active');
    setReactorState('listening');
    els.textInput.placeholder = state.autoListen ? '🎙 Always listening...' : 'Listening...';
    updateMicUI();
  };

  recognition.onend = () => {
    state.isListening = false;
    els.micBtn.classList.remove('active');
    els.textInput.placeholder = 'Awaiting your command, Sir...';
    if (!state.isSpeaking && !state.isProcessing) setReactorState('idle');
    updateMicUI();
    // Auto-restart if always-on mode is on and not currently busy
    scheduleRestart(600);
  };

  recognition.onerror = (e) => {
    state.isListening = false;
    els.micBtn.classList.remove('active');
    els.textInput.placeholder = 'Awaiting your command, Sir...';
    if (!state.isProcessing) setReactorState('idle');
    // Suppress no-speech errors in always-on mode (normal when quiet)
    if (e.error !== 'aborted' && e.error !== 'no-speech') {
      addLog(`Voice error: ${e.error}`);
    }
    updateMicUI();
    // Restart even after errors in always-on mode
    scheduleRestart(1200);
  };

  recognition.onresult = (e) => {
    const transcript = e.results[e.resultIndex][0].transcript.trim();
    if (!transcript) return;
    els.textInput.value = transcript;
    processMessage(transcript);
    els.textInput.value = '';
  };
} else {
  els.micBtn.title = 'Voice recognition not supported in this browser';
  els.micBtn.style.opacity = '0.3';
}

// ============================================================
// EVENT LISTENERS
// ============================================================
// Send button / Enter key
els.sendBtn.addEventListener('click', () => {
  const txt = els.textInput.value.trim();
  if (txt) { processMessage(txt); els.textInput.value = ''; }
});
els.textInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const txt = els.textInput.value.trim();
    if (txt) { processMessage(txt); els.textInput.value = ''; }
  }
});

// Mic button — toggles always-on mode
els.micBtn.addEventListener('click', () => {
  if (!recognition) return;

  if (!state.autoListen) {
    // Turn ON always-listen mode
    state.autoListen = true;
    localStorage.setItem('jarvis_autolisten', 'true');
    addLog('Always-On listening enabled');
    updateMicUI();
    startListening(); // start immediately
  } else {
    // Turn OFF always-listen mode
    state.autoListen = false;
    localStorage.setItem('jarvis_autolisten', 'false');
    if (state.isListening) recognition.stop();
    setReactorState('idle');
    els.voiceStatus.textContent = 'STANDBY';
    addLog('Always-On listening disabled');
    updateMicUI();
  }
});

// Speaker toggle
els.speakerBtn.addEventListener('click', () => {
  state.autoSpeak = !state.autoSpeak;
  localStorage.setItem('jarvis_autospeak', state.autoSpeak);
  els.speakerBtn.classList.toggle('active', state.autoSpeak);
  els.speakerBtn.querySelector('i').className = `fas fa-volume-${state.autoSpeak ? 'up' : 'mute'}`;
  addLog(`Auto-speak ${state.autoSpeak ? 'enabled' : 'disabled'}`);
});

// Clear chat
function clearChat() {
  els.chatMessages.innerHTML = '';
  state.chatHistory = [];
  addLog('Chat cleared');
  appendMessage('jarvis', `${getGreeting()} All systems reset. How may I assist you?`);
}
els.clearBtn.addEventListener('click', clearChat);

// Media Player controls
function _focusYtTab() {
  if (_ytTab && !_ytTab.closed) {
    try { _ytTab.focus(); } catch (_) {}
  } else if (_currentVideoUrl) {
    _ytTab = window.open(_currentVideoUrl, '_blank');
  }
}
els.mpOpen.addEventListener('click', _focusYtTab);
els.mpPlayBtn.addEventListener('click', _focusYtTab);
els.mpClose.addEventListener('click', closeMediaPlayer);


// Quick command buttons
els.quickGrid.addEventListener('click', e => {
  const btn = e.target.closest('.q-btn');
  if (!btn) return;
  const cmd = btn.dataset.cmd;
  processMessage(cmd);
});

// Settings modal
els.settingsBtn.addEventListener('click', () => {
  els.settingsModal.classList.add('open');
  els.apiKeyInput.value = state.apiKey;
  els.speechRate.value = state.speechRate;
  els.speechRateVal.textContent = state.speechRate.toFixed(1);
  els.autoSpeak.checked = state.autoSpeak;
  loadVoices();
});
els.closeSettings.addEventListener('click', () => els.settingsModal.classList.remove('open'));
els.settingsModal.addEventListener('click', e => {
  if (e.target === els.settingsModal) els.settingsModal.classList.remove('open');
});

// Toggle API key visibility
els.toggleApiKey.addEventListener('click', () => {
  const input = els.apiKeyInput;
  const isPass = input.type === 'password';
  input.type = isPass ? 'text' : 'password';
  els.toggleApiKey.querySelector('i').className = `fas fa-eye${isPass ? '-slash' : ''}`;
});

// Speech rate slider
els.speechRate.addEventListener('input', () => {
  els.speechRateVal.textContent = parseFloat(els.speechRate.value).toFixed(1);
});

// Save settings
els.saveSettings.addEventListener('click', () => {
  state.apiKey     = els.apiKeyInput.value.trim();
  state.speechRate = parseFloat(els.speechRate.value);
  state.voiceName  = els.voiceSelect.value;
  state.autoSpeak  = els.autoSpeak.checked;

  localStorage.setItem('jarvis_api_key',   state.apiKey);
  localStorage.setItem('jarvis_rate',      state.speechRate);
  localStorage.setItem('jarvis_voice',     state.voiceName);
  localStorage.setItem('jarvis_autospeak', state.autoSpeak);

  els.settingsModal.classList.remove('open');
  addLog('Configuration saved');

  const saved = appendMessage('jarvis', '✅ Configuration saved successfully, Sir. All systems updated.');
  if (state.autoSpeak) speak('Configuration saved successfully, Sir.');
});

// ── Contacts Modal ──
const contactsModal  = document.getElementById('contactsModal');
const contactsBtn    = document.getElementById('contactsBtn');
const closeContacts  = document.getElementById('closeContacts');
const addContactBtn  = document.getElementById('addContactBtn');
const qsSendBtn      = document.getElementById('qsSendBtn');

contactsBtn.addEventListener('click', () => {
  contactsModal.classList.add('open');
  renderContacts();
  populateQsContact();
});
closeContacts.addEventListener('click', () => contactsModal.classList.remove('open'));
contactsModal.addEventListener('click', e => { if (e.target === contactsModal) contactsModal.classList.remove('open'); });

addContactBtn.addEventListener('click', () => {
  const name  = document.getElementById('cName').value.trim();
  const phone = document.getElementById('cPhone').value.trim();
  const email = document.getElementById('cEmail').value.trim();
  if (!name || !phone) { showToast('⚠ Name and phone are required'); return; }
  addContact(name, phone, email);
  document.getElementById('cName').value  = '';
  document.getElementById('cPhone').value = '';
  document.getElementById('cEmail').value = '';
  showToast(`✓ Contact "${name}" saved`);
});

qsSendBtn.addEventListener('click', () => {
  const key     = document.getElementById('qsContact').value;
  const app     = document.getElementById('qsApp').value;
  const message = document.getElementById('qsMessage').value.trim();
  if (!key)     { showToast('⚠ Select a contact first'); return; }
  if (!message) { showToast('⚠ Type a message first');  return; }
  const contact = getContacts()[key];
  if (!contact)  { showToast('⚠ Contact not found'); return; }
  const url = buildUrl(app, contact, message);
  if (!url)      { showToast('⚠ No phone/email for this app'); return; }
  window.open(url, '_blank');
  showToast(`✓ Opening ${app} to ${contact.name}`);
  document.getElementById('qsMessage').value = '';
});

// Speaker button initial state
els.speakerBtn.classList.toggle('active', state.autoSpeak);
if (!state.autoSpeak) {
  els.speakerBtn.querySelector('i').className = 'fas fa-volume-mute';
}

// ============================================================
// INIT — Boot sequence
// ============================================================
(async function boot() {
  await delay(800);
  const greeting = getGreeting();
 const intro = `${greeting} JARVIS is online and fully operational.\n\nAll systems nominal. AI core connected via Gemini.\n\nHow may I assist you today?`;
  appendMessage('jarvis', intro);
  state.chatHistory.push({ role: 'jarvis', text: intro });
  addLog('JARVIS boot sequence complete');

  if (state.autoSpeak) {
    await delay(300);
    speak(`${greeting} JARVIS is online and fully operational. How may I assist you today?`);
  }
})();


// ============================================================
// REAL-TIME SEARCH SUGGESTIONS — YouTube & Google
// ============================================================
(function initSuggestions() {
  const BACKEND = 'http://127.0.0.1:5501';
  let _debounceTimer = null;
  let _selectedIdx   = -1;
  let _suggestions   = [];
  let _currentSource = 'google';

  // ── Build suggestion dropdown ──────────────────────────────
  const box = document.createElement('div');
  box.id = 'jarvis-suggest-box';
  Object.assign(box.style, {
    position:       'fixed',
    background:     'rgba(3, 8, 20, 0.97)',
    border:         '1px solid rgba(0, 212, 255, 0.35)',
    borderRadius:   '14px',
    padding:        '6px 0',
    zIndex:         '99999',
    display:        'none',
    backdropFilter: 'blur(24px)',
    boxShadow:      '0 8px 40px rgba(0,200,255,0.18), 0 0 0 1px rgba(0,200,255,0.08)',
    overflow:       'hidden',
    transition:     'opacity 0.15s',
  });
  document.body.appendChild(box);

  // Inject keyframe + item CSS once
  const style = document.createElement('style');
  style.textContent = `
    #jarvis-suggest-box .sug-header {
      padding: 5px 14px 5px;
      font-size: 10px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: rgba(0,212,255,0.45);
      border-bottom: 1px solid rgba(0,212,255,0.1);
      margin-bottom: 3px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    #jarvis-suggest-box .sug-item {
      padding: 9px 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13.5px;
      color: rgba(200, 230, 255, 0.88);
      border-left: 2px solid transparent;
      transition: background 0.12s, border-color 0.12s, color 0.12s;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #jarvis-suggest-box .sug-item:hover,
    #jarvis-suggest-box .sug-item.sug-active {
      background: rgba(0, 212, 255, 0.08);
      color: #00d4ff;
    }
    #jarvis-suggest-box .sug-item.yt-item:hover,
    #jarvis-suggest-box .sug-item.yt-item.sug-active {
      border-left-color: #ff4444;
      color: #ff6666;
    }
    #jarvis-suggest-box .sug-item.gg-item:hover,
    #jarvis-suggest-box .sug-item.gg-item.sug-active {
      border-left-color: #4285f4;
      color: #74a9ff;
    }
    #jarvis-suggest-box .sug-icon { font-size: 11px; opacity: 0.65; flex-shrink: 0; }
    #jarvis-suggest-box .sug-text { overflow: hidden; text-overflow: ellipsis; }
    #jarvis-suggest-box .sug-action {
      margin-left: auto;
      font-size: 10px;
      opacity: 0;
      color: rgba(0,212,255,0.5);
      flex-shrink: 0;
      transition: opacity 0.12s;
    }
    #jarvis-suggest-box .sug-item:hover .sug-action,
    #jarvis-suggest-box .sug-item.sug-active .sug-action { opacity: 1; }
  `;
  document.head.appendChild(style);

  // ── Helpers ───────────────────────────────────────────────
  function getInput()  { return document.getElementById('textInput'); }
  function getSendBtn(){ return document.getElementById('sendBtn'); }

  function hide() {
    box.style.display = 'none';
    _selectedIdx = -1;
    _suggestions = [];
  }

  function positionBox(inputEl) {
    const r = inputEl.getBoundingClientRect();
    const boxH = Math.min(_suggestions.length * 42 + 44, 340);
    const spaceAbove = r.top;
    const spaceBelow = window.innerHeight - r.bottom;

    box.style.width = r.width + 'px';
    box.style.left  = r.left + 'px';

    if (spaceBelow >= boxH || spaceBelow >= spaceAbove) {
      // Show below
      box.style.top    = (r.bottom + 6) + 'px';
      box.style.bottom = 'auto';
    } else {
      // Show above
      box.style.bottom = (window.innerHeight - r.top + 6) + 'px';
      box.style.top    = 'auto';
    }
  }

  function setActive(idx) {
    _selectedIdx = idx;
    box.querySelectorAll('.sug-item').forEach((el, i) => {
      el.classList.toggle('sug-active', i === idx);
    });
  }

  function render(suggestions, source) {
    if (!suggestions.length) { hide(); return; }
    _suggestions   = suggestions;
    _currentSource = source;
    _selectedIdx   = -1;

    const isYT   = source === 'youtube';
    const icon   = isYT ? '▶' : '🔍';
    const label  = isYT ? 'YouTube' : 'Google';
    const cls    = isYT ? 'yt-item' : 'gg-item';
    const action = isYT ? 'Play ↵' : 'Search ↵';

    box.innerHTML = `
      <div class="sug-header">
        <span>${icon}</span>
        <span>${label} Suggestions</span>
      </div>
      ${suggestions.map((s, i) => `
        <div class="sug-item ${cls}" data-idx="${i}" data-text="${s.replace(/"/g, '&quot;')}">
          <span class="sug-icon">${icon}</span>
          <span class="sug-text">${s}</span>
          <span class="sug-action">${action}</span>
        </div>
      `).join('')}
    `;

    box.querySelectorAll('.sug-item').forEach(item => {
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        applySelection(item.dataset.text, source);
      });
    });

    box.style.display = 'block';
  }

  function applySelection(text, source) {
    const inp = getInput();
    if (!inp) return;
    hide();

    // Re-construct the command with the suggestion
    if (source === 'youtube') {
      inp.value = `play ${text}`;
    } else {
      inp.value = `search for ${text}`;
    }
    inp.focus();

    // Submit — trigger the send button
    const btn = getSendBtn();
    if (btn) {
      // Simulate Enter key to avoid bypassing validation
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    }
  }

  // ── Pattern detection ─────────────────────────────────────
  function detectIntent(val) {
    const v = val.trim();
    let m;
    // YouTube patterns
    m = v.match(/^(?:play|listen\s+to|put\s+on|queue|watch)\s+(.{2,})/i);
    if (m) return { query: m[1], source: 'youtube' };

    m = v.match(/^(?:search\s+(?:on\s+)?youtube(?:\s+for)?|youtube\s+search(?:\s+for)?)\s+(.{2,})/i);
    if (m) return { query: m[1], source: 'youtube' };

    m = v.match(/^find\s+(.{2,})\s+on\s+youtube/i);
    if (m) return { query: m[1], source: 'youtube' };

    // Google patterns
    m = v.match(/^(?:search(?:\s+for|\s+the\s+web\s+for|\s+online\s+for)?|google|look\s+up)\s+(.{2,})/i);
    if (m) return { query: m[1], source: 'google' };

    return null;
  }

  // ── Fetch suggestions from backend ────────────────────────
  async function fetchSuggestions(query, source) {
    try {
      const resp = await fetch(`${BACKEND}/api/suggest`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query, source }),
      });
      const d = await resp.json();
      return d.success ? d.suggestions : [];
    } catch { return []; }
  }

  // ── Wire up input ─────────────────────────────────────────
  function init() {
    const inp = getInput();
    if (!inp) { setTimeout(init, 400); return; }

    inp.addEventListener('input', () => {
      clearTimeout(_debounceTimer);
      const intent = detectIntent(inp.value);
      if (!intent || intent.query.length < 2) { hide(); return; }

      _debounceTimer = setTimeout(async () => {
        const sug = await fetchSuggestions(intent.query, intent.source);
        if (!document.activeElement || document.activeElement !== inp) return;
        positionBox(inp);
        render(sug, intent.source);
      }, 280);
    });

    inp.addEventListener('keydown', e => {
      if (box.style.display === 'none') return;
      const items = box.querySelectorAll('.sug-item');

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(Math.min(_selectedIdx + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(Math.max(_selectedIdx - 1, 0));
      } else if (e.key === 'Enter' && _selectedIdx >= 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const item = items[_selectedIdx];
        applySelection(item.dataset.text, _currentSource);
      } else if (e.key === 'Escape') {
        hide();
      }
    });

    inp.addEventListener('blur', () => {
      // Small delay so mousedown on suggestion fires first
      setTimeout(hide, 180);
    });

    window.addEventListener('resize', () => {
      if (box.style.display !== 'none') positionBox(inp);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 350);
  }
})();
