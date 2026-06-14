  // ── WIKIPEDIA ──
  if (/^(wiki|wikipedia|what is|who is|tell me about)\s+(.+)/i.test(msg)) {
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
    return d.success
      ? `**Weather in ${d.city}:**\n> 🌡️ ${d.temp_c}°C / ${d.temp_f}°F — ${d.description}\n> Feels like ${d.feels_like_c}°C · Humidity ${d.humidity}% · Wind ${d.wind_kmph} km/h`
      : `⚠️ Weather: ${d.error}`;
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
  const waMatch = raw.match(/whatsapp\s+(\+\d+)\s+(.+)/i);
  if (waMatch) {
    appendMessage('jarvis', `📱 Opening WhatsApp Web...`);
    const d = await sysCall('/api/whatsapp', { phone: waMatch[1], message: waMatch[2] });
    return d.success
      ? `📱 WhatsApp message queued to **${waMatch[1]}**, Sir.`
      : `⚠️ WhatsApp: ${d.error}`;
  }

  return null; // not a system command
}
