'use client';

import { useState, useEffect, useRef } from 'react';

// Configuration
const BACKEND = 'http://127.0.0.1:5501';

export default function JarvisApp() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [systemStatus, setSystemStatus] = useState('SYSTEM ONLINE');
  const [metrics, setMetrics] = useState({
    cpu: '0', ram: '0', bat: '100', disk: '0',
  });
  const [time, setTime] = useState('--:--:--');
  const [date, setDate] = useState('--- -- ----');
  const [mode, setMode] = useState('READY');
  const [voiceStatus, setVoiceStatus] = useState('STANDBY');
  const [sessionTime, setSessionTime] = useState('00:00');
  const [reactorState, setReactorState] = useState('IDLE');
  
  const chatEndRef = useRef(null);
  const sessionStartRef = useRef(Date.now());

  // Initialization & Timers
  useEffect(() => {
    appendMessage('jarvis', 'Good afternoon, Sir. JARVIS is online and fully operational.\n\nAll systems nominal. AI core connected.\n\nHow may I assist you today?');

    const timer = setInterval(() => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-US', { hour12: false }));
      setDate(now.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase());
      
      const elapsed = Math.floor((Date.now() - sessionStartRef.current) / 1000);
      const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const s = String(elapsed % 60).padStart(2, '0');
      setSessionTime(`${m}:${s}`);
    }, 1000);

    fetchSystemStats();
    const statsTimer = setInterval(fetchSystemStats, 10000);

    return () => {
      clearInterval(timer);
      clearInterval(statsTimer);
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const fetchSystemStats = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/status`);
      const data = await res.json();
      if (data.success) {
        setMetrics({
          cpu: data.cpu_percent,
          ram: data.ram_percent,
          disk: data.disk_percent,
          bat: data.battery.percent,
        });
      }
    } catch (e) {
      console.log('Backend not reachable:', e);
    }
  };

  const appendMessage = (sender, text) => {
    setMessages(prev => [...prev, { id: Date.now() + Math.random(), sender, text }]);
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setInput('');
    appendMessage('you', userMsg);
    setIsTyping(true);
    setReactorState('PROCESSING');

    // Simulate basic command routing (Weather example)
    let reply = '';
    try {
      if (/\b(weather|forecast)\b/i.test(userMsg)) {
        const wm = userMsg.match(/(?:weather|forecast)\s+(?:in|for|at)?\s+(.+)/i);
        const city = wm ? wm[1].trim() : 'auto';
        const res = await fetch(`${BACKEND}/api/weather/real`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ city })
        });
        const d = await res.json();
        if (d.success) {
          reply = `**Weather in ${d.city}:**\n> 🌡️ **${d.temp_c}°C** — ${d.description}\n> 🤔 Feels like **${d.feels_like_c}°C** · 💧 Humidity **${d.humidity}%**`;
        } else {
          reply = `⚠️ Weather error: ${d.error}`;
        }
      } else {
        // Mocking a general reply since full Gemini context needs API Key setup
        reply = `I received your command: "${userMsg}". (Gemini API integration pending in Next.js port)`;
      }
    } catch (e) {
      reply = `Error connecting to backend: ${e.message}`;
    }

    setIsTyping(false);
    setReactorState('IDLE');
    appendMessage('jarvis', reply);
  };

  const formatText = (text) => {
    // Basic markdown formatting for bold and newlines
    let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\n/g, '<br/>');
    return { __html: html };
  };

  return (
    <div className="app">
      <div className="bg-grid"></div>
      
      {/* HEADER */}
      <header className="hdr">
        <div>
          <div className="logo">J.A.R.V.I.S</div>
          <div className="logo-sub">JUST A RATHER VERY INTELLIGENT SYSTEM</div>
        </div>
        <div className="hdr-center">
          <span className="status-dot"></span>
          <span style={{ fontSize: '0.7rem', letterSpacing: '2px' }}>{systemStatus}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="time">{time}</div>
          <div className="date">{date}</div>
        </div>
        <button className="icon-btn"><i className="fas fa-cog"></i></button>
      </header>

      {/* MAIN */}
      <main className="main">
        {/* LEFT PANEL */}
        <aside className="side">
          <div className="card">
            <div className="panel-title">SYSTEM METRICS</div>
            <div className="metric-row"><span className="metric-lbl">CPU</span><span className="metric-val">{metrics.cpu}%</span></div>
            <div className="metric-row"><span className="metric-lbl">RAM</span><span className="metric-val">{metrics.ram}%</span></div>
            <div className="metric-row"><span className="metric-lbl">BATTERY</span><span className="metric-val">{metrics.bat}%</span></div>
            <div className="metric-row"><span className="metric-lbl">SESSION</span><span className="metric-val">{sessionTime}</span></div>
            <div className="metric-row"><span className="metric-lbl">STATUS</span><span className="metric-val accent">{mode}</span></div>
          </div>

          <div className="card">
            <div className="panel-title">QUICK COMMANDS</div>
            <div className="q-grid">
              <button className="q-btn" onClick={() => setInput('What time is it?')}><i className="fas fa-clock"></i><span>Time</span></button>
              <button className="q-btn" onClick={() => setInput('Weather in Bangalore')}><i className="fas fa-cloud-sun"></i><span>Weather</span></button>
              <button className="q-btn" onClick={() => setInput('System status')}><i className="fas fa-microchip"></i><span>Status</span></button>
              <button className="q-btn" onClick={() => setInput('Tell me a joke')}><i className="fas fa-laugh"></i><span>Joke</span></button>
            </div>
          </div>
        </aside>

        {/* CENTER PANEL */}
        <div className="center">
          {/* ARC REACTOR */}
          <div className="reactor-wrap">
            <div className="reactor">
              <div className="r-orbit"></div>
              <div className="r-orbit" style={{ animationDirection: 'reverse', borderStyle: 'dashed', inset: '10px' }}></div>
              <div className="r-orbit" style={{ animationDuration: '2s', inset: '20px' }}></div>
              <div className="r-core"></div>
              <div className="r-dot"></div>
            </div>
            <div className="reactor-label">{reactorState}</div>
            <div className={`waveform ${isTyping ? 'active' : ''}`}>
               {[...Array(15)].map((_, i) => <div key={i} className="w-bar"></div>)}
            </div>
          </div>

          {/* CHAT */}
          <div className="card chat-card">
            <div className="chat-head">
              <div className="panel-title" style={{ margin: 0, border: 'none' }}>COMMUNICATION CHANNEL</div>
              <button className="icon-btn" onClick={() => setMessages([])}><i className="fas fa-trash"></i></button>
            </div>
            <div className="chat-msgs">
              {messages.map((m) => (
                <div key={m.id} className={`msg ${m.sender === 'you' ? 'you' : ''}`}>
                  <div className="msg-avatar">
                    <i className={`fas ${m.sender === 'you' ? 'fa-user' : 'fa-robot'}`}></i>
                  </div>
                  <div className="msg-body">
                    <div className="msg-name">{m.sender === 'you' ? 'YOU' : 'JARVIS'}</div>
                    <div className="msg-text" dangerouslySetInnerHTML={formatText(m.text)}></div>
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="typing visible">
                  <div className="t-dot"></div><div className="t-dot"></div><div className="t-dot"></div>
                  <span>Processing...</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* INPUT */}
          <div className="input-zone">
            <div className="input-wrap">
              <span className="input-prefix">&gt;_</span>
              <input 
                type="text" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Awaiting your command, Sir..."
              />
              <button className={`mic-btn ${voiceStatus === 'LISTENING' ? 'listening' : ''}`} onClick={() => setVoiceStatus(v => v === 'STANDBY' ? 'LISTENING' : 'STANDBY')}>
                <i className="fas fa-microphone"></i>
              </button>
              <button className="send-btn" onClick={handleSend}>
                <i className="fas fa-paper-plane"></i>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <aside className="side">
          <div className="card">
            <div className="panel-title">CAPABILITIES</div>
            <div className="cap-item"><i className="fas fa-brain"></i>AI Conversations</div>
            <div className="cap-item"><i className="fas fa-microphone"></i>Voice Commands</div>
            <div className="cap-item"><i className="fas fa-search"></i>Web Search</div>
            <div className="cap-item"><i className="fas fa-code"></i>Code Assistant</div>
            <div className="cap-item"><i className="fas fa-sticky-note"></i>Notes & Reminders</div>
          </div>
          <div className="card" style={{ flex: 1 }}>
            <div className="panel-title">ACTIVITY LOG</div>
            <div className="log">
              <div className="log-entry">
                <span className="log-time">{time}</span>
                <span className="log-text">System initialized in React.</span>
              </div>
              {messages.filter(m => m.sender === 'you').map(m => (
                <div key={m.id} className="log-entry">
                  <span className="log-time">{new Date().toLocaleTimeString('en-US', {hour12:false, hour:'2-digit', minute:'2-digit'})}</span>
                  <span className="log-text">{m.text}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
