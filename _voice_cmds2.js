
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

  return null; // not a system command
}
