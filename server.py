# ============================================================
# J.A.R.V.I.S â€” Local System Control Server
# server.py â€” Flask backend for real system access
# Run: python server.py
# ============================================================

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import subprocess
import psutil
import os
import platform
import json
import time
import threading
import urllib.request
import urllib.parse
import re

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)  # Allow browser to call this API

# ============================================================
# CLOUD DEPLOYMENT HELPER (Serve UI from Python)
# ============================================================
@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('.', filename)

# ============================================================
# SYSTEM INFO
# ============================================================
@app.route('/api/status', methods=['GET'])
def system_status():
    """Full system diagnostic snapshot."""
    try:
        battery = psutil.sensors_battery()
        bat_info = {
            "percent": round(battery.percent, 1),
            "plugged": battery.power_plugged,
            "time_left": str(battery.secsleft // 3600) + "h " + str((battery.secsleft % 3600) // 60) + "m" if battery.secsleft > 0 else "Charging"
        } if battery else {"percent": "N/A", "plugged": True, "time_left": "N/A"}

        disk = psutil.disk_usage('/')
        net = psutil.net_io_counters()

        return jsonify({
            "success": True,
            "cpu_percent": psutil.cpu_percent(interval=0.5),
            "cpu_cores": psutil.cpu_count(),
            "ram_percent": psutil.virtual_memory().percent,
            "ram_used_gb": round(psutil.virtual_memory().used / (1024**3), 2),
            "ram_total_gb": round(psutil.virtual_memory().total / (1024**3), 2),
            "disk_percent": disk.percent,
            "disk_free_gb": round(disk.free / (1024**3), 1),
            "disk_total_gb": round(disk.total / (1024**3), 1),
            "battery": bat_info,
            "platform": platform.system(),
            "hostname": platform.node(),
            "net_sent_mb": round(net.bytes_sent / (1024**2), 1),
            "net_recv_mb": round(net.bytes_recv / (1024**2), 1),
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# OPEN APPLICATIONS
# ============================================================
APP_MAP = {
    "notepad":      "notepad.exe",
    "calculator":   "calc.exe",
    "paint":        "mspaint.exe",
    "explorer":     "explorer.exe",
    "task manager": "taskmgr.exe",
    "cmd":          "cmd.exe",
    "powershell":   "powershell.exe",
    "chrome":       "chrome",
    "firefox":      "firefox",
    "edge":         "msedge",
    "spotify":      "spotify",
    "discord":      "discord",
    "vscode":       "code",
    "word":         "winword",
    "excel":        "excel",
    "outlook":      "outlook",
    "teams":        "teams",
    "obs":          "obs64",
    "vlc":          "vlc",
    "snip":         "snippingtool",
}

@app.route('/api/open', methods=['POST'])
def open_app():
    """Open an application by name."""
    data = request.json or {}
    name = data.get('app', '').lower().strip()

    exe = APP_MAP.get(name, name)  # fallback: use name directly
    try:
        subprocess.Popen([exe], shell=True,
                         creationflags=subprocess.CREATE_NEW_CONSOLE if name == 'cmd' else 0)
        return jsonify({"success": True, "message": f"Launched {name}"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# RUN SHELL COMMAND
# ============================================================
@app.route('/api/run', methods=['POST'])
def run_command():
    """Execute a PowerShell command and return output."""
    data = request.json or {}
    command = data.get('command', '')
    if not command:
        return jsonify({"success": False, "error": "No command provided"}), 400

    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", command],
            capture_output=True, text=True, timeout=30
        )
        return jsonify({
            "success": True,
            "stdout": result.stdout.strip(),
            "stderr": result.stderr.strip(),
            "returncode": result.returncode
        })
    except subprocess.TimeoutExpired:
        return jsonify({"success": False, "error": "Command timed out after 30 seconds"}), 408
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# VOLUME CONTROL
# ============================================================
@app.route('/api/volume', methods=['POST'])
def volume_control():
    """Control system volume."""
    data = request.json or {}
    action = data.get('action', '').lower()  # up / down / mute / set
    level  = data.get('level', 10)           # for 'set' action

    ps_map = {
        "up":   "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys([char]175)",
        "down": "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys([char]174)",
        "mute": "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys([char]173)",
        "set":  f"$vol = {level}; (New-Object -ComObject WScript.Shell).SendKeys('')"
    }

    cmd = ps_map.get(action)
    if not cmd:
        return jsonify({"success": False, "error": f"Unknown action: {action}"}), 400

    try:
        subprocess.run(["powershell", "-Command", cmd], capture_output=True)
        return jsonify({"success": True, "action": action})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# SCREENSHOT
# ============================================================
@app.route('/api/screenshot', methods=['POST'])
def take_screenshot():
    """Take a screenshot and save to Desktop."""
    try:
        desktop = os.path.join(os.path.expanduser("~"), "Desktop")
        filename = f"JARVIS_screenshot_{int(time.time())}.png"
        filepath = os.path.join(desktop, filename)

        cmd = f"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen | Out-Null; $bmp = New-Object System.Drawing.Bitmap([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width, [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height); $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen(0,0,0,0,$bmp.Size); $bmp.Save('{filepath}'); $g.Dispose(); $bmp.Dispose()"
        subprocess.run(["powershell", "-Command",
            f"Add-Type -AssemblyName System.Windows.Forms,System.Drawing; "
            f"$b=New-Object System.Drawing.Bitmap([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width,[System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height); "
            f"$g=[System.Drawing.Graphics]::FromImage($b); "
            f"$g.CopyFromScreen(0,0,0,0,$b.Size); "
            f"$b.Save('{filepath}'); $g.Dispose(); $b.Dispose()"
        ], capture_output=True, timeout=10)

        return jsonify({"success": True, "file": filepath, "message": f"Screenshot saved to Desktop as {filename}"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# PROCESSES
# ============================================================
@app.route('/api/processes', methods=['GET'])
def list_processes():
    """List top 10 CPU-consuming processes."""
    try:
        procs = []
        for p in sorted(psutil.process_iter(['name', 'cpu_percent', 'memory_percent']),
                        key=lambda x: x.info['cpu_percent'] or 0, reverse=True)[:10]:
            procs.append({
                "name": p.info['name'],
                "cpu": round(p.info['cpu_percent'] or 0, 1),
                "mem": round(p.info['memory_percent'] or 0, 1)
            })
        return jsonify({"success": True, "processes": procs})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# SHUTDOWN / RESTART / SLEEP
# ============================================================
@app.route('/api/power', methods=['POST'])
def power_control():
    """Shutdown, restart, or sleep the system."""
    data = request.json or {}
    action = data.get('action', '').lower()
    delay  = data.get('delay', 5)  # seconds before execution

    cmd_map = {
        "shutdown": f"shutdown /s /t {delay}",
        "restart":  f"shutdown /r /t {delay}",
        "sleep":    "rundll32.exe powrprof.dll,SetSuspendState 0,1,0",
        "cancel":   "shutdown /a",
        "lock":     "rundll32.exe user32.dll,LockWorkStation",
    }

    cmd = cmd_map.get(action)
    if not cmd:
        return jsonify({"success": False, "error": f"Unknown power action: {action}"}), 400

    try:
        subprocess.Popen(cmd, shell=True)
        return jsonify({"success": True, "action": action, "delay": delay})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500



# ============================================================
# WIKIPEDIA SEARCH
# ============================================================
@app.route('/api/wikipedia', methods=['POST'])
def wikipedia_search():
    data = request.json or {}
    query = data.get('query', '').strip()
    sentences = data.get('sentences', 3)
    if not query:
        return jsonify({"success": False, "error": "No query provided"}), 400
    try:
        import wikipedia as wiki
        wiki.set_lang('en')
        summary = wiki.summary(query, sentences=sentences, auto_suggest=True)
        page = wiki.page(query, auto_suggest=True)
        return jsonify({"success": True, "summary": summary, "title": page.title, "url": page.url})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# INTERNET SPEED TEST
# ============================================================
@app.route('/api/speedtest', methods=['GET'])
def internet_speedtest():
    try:
        import speedtest as st
        s = st.Speedtest(secure=True)
        s.get_best_server()
        down = round(s.download() / 1_000_000, 2)
        up   = round(s.upload()   / 1_000_000, 2)
        ping = round(s.results.ping, 1)
        return jsonify({"success": True, "download_mbps": down, "upload_mbps": up, "ping_ms": ping})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# SCREEN BRIGHTNESS
# ============================================================
@app.route('/api/brightness', methods=['POST'])
def brightness_control():
    data = request.json or {}
    action = data.get('action', '').lower()
    level  = int(data.get('level', 50))
    try:
        import screen_brightness_control as sbc
        current = sbc.get_brightness(display=0)
        current = current[0] if isinstance(current, list) else current
        if action == 'up':
            new_val = min(100, current + 20)
        elif action == 'down':
            new_val = max(0, current - 20)
        elif action == 'set':
            new_val = max(0, min(100, level))
        else:
            return jsonify({"success": False, "error": f"Unknown action: {action}"}), 400
        sbc.set_brightness(new_val, display=0)
        return jsonify({"success": True, "brightness": new_val, "previous": current})
    except Exception as e:
        try:
            cmd = f"(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1,{level})"
            subprocess.run(["powershell", "-Command", cmd], capture_output=True, timeout=5)
            return jsonify({"success": True, "brightness": level, "method": "wmi"})
        except Exception as e2:
            return jsonify({"success": False, "error": str(e2)}), 500


# ============================================================
# REAL WEATHER (OpenWeatherMap API)
# ============================================================
OWM_API_KEY = "eca9b2f9ab45a2cd888e29e2c9b64b6c"

@app.route('/api/weather/real', methods=['POST'])
def real_weather():
    data = request.json or {}
    city_raw = data.get('city', 'auto').strip()

    try:
        # ── Auto-detect city via IP if not specified ──
        if not city_raw or city_raw.lower() == 'auto':
            try:
                ip_req = urllib.request.Request(
                    'http://ip-api.com/json/?fields=city',
                    headers={'User-Agent': 'JARVIS/3.0'}
                )
                with urllib.request.urlopen(ip_req, timeout=5) as r:
                    city_raw = json.loads(r.read().decode()).get('city', 'London')
            except Exception:
                city_raw = 'London'

        city_enc = urllib.parse.quote(city_raw)

        # ── Current weather ──
        cur_url = (
            f"https://api.openweathermap.org/data/2.5/weather"
            f"?q={city_enc}&appid={OWM_API_KEY}&units=metric"
        )
        req = urllib.request.Request(cur_url, headers={'User-Agent': 'JARVIS/3.0'})
        with urllib.request.urlopen(req, timeout=8) as resp:
            cur = json.loads(resp.read().decode('utf-8'))

        if cur.get('cod') != 200:
            return jsonify({"success": False, "error": cur.get('message', 'City not found')}), 404

        # ── UV Index (separate endpoint using lat/lon) ──
        lat = cur['coord']['lat']
        lon = cur['coord']['lon']
        uv_index = "N/A"
        try:
            uv_url = (
                f"https://api.openweathermap.org/data/2.5/uvi"
                f"?lat={lat}&lon={lon}&appid={OWM_API_KEY}"
            )
            uv_req = urllib.request.Request(uv_url, headers={'User-Agent': 'JARVIS/3.0'})
            with urllib.request.urlopen(uv_req, timeout=5) as uv_resp:
                uv_data = json.loads(uv_resp.read().decode('utf-8'))
                uv_index = round(uv_data.get('value', 0), 1)
        except Exception:
            pass

        # ── 5-day forecast (next 3 entries = ~9h ahead) ──
        forecast_summary = []
        try:
            fc_url = (
                f"https://api.openweathermap.org/data/2.5/forecast"
                f"?q={city_enc}&appid={OWM_API_KEY}&units=metric&cnt=4"
            )
            fc_req = urllib.request.Request(fc_url, headers={'User-Agent': 'JARVIS/3.0'})
            with urllib.request.urlopen(fc_req, timeout=8) as fc_resp:
                fc_data = json.loads(fc_resp.read().decode('utf-8'))
            for entry in fc_data.get('list', [])[1:4]:
                forecast_summary.append({
                    "time": entry['dt_txt'][11:16],
                    "temp_c": round(entry['main']['temp'], 1),
                    "desc": entry['weather'][0]['description'].title(),
                })
        except Exception:
            pass

        # ── Sunrise / Sunset ──
        import datetime as _dt
        sunrise_ts = cur['sys'].get('sunrise', 0)
        sunset_ts  = cur['sys'].get('sunset', 0)
        sunrise_str = _dt.datetime.fromtimestamp(sunrise_ts).strftime('%H:%M') if sunrise_ts else 'N/A'
        sunset_str  = _dt.datetime.fromtimestamp(sunset_ts).strftime('%H:%M')  if sunset_ts  else 'N/A'

        temp_c = round(cur['main']['temp'], 1)
        temp_f = round(temp_c * 9/5 + 32, 1)

        return jsonify({
            "success":        True,
            "city":           f"{cur['name']}, {cur['sys']['country']}",
            "temp_c":         temp_c,
            "temp_f":         temp_f,
            "feels_like_c":   round(cur['main']['feels_like'], 1),
            "humidity":       cur['main']['humidity'],
            "description":    cur['weather'][0]['description'].title(),
            "wind_kmph":      round(cur['wind']['speed'] * 3.6, 1),
            "wind_dir":       cur['wind'].get('deg', 'N/A'),
            "visibility":     round(cur.get('visibility', 0) / 1000, 1),  # km
            "pressure_hpa":   cur['main']['pressure'],
            "clouds_pct":     cur['clouds']['all'],
            "uv_index":       uv_index,
            "sunrise":        sunrise_str,
            "sunset":         sunset_str,
            "forecast":       forecast_summary,
            "icon":           cur['weather'][0]['icon'],
            "lat":            lat,
            "lon":            lon,
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# WHATSAPP — Desktop App Launcher (whatsapp:// URI scheme)
# ============================================================
@app.route('/api/whatsapp', methods=['POST'])
def send_whatsapp():
    """
    Opens WhatsApp Desktop with a pre-filled message.
    Uses the whatsapp:// protocol handler registered by the Windows app.
    Phone must include country code, e.g. +919876543210
    """
    data    = request.json or {}
    phone   = data.get('phone', '').strip().replace(' ', '').replace('-', '')
    message = data.get('message', '').strip()

    if not phone:
        return jsonify({"success": False, "error": "phone number required"}), 400

    # Normalise phone: ensure it starts with + and only digits follow
    if not phone.startswith('+'):
        phone = '+' + phone
    digits = phone.replace('+', '').replace(' ', '')

    try:
        # Method 1: whatsapp:// URI — opens WhatsApp Desktop directly
        wa_uri = f"whatsapp://send?phone={digits}"
        if message:
            wa_uri += f"&text={urllib.parse.quote(message)}"

        # subprocess start opens the registered URI handler (WhatsApp Desktop)
        result = subprocess.run(
            ['cmd', '/c', 'start', '', wa_uri],
            capture_output=True, timeout=5
        )

        return jsonify({
            "success":  True,
            "method":   "desktop_app",
            "phone":    phone,
            "message":  message,
            "uri":      wa_uri,
        })

    except Exception as e:
        # Fallback: open WhatsApp Web in browser
        try:
            web_url = f"https://wa.me/{digits}?text={urllib.parse.quote(message)}"
            subprocess.Popen(['cmd', '/c', 'start', '', web_url], shell=False)
            return jsonify({
                "success": True,
                "method":  "web_fallback",
                "url":     web_url,
                "note":    "WhatsApp Desktop not found — opened WhatsApp Web instead."
            })
        except Exception as e2:
            return jsonify({"success": False, "error": str(e2)}), 500




# ============================================================
# TRANSLATE TEXT (deep-translator, no API key needed)
# ============================================================
@app.route('/api/translate', methods=['POST'])
def translate_text():
    data = request.json or {}
    text        = data.get('text', '').strip()
    target_lang = data.get('target', 'en').strip().lower()
    if not text:
        return jsonify({"success": False, "error": "No text provided"}), 400
    try:
        from deep_translator import GoogleTranslator
        translated = GoogleTranslator(source='auto', target=target_lang).translate(text)
        return jsonify({"success": True, "original": text, "translated": translated, "target": target_lang})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# ALARM (threading — system beep + desktop notification)
# ============================================================
@app.route('/api/alarm', methods=['POST'])
def set_alarm():
    data = request.json or {}
    alarm_time = data.get('time', '')
    label      = data.get('label', 'JARVIS Alarm')
    if not alarm_time:
        return jsonify({"success": False, "error": "Provide time as HH:MM (24h)"}), 400
    try:
        h, m = map(int, alarm_time.strip().split(':'))
        def alarm_thread():
            while True:
                now = datetime.datetime.now()
                if now.hour == h and now.minute == m:
                    subprocess.Popen(['powershell', '-Command',
                        f'[console]::beep(880,400);[console]::beep(1100,400);[console]::beep(1320,800);'
                        f'Add-Type -AssemblyName System.Windows.Forms;'
                        f'$n=New-Object System.Windows.Forms.NotifyIcon;'
                        f'$n.Icon=[System.Drawing.SystemIcons]::Exclamation;'
                        f'$n.Visible=$true;'
                        f'$n.ShowBalloonTip(8000,"JARVIS Alarm","{label}","Warning");'
                        f'Start-Sleep 9;$n.Dispose()'
                    ])
                    break
                time.sleep(20)
        threading.Thread(target=alarm_thread, daemon=True).start()
        return jsonify({"success": True, "alarm": alarm_time, "label": label})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# DISK CLEANUP
# ============================================================
@app.route('/api/disk/clean', methods=['POST'])
def disk_clean():
    try:
        subprocess.Popen(['cleanmgr', '/sagerun:1'], shell=True)
        temp = os.environ.get('TEMP', '')
        cleared = 0
        if temp and os.path.isdir(temp):
            for f in os.listdir(temp):
                fp = os.path.join(temp, f)
                try:
                    if os.path.isfile(fp):
                        os.remove(fp)
                        cleared += 1
                except Exception:
                    pass
        return jsonify({"success": True, "temp_files_cleared": cleared, "disk_cleanup": "started"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# VIRUS SCAN (Windows Defender)
# ============================================================
@app.route('/api/virus/scan', methods=['POST'])
def virus_scan():
    data = request.json or {}
    scan_type = data.get('type', 'quick')
    path      = data.get('path', 'C:\\')
    try:
        if scan_type == 'quick':
            cmd = 'Start-MpScan -ScanType QuickScan'
        elif scan_type == 'full':
            cmd = 'Start-MpScan -ScanType FullScan'
        else:
            cmd = f'Start-MpScan -ScanType CustomScan -ScanPath "{path}"'
        subprocess.Popen(['powershell', '-Command', cmd])
        return jsonify({"success": True, "type": scan_type, "status": "Scan initiated via Windows Defender"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# CPU TEMPERATURE
# ============================================================
@app.route('/api/temp', methods=['GET'])
def cpu_temp():
    try:
        temps = psutil.sensors_temperatures() if hasattr(psutil, 'sensors_temperatures') else {}
        if temps:
            for name, entries in temps.items():
                if entries:
                    return jsonify({"success": True, "source": name,
                                    "current_c": round(entries[0].current, 1),
                                    "high_c": entries[0].high})
        result = subprocess.run(['powershell', '-Command',
            'Get-WmiObject MSAcpi_ThermalZoneTemperature -Namespace "root/wmi" '
            '| Select-Object -First 1 CurrentTemperature | ConvertTo-Json'],
            capture_output=True, text=True, timeout=8)
        if result.returncode == 0 and result.stdout.strip():
            kelvin = json.loads(result.stdout.strip()).get('CurrentTemperature', 0)
            celsius = round((kelvin / 10) - 273.15, 1)
            return jsonify({"success": True, "source": "WMI", "current_c": celsius})
        return jsonify({"success": False, "error": "Temperature sensor not available"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# YOUTUBE â€” Find & Play first result directly
# ============================================================
@app.route('/api/youtube/play', methods=['POST'])
def youtube_play():
    """Scrape YouTube for the first video matching a query and return its direct URL."""
    data = request.json or {}
    query = data.get('query', '').strip()
    if not query:
        return jsonify({"success": False, "error": "No query provided"}), 400

    try:
        search_url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(query)}"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                          'AppleWebKit/537.36 (KHTML, like Gecko) '
                          'Chrome/124.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
        }
        req = urllib.request.Request(search_url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            html = resp.read().decode('utf-8')

        # Extract all video IDs (YouTube embeds them in JSON inside the page)
        video_ids = re.findall(r'"videoId":"([a-zA-Z0-9_-]{11})"', html)

        if not video_ids:
            return jsonify({"success": False, "error": "No videos found for that query"}), 404

        video_id = video_ids[0]  # First result
        video_url = f"https://www.youtube.com/watch?v={video_id}&autoplay=1"

        # Try to extract the video title
        title_match = re.search(r'"title":\{"runs":\[\{"text":"([^"]+)"', html)
        title = title_match.group(1) if title_match else query

        return jsonify({
            "success": True,
            "url":      video_url,
            "video_id": video_id,
            "title":    title,
            "query":    query,
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# HEALTH CHECK
# ============================================================
@app.route('/api/ping', methods=['GET'])
def ping():
    return jsonify({"status": "JARVIS backend online", "version": "3.0"})


# ============================================================
# LIST ALL INSTALLED APPS
# ============================================================
_apps_cache = []
_apps_cache_time = 0

@app.route('/api/apps/list', methods=['GET'])
def list_all_apps():
    """Scan the system for ALL installed applications."""
    global _apps_cache, _apps_cache_time

    if _apps_cache and (time.time() - _apps_cache_time) < 300:
        return jsonify({"success": True, "apps": _apps_cache, "count": len(_apps_cache), "cached": True})

    apps = []
    seen = set()

    # 1. Start Menu shortcuts
    start_dirs = [
        os.path.join(os.environ.get('ProgramData', ''), r'Microsoft\Windows\Start Menu\Programs'),
        os.path.join(os.path.expanduser('~'), r'AppData\Roaming\Microsoft\Windows\Start Menu\Programs'),
    ]
    for start_dir in start_dirs:
        if not os.path.exists(start_dir):
            continue
        for root, _, files in os.walk(start_dir):
            for f in files:
                if f.lower().endswith('.lnk'):
                    name = f[:-4]
                    key = name.lower()
                    if key not in seen:
                        seen.add(key)
                        apps.append({"name": name, "path": os.path.join(root, f), "type": "shortcut"})

    # 2. Registry uninstall entries
    reg_cmd = (
        "Get-ItemProperty "
        "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*, "
        "HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*, "
        "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* "
        "-ErrorAction SilentlyContinue "
        "| Where-Object { $_.DisplayName -and $_.DisplayName.Trim() -ne '' } "
        "| Select-Object DisplayName, InstallLocation "
        "| ConvertTo-Json -Depth 2"
    )
    try:
        result = subprocess.run(["powershell", "-NoProfile", "-Command", reg_cmd],
                                capture_output=True, text=True, timeout=20)
        if result.returncode == 0 and result.stdout.strip():
            raw = result.stdout.strip()
            if raw.startswith('{'):
                raw = f'[{raw}]'
            for a in json.loads(raw):
                name = (a.get('DisplayName') or '').strip()
                if name and name.lower() not in seen:
                    seen.add(name.lower())
                    apps.append({"name": name, "path": a.get('InstallLocation', ''), "type": "installed"})
    except Exception:
        pass

    # 3. Microsoft Store apps
    try:
        result = subprocess.run(["powershell", "-NoProfile", "-Command",
                                 "Get-StartApps | Select-Object Name, AppID | ConvertTo-Json"],
                                capture_output=True, text=True, timeout=10)
        if result.returncode == 0 and result.stdout.strip():
            raw = result.stdout.strip()
            if raw.startswith('{'):
                raw = f'[{raw}]'
            for a in json.loads(raw):
                name = (a.get('Name') or '').strip()
                if name and name.lower() not in seen:
                    seen.add(name.lower())
                    apps.append({"name": name, "path": a.get('AppID', ''), "type": "store"})
    except Exception:
        pass

    apps.sort(key=lambda x: x['name'].lower())
    _apps_cache = apps
    _apps_cache_time = time.time()
    return jsonify({"success": True, "apps": apps, "count": len(apps)})


# ============================================================
# OPEN ANY APP (fuzzy search)
# ============================================================
@app.route('/api/apps/open-any', methods=['POST'])
def open_any_app():
    """Find and open any app by fuzzy name matching."""
    global _apps_cache
    data = request.json or {}
    query = data.get('name', '').lower().strip()
    if not query:
        return jsonify({"success": False, "error": "No app name provided"}), 400

    if not _apps_cache:
        list_all_apps()

    match = None
    for priority in ['exact', 'starts', 'contains']:
        for entry in _apps_cache:
            n = entry['name'].lower()
            if priority == 'exact' and n == query:
                match = entry; break
            elif priority == 'starts' and n.startswith(query):
                match = entry; break
            elif priority == 'contains' and query in n:
                match = entry; break
        if match:
            break

    if not match:
        return jsonify({"success": False, "error": f"No app found matching '{query}'"}), 404

    name, path, app_type = match['name'], match['path'], match['type']
    try:
        if app_type == 'shortcut' and path.endswith('.lnk'):
            subprocess.Popen(['powershell', '-Command', f'Start-Process "{path}"'])
        elif app_type == 'store' and path:
            subprocess.Popen(['powershell', '-Command', f'Start-Process shell:AppsFolder\\{path}'])
        elif path and os.path.isdir(path):
            exes = [f for f in os.listdir(path) if f.lower().endswith('.exe')]
            subprocess.Popen(os.path.join(path, exes[0]) if exes else name, shell=True)
        else:
            subprocess.Popen(name, shell=True)
        return jsonify({"success": True, "launched": name, "type": app_type})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# TYPE TEXT into focused window
# ============================================================

# ============================================================
# FULL AUTOMATION — pyautogui (mouse + keyboard, no UAC prompt)
# ============================================================
def _get_pag():
    """Import pyautogui with failsafe OFF so it won't raise on edge of screen."""
    import pyautogui
    pyautogui.FAILSAFE    = False   # allow moving to any position
    pyautogui.PAUSE       = 0.05    # tiny inter-call pause
    return pyautogui

def _screen_size():
    try:
        pag = _get_pag()
        return pag.size()
    except Exception:
        return (1920, 1080)

@app.route('/api/automate', methods=['POST'])
def automate():
    """
    Universal automation endpoint.
    Body: { "action": "<action>", ...params }

    Actions & params:
      type          text, interval(s)=0.03, clear=False, enter=False
      hotkey        keys (list e.g. ["ctrl","c"]) or keys (str e.g. "ctrl+c")
      press         key  (e.g. "enter","esc","tab","f5","delete")
      click         x,y  (pixels) or x_pct,y_pct (0-100%), button="left"|"right"|"middle", clicks=1
      double_click  x,y or x_pct,y_pct
      right_click   x,y or x_pct,y_pct
      move          x,y or x_pct,y_pct, duration=0.4
      drag          x1,y1 -> x2,y2 (or pct), duration=0.5
      scroll        amount (+up / -down), x,y optional
      screenshot    (returns base64 image)
      screen_size   returns width,height
      position      returns current cursor x,y
    """
    data   = request.json or {}
    action = data.get('action', '').lower().strip()

    if not action:
        return jsonify({"success": False, "error": "action required"}), 400

    try:
        pag  = _get_pag()
        sw, sh = pag.size()

        def resolve_xy(d, prefix=''):
            """Resolve x/y or x_pct/y_pct to absolute pixels."""
            if f'{prefix}x_pct' in d or f'{prefix}y_pct' in d:
                xp = float(d.get(f'{prefix}x_pct', 50))
                yp = float(d.get(f'{prefix}y_pct', 50))
                return int(sw * xp / 100), int(sh * yp / 100)
            return int(d.get(f'{prefix}x', sw // 2)), int(d.get(f'{prefix}y', sh // 2))

        # ── TYPE ──
        if action == 'type':
            text     = data.get('text', '')
            interval = float(data.get('interval', 0.03))
            clear    = data.get('clear', False)
            enter    = data.get('enter', False)
            if not text:
                return jsonify({"success": False, "error": "text required"}), 400
            if clear:
                pag.hotkey('ctrl', 'a')
                time.sleep(0.1)
            # Use clipboard for non-ASCII / long strings (faster + safer)
            try:
                import pyperclip
                pyperclip.copy(text)
                pag.hotkey('ctrl', 'v')
            except Exception:
                pag.write(text, interval=interval)
            if enter:
                time.sleep(0.08)
                pag.press('enter')
            return jsonify({"success": True, "action": "type", "text": text})

        # ── HOTKEY ──
        if action == 'hotkey':
            keys = data.get('keys', [])
            if isinstance(keys, str):
                keys = [k.strip() for k in keys.replace('+', ',').split(',')]
            if not keys:
                return jsonify({"success": False, "error": "keys required"}), 400
            pag.hotkey(*keys)
            return jsonify({"success": True, "action": "hotkey", "keys": keys})

        # ── PRESS ──
        if action == 'press':
            key = data.get('key', '').strip()
            n   = int(data.get('n', 1))
            if not key:
                return jsonify({"success": False, "error": "key required"}), 400
            for _ in range(n):
                pag.press(key)
            return jsonify({"success": True, "action": "press", "key": key})

        # ── CLICK ──
        if action in ('click', 'left_click'):
            x, y    = resolve_xy(data)
            button  = data.get('button', 'left')
            clicks  = int(data.get('clicks', 1))
            dur     = float(data.get('duration', 0.25))
            pag.click(x, y, button=button, clicks=clicks, duration=dur)
            return jsonify({"success": True, "action": "click", "x": x, "y": y, "button": button})

        # ── DOUBLE CLICK ──
        if action == 'double_click':
            x, y = resolve_xy(data)
            pag.doubleClick(x, y)
            return jsonify({"success": True, "action": "double_click", "x": x, "y": y})

        # ── RIGHT CLICK ──
        if action == 'right_click':
            x, y = resolve_xy(data)
            pag.rightClick(x, y)
            return jsonify({"success": True, "action": "right_click", "x": x, "y": y})

        # ── MOVE ──
        if action == 'move':
            x, y = resolve_xy(data)
            dur  = float(data.get('duration', 0.4))
            pag.moveTo(x, y, duration=dur)
            return jsonify({"success": True, "action": "move", "x": x, "y": y})

        # ── DRAG ──
        if action == 'drag':
            x1, y1 = resolve_xy(data, 'from_')
            x2, y2 = resolve_xy(data, 'to_')
            dur    = float(data.get('duration', 0.6))
            pag.moveTo(x1, y1, duration=0.3)
            pag.dragTo(x2, y2, duration=dur, button='left')
            return jsonify({"success": True, "action": "drag",
                            "from": [x1,y1], "to": [x2,y2]})

        # ── SCROLL ──
        if action == 'scroll':
            amount = int(data.get('amount', 3))
            if 'x' in data or 'x_pct' in data:
                x, y = resolve_xy(data)
                pag.scroll(amount, x=x, y=y)
            else:
                pag.scroll(amount)
            direction = 'up' if amount > 0 else 'down'
            return jsonify({"success": True, "action": "scroll",
                            "amount": amount, "direction": direction})

        # ── SCREEN SIZE ──
        if action == 'screen_size':
            return jsonify({"success": True, "width": sw, "height": sh})

        # ── CURSOR POSITION ──
        if action == 'position':
            px, py = pag.position()
            return jsonify({"success": True, "x": px, "y": py,
                            "x_pct": round(px/sw*100,1), "y_pct": round(py/sh*100,1)})

        return jsonify({"success": False, "error": f"Unknown action: '{action}'"}), 400

    except ImportError:
        return jsonify({"success": False,
                        "error": "pyautogui not installed. Run: pip install pyautogui"}), 500
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# Keep legacy /api/type and /api/click as thin wrappers
@app.route('/api/type', methods=['POST'])
def type_text():
    d = request.json or {}
    return automate.__wrapped__({**d, 'action':'type'}) if hasattr(automate,'__wrapped__') \
        else automate()

@app.route('/api/click', methods=['POST'])
def click_at():
    d = request.json or {}
    return automate.__wrapped__({**d, 'action':'click'}) if hasattr(automate,'__wrapped__') \
        else automate()





# ============================================================
# PERSISTENT MEMORY (jarvis_memory.json in home dir)
# ============================================================
MEMORY_FILE = os.path.join(os.path.expanduser('~'), '.jarvis_memory.json')

def _load_memory():
    if not os.path.exists(MEMORY_FILE):
        return {}
    try:
        with open(MEMORY_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}

def _save_memory(data):
    with open(MEMORY_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

@app.route('/api/memory/set', methods=['POST'])
def memory_set():
    data = request.json or {}
    key   = data.get('key', '').strip()
    value = data.get('value', '').strip()
    if not key or not value:
        return jsonify({"success": False, "error": "key and value required"}), 400
    mem = _load_memory()
    mem[key] = {"value": value, "stored_at": time.strftime('%Y-%m-%d %H:%M')}
    _save_memory(mem)
    return jsonify({"success": True, "key": key, "value": value})

@app.route('/api/memory/get', methods=['POST'])
def memory_get():
    data = request.json or {}
    key = data.get('key', '').strip().lower()
    mem = _load_memory()
    # Fuzzy match
    match = None
    for k, v in mem.items():
        if k.lower() == key:
            match = (k, v); break
    if not match:
        for k, v in mem.items():
            if key in k.lower() or k.lower() in key:
                match = (k, v); break
    if match:
        return jsonify({"success": True, "key": match[0], "value": match[1]["value"],
                        "stored_at": match[1].get("stored_at", "unknown")})
    return jsonify({"success": False, "error": f"No memory found for '{key}'"}), 404

@app.route('/api/memory/list', methods=['GET'])
def memory_list():
    mem = _load_memory()
    items = [{"key": k, "value": v["value"], "stored_at": v.get("stored_at", "")}
             for k, v in mem.items()]
    return jsonify({"success": True, "count": len(items), "memories": items})

@app.route('/api/memory/forget', methods=['POST'])
def memory_forget():
    data = request.json or {}
    key = data.get('key', '').strip()
    mem = _load_memory()
    # Find key (case-insensitive)
    real_key = next((k for k in mem if k.lower() == key.lower()), None)
    if real_key:
        del mem[real_key]
        _save_memory(mem)
        return jsonify({"success": True, "forgotten": real_key})
    return jsonify({"success": False, "error": f"No memory for '{key}'"}), 404


# ============================================================
# FILE OPERATIONS (Desktop files)
# ============================================================
DESKTOP = os.path.join(os.path.expanduser('~'), 'Desktop')

@app.route('/api/file', methods=['POST'])
def file_ops():
    data     = request.json or {}
    action   = data.get('action', '').lower()   # read / write / create / append / list
    filename = data.get('filename', '').strip()
    content  = data.get('content', '')

    if action == 'list':
        try:
            files = [f for f in os.listdir(DESKTOP) if os.path.isfile(os.path.join(DESKTOP, f))]
            return jsonify({"success": True, "files": files, "count": len(files)})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500

    if not filename:
        return jsonify({"success": False, "error": "filename required"}), 400

    # Safety: only allow Desktop files
    filepath = os.path.join(DESKTOP, os.path.basename(filename))

    try:
        if action == 'read':
            if not os.path.exists(filepath):
                return jsonify({"success": False, "error": f"File '{filename}' not found on Desktop"})
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                text = f.read()
            return jsonify({"success": True, "filename": filename, "content": text,
                            "size_bytes": len(text.encode())})

        elif action in ('write', 'create'):
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            return jsonify({"success": True, "action": action, "filename": filename})

        elif action == 'append':
            with open(filepath, 'a', encoding='utf-8') as f:
                f.write('\n' + content)
            return jsonify({"success": True, "action": "append", "filename": filename})

        else:
            return jsonify({"success": False, "error": f"Unknown action: {action}"}), 400

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# GEMINI LIVE — Webcam → Gemini Vision
# ============================================================
@app.route('/api/camera/describe', methods=['POST'])
def camera_describe():
    """Capture a webcam frame and send it to Gemini for visual description."""
    data    = request.json or {}
    api_key = data.get('api_key', '')
    prompt  = data.get('prompt', 'Describe everything you see in this image in detail, as JARVIS would report it to Tony Stark.')

    if not api_key:
        return jsonify({"success": False, "error": "No API key provided"}), 400

    try:
        import cv2, base64

        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            return jsonify({"success": False, "error": "No webcam found. Check camera connection."}), 500

        # Warm up camera (skip first few frames)
        for _ in range(5):
            cap.read()

        ret, frame = cap.read()
        cap.release()

        if not ret:
            return jsonify({"success": False, "error": "Failed to capture frame from webcam."}), 500

        # Encode frame as JPEG → base64
        _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        img_b64 = base64.b64encode(buf.tobytes()).decode('utf-8')

        # Send to Gemini vision
        gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
        body = {
            "contents": [{
                "parts": [
                    {"text": f"[SYSTEM] You are JARVIS, Tony Stark's AI. Respond in character.\n\n{prompt}"},
                    {"inline_data": {"mime_type": "image/jpeg", "data": img_b64}}
                ]
            }],
            "generationConfig": {"temperature": 0.7, "maxOutputTokens": 500}
        }

        req = urllib.request.Request(
            gemini_url,
            data=json.dumps(body).encode('utf-8'),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            result = json.loads(resp.read().decode('utf-8'))

        description = result['candidates'][0]['content']['parts'][0]['text']
        return jsonify({"success": True, "description": description})

    except ImportError:
        return jsonify({"success": False, "error": "opencv-python not installed. Run: pip install opencv-python"}), 500
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# YOLO OBJECT DETECTION — Webcam → YOLOv8
# ============================================================
@app.route('/api/camera/detect', methods=['POST'])
def camera_detect():
    """Capture a webcam frame and run YOLOv8 object detection."""
    try:
        import cv2
        from ultralytics import YOLO

        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            return jsonify({"success": False, "error": "No webcam found."}), 500

        for _ in range(5):
            cap.read()

        ret, frame = cap.read()
        cap.release()

        if not ret:
            return jsonify({"success": False, "error": "Failed to capture frame."}), 500

        # Load model (downloaded once, cached)
        model = YOLO('yolov8n.pt')   # nano = fastest
        results = model(frame, verbose=False)

        detections = []
        seen = set()
        for r in results:
            for box in r.boxes:
                label = model.names[int(box.cls)]
                conf  = round(float(box.conf), 2)
                if label not in seen or conf > 0.7:
                    seen.add(label)
                    detections.append({"object": label, "confidence": conf})

        # Sort by confidence
        detections.sort(key=lambda x: x['confidence'], reverse=True)

        # Build human-readable summary
        if detections:
            obj_list = ', '.join(f"{d['object']} ({int(d['confidence']*100)}%)" for d in detections[:10])
            summary = f"I can see: {obj_list}."
        else:
            summary = "I don't detect any recognizable objects in the frame, Sir."

        return jsonify({"success": True, "detections": detections, "summary": summary})

    except ImportError as e:
        return jsonify({"success": False, "error": f"Missing package: {e}. Install ultralytics."}), 500
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# REAL-TIME SEARCH SUGGESTIONS (Google + YouTube autocomplete)
# ============================================================
@app.route('/api/suggest', methods=['POST'])
def suggest():
    data   = request.json or {}
    query  = data.get('query', '').strip()
    source = data.get('source', 'google')  # 'google' or 'youtube'
    if not query:
        return jsonify({"success": False, "error": "No query provided"}), 400
    try:
        ds  = '&ds=yt' if source == 'youtube' else ''
        url = "https://suggestqueries.google.com/complete/search?client=firefox" + ds + "&q=" + urllib.parse.quote(query)
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        with urllib.request.urlopen(req, timeout=5) as resp:
            result = json.loads(resp.read().decode('utf-8'))
        suggestions = result[1] if len(result) > 1 else []
        return jsonify({"success": True, "suggestions": [str(s) for s in suggestions[:8]], "source": source})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# REAL-TIME WEB BROWSE -- fetch any URL and summarize with Gemini
# ============================================================
@app.route('/api/browse', methods=['POST'])
def browse_url():
    data    = request.json or {}
    url     = data.get('url', '').strip()
    api_key = data.get('api_key', '')
    prompt  = data.get('prompt', 'Summarize the key points of this webpage content concisely, as JARVIS would report to Tony Stark.')
    if not url:
        return jsonify({"success": False, "error": "No URL provided"}), 400
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=12) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
        clean = re.sub(r'<script[^>]*>.*?</script>', ' ', html, flags=re.DOTALL | re.IGNORECASE)
        clean = re.sub(r'<style[^>]*>.*?</style>', ' ', clean, flags=re.DOTALL | re.IGNORECASE)
        clean = re.sub(r'<[^>]+>', ' ', clean)
        clean = re.sub(r'&nbsp;', ' ', clean)
        clean = re.sub(r'&amp;', '&', clean)
        clean = re.sub(r'\s{3,}', '\n\n', clean).strip()
        page_text = clean[:6000]
        title_m = re.search(r'<title[^>]*>([^<]+)</title>', html, re.IGNORECASE)
        title = title_m.group(1).strip() if title_m else url
        if api_key and page_text:
            gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
            body = {"contents": [{"parts": [{"text": f"{prompt}\n\nPage Title: {title}\n\nContent:\n{page_text}"}]}], "generationConfig": {"temperature": 0.4, "maxOutputTokens": 600}}
            greq = urllib.request.Request(gemini_url, data=json.dumps(body).encode('utf-8'), headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(greq, timeout=20) as gresp:
                gdata = json.loads(gresp.read().decode('utf-8'))
            summary = gdata['candidates'][0]['content']['parts'][0]['text']
            return jsonify({"success": True, "url": url, "title": title, "summary": summary, "raw_length": len(page_text)})
        return jsonify({"success": True, "url": url, "title": title, "content": page_text[:2000], "raw_length": len(page_text)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# DUCKDUCKGO REAL-TIME WEB SEARCH (no API key needed)
# ============================================================
@app.route('/api/search/web', methods=['POST'])
def web_search():
    data  = request.json or {}
    query = data.get('query', '').strip()
    if not query:
        return jsonify({"success": False, "error": "No query provided"}), 400
    results = []
    abstract = ""
    abstract_url = ""
    try:
        ddg_url = "https://api.duckduckgo.com/?q=" + urllib.parse.quote(query) + "&format=json&no_redirect=1&no_html=1"
        req = urllib.request.Request(ddg_url, headers={'User-Agent': 'JARVIS/3.0'})
        with urllib.request.urlopen(req, timeout=8) as resp:
            ddg = json.loads(resp.read().decode('utf-8'))
        abstract     = ddg.get('AbstractText', '') or ddg.get('Answer', '')
        abstract_url = ddg.get('AbstractURL', '') or ddg.get('AbstractSource', '')
        for topic in ddg.get('RelatedTopics', [])[:5]:
            if isinstance(topic, dict) and topic.get('Text'):
                results.append({"title": topic.get('Text', '')[:120], "url": topic.get('FirstURL', ''), "snippet": topic.get('Text', '')})
    except Exception:
        pass
    try:
        hdrs = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
        }
        surl = "https://html.duckduckgo.com/html/?q=" + urllib.parse.quote(query)
        req2 = urllib.request.Request(surl, headers=hdrs)
        with urllib.request.urlopen(req2, timeout=10) as r2:
            html = r2.read().decode('utf-8', errors='ignore')

        def ddg_real_url(href):
            m = re.search(r'uddg=([^&"]+)', href)
            return urllib.parse.unquote(m.group(1)) if m else href

        def clean_text(t):
            t = re.sub(r'<[^>]+>', '', t)
            for e, c in [('&amp;', '&'), ('&lt;', '<'), ('&gt;', '>'), ('&#x27;', "'"), ('&quot;', '"'), ('&nbsp;', ' ')]:
                t = t.replace(e, c)
            return re.sub(r'&#\d+;', '', t).strip()

        title_blocks   = re.findall(r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', html, re.DOTALL)
        snippet_blocks = re.findall(r'class="result__snippet"[^>]*>(.*?)</a>', html, re.DOTALL)
        for i, (href, raw_title) in enumerate(title_blocks[:8]):
            real_url = ddg_real_url(href)
            t = clean_text(raw_title)
            s = clean_text(snippet_blocks[i]) if i < len(snippet_blocks) else ''
            if real_url and t:
                results.append({"title": t, "url": real_url, "snippet": s})
    except Exception:
        pass
    return jsonify({"success": True, "query": query, "abstract": abstract, "abstract_url": abstract_url, "results": results[:8], "count": len(results)})


# ============================================================
# STOCK PRICE -- Yahoo Finance (no API key)
# ============================================================
@app.route('/api/stock', methods=['POST'])
def stock_price():
    data   = request.json or {}
    symbol = data.get('symbol', '').upper().strip()
    if not symbol:
        return jsonify({"success": False, "error": "No stock symbol provided"}), 400
    try:
        url = "https://query1.finance.yahoo.com/v8/finance/chart/" + symbol + "?interval=1d&range=1d"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'})
        with urllib.request.urlopen(req, timeout=8) as resp:
            data_raw = json.loads(resp.read().decode('utf-8'))
        meta       = data_raw['chart']['result'][0]['meta']
        price      = round(meta.get('regularMarketPrice', 0), 2)
        prev_close = round(meta.get('chartPreviousClose', price), 2)
        change     = round(price - prev_close, 2)
        change_pct = round((change / prev_close) * 100, 2) if prev_close else 0
        return jsonify({
            "success": True, "symbol": symbol,
            "name": meta.get('longName') or meta.get('shortName') or symbol,
            "price": price, "currency": meta.get('currency', 'USD'),
            "change": change, "change_pct": change_pct,
            "exchange": meta.get('exchangeName', ''),
            "direction": "up" if change >= 0 else "down"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# CRYPTO PRICE — CoinGecko (no API key)
# ============================================================
COIN_ID_MAP = {
    "bitcoin": "bitcoin", "btc": "bitcoin",
    "ethereum": "ethereum", "eth": "ethereum",
    "solana": "solana", "sol": "solana",
    "dogecoin": "dogecoin", "doge": "dogecoin",
    "cardano": "cardano", "ada": "cardano",
    "ripple": "ripple", "xrp": "ripple",
    "litecoin": "litecoin", "ltc": "litecoin",
    "polkadot": "polkadot", "dot": "polkadot",
    "shiba": "shiba-inu", "shib": "shiba-inu",
    "bnb": "binancecoin", "binance": "binancecoin",
    "tron": "tron", "trx": "tron",
    "avalanche": "avalanche-2", "avax": "avalanche-2",
    "chainlink": "chainlink", "link": "chainlink",
}

@app.route('/api/crypto', methods=['POST'])
def crypto_price():
    data = request.json or {}
    coin_raw = data.get('coin', '').lower().strip()
    coin_id  = COIN_ID_MAP.get(coin_raw, coin_raw)
    try:
        url = f"https://api.coingecko.com/api/v3/simple/price?ids={coin_id}&vs_currencies=usd,inr&include_24hr_change=true&include_market_cap=true"
        req = urllib.request.Request(url, headers={'User-Agent': 'JARVIS/3.0', 'Accept': 'application/json'})
        with urllib.request.urlopen(req, timeout=8) as resp:
            cdata = json.loads(resp.read().decode('utf-8'))

        if coin_id not in cdata:
            return jsonify({"success": False, "error": f"Coin '{coin_raw}' not found on CoinGecko"}), 404

        info = cdata[coin_id]
        return jsonify({
            "success":    True,
            "coin":       coin_id,
            "name":       coin_raw.upper(),
            "price_usd":  info.get('usd', 0),
            "price_inr":  info.get('inr', 0),
            "change_24h": round(info.get('usd_24h_change', 0), 2),
            "market_cap": info.get('usd_market_cap', 0),
            "direction":  "▲" if info.get('usd_24h_change', 0) >= 0 else "▼"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# DICTIONARY — Free Dictionary API (no key needed)
# ============================================================
@app.route('/api/dictionary', methods=['POST'])
def dictionary_lookup():
    data = request.json or {}
    word = data.get('word', '').strip().lower()
    if not word:
        return jsonify({"success": False, "error": "No word provided"}), 400
    try:
        url = f"https://api.dictionaryapi.dev/api/v2/entries/en/{urllib.parse.quote(word)}"
        req = urllib.request.Request(url, headers={'User-Agent': 'JARVIS/3.0'})
        with urllib.request.urlopen(req, timeout=8) as resp:
            entries = json.loads(resp.read().decode('utf-8'))

        entry    = entries[0]
        phonetic = entry.get('phonetic', '')
        meanings = []
        for m in entry.get('meanings', [])[:3]:
            pos  = m.get('partOfSpeech', '')
            defs = [d.get('definition', '') for d in m.get('definitions', [])[:2]]
            syns = m.get('synonyms', [])[:4]
            meanings.append({"pos": pos, "definitions": defs, "synonyms": syns})

        return jsonify({
            "success":  True,
            "word":     entry.get('word', word),
            "phonetic": phonetic,
            "meanings": meanings
        })
    except Exception as e:
        return jsonify({"success": False, "error": f"Word not found or {str(e)}"}), 500


# ============================================================
# IP INFO & GEOLOCATION (ip-api.com — no key needed)
# ============================================================
@app.route('/api/ip', methods=['POST'])
def ip_info():
    data = request.json or {}
    ip   = data.get('ip', '').strip() or ''
    try:
        target = ip if ip else ''
        url = f"http://ip-api.com/json/{target}?fields=status,message,country,regionName,city,zip,lat,lon,isp,org,as,query"
        req = urllib.request.Request(url, headers={'User-Agent': 'JARVIS/3.0'})
        with urllib.request.urlopen(req, timeout=8) as resp:
            info = json.loads(resp.read().decode('utf-8'))

        if info.get('status') != 'success':
            return jsonify({"success": False, "error": info.get('message', 'IP lookup failed')}), 500

        return jsonify({
            "success":    True,
            "ip":         info.get('query'),
            "city":       info.get('city'),
            "region":     info.get('regionName'),
            "country":    info.get('country'),
            "zip":        info.get('zip'),
            "lat":        info.get('lat'),
            "lon":        info.get('lon'),
            "isp":        info.get('isp'),
            "org":        info.get('org'),
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# TASK MANAGER  (CRUD — stored in ~/.jarvis_tasks.json)
# ============================================================
TASKS_FILE = os.path.join(os.path.expanduser('~'), '.jarvis_tasks.json')

def _load_tasks():
    if not os.path.exists(TASKS_FILE):
        return []
    try:
        with open(TASKS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return []

def _save_tasks(tasks):
    with open(TASKS_FILE, 'w', encoding='utf-8') as f:
        json.dump(tasks, f, indent=2)

@app.route('/api/tasks', methods=['GET'])
def tasks_list():
    tasks = _load_tasks()
    pending   = [t for t in tasks if not t.get('done')]
    completed = [t for t in tasks if t.get('done')]
    return jsonify({"success": True, "tasks": tasks,
                    "pending": len(pending), "completed": len(completed)})

@app.route('/api/tasks/add', methods=['POST'])
def tasks_add():
    data  = request.json or {}
    title = data.get('title', '').strip()
    if not title:
        return jsonify({"success": False, "error": "Task title required"}), 400
    tasks = _load_tasks()
    task  = {
        "id":         int(time.time() * 1000),
        "title":      title,
        "priority":   data.get('priority', 'normal'),  # low / normal / high
        "due":        data.get('due', ''),
        "done":       False,
        "created_at": time.strftime('%Y-%m-%d %H:%M'),
    }
    tasks.append(task)
    _save_tasks(tasks)
    return jsonify({"success": True, "task": task, "total": len(tasks)})

@app.route('/api/tasks/done', methods=['POST'])
def tasks_done():
    data = request.json or {}
    tid  = data.get('id') or data.get('title', '').lower()
    tasks = _load_tasks()
    matched = False
    for t in tasks:
        if str(t['id']) == str(tid) or t['title'].lower() == str(tid):
            t['done'] = True
            t['done_at'] = time.strftime('%Y-%m-%d %H:%M')
            matched = True
            break
    if not matched:
        return jsonify({"success": False, "error": f"Task '{tid}' not found"}), 404
    _save_tasks(tasks)
    return jsonify({"success": True, "message": "Task marked complete"})

@app.route('/api/tasks/delete', methods=['POST'])
def tasks_delete():
    data = request.json or {}
    tid  = data.get('id') or data.get('title', '').lower()
    tasks = _load_tasks()
    before = len(tasks)
    tasks = [t for t in tasks
             if str(t['id']) != str(tid) and t['title'].lower() != str(tid)]
    if len(tasks) == before:
        return jsonify({"success": False, "error": f"Task '{tid}' not found"}), 404
    _save_tasks(tasks)
    return jsonify({"success": True, "remaining": len(tasks)})

@app.route('/api/tasks/clear', methods=['POST'])
def tasks_clear():
    data = request.json or {}
    mode = data.get('mode', 'completed')   # 'completed' | 'all'
    tasks = _load_tasks()
    if mode == 'all':
        _save_tasks([])
        return jsonify({"success": True, "cleared": len(tasks)})
    kept = [t for t in tasks if not t.get('done')]
    _save_tasks(kept)
    return jsonify({"success": True, "cleared": len(tasks) - len(kept)})


# ============================================================
# VOICE NOTES  (stored in ~/JARVIS_Notes/)
# ============================================================
NOTES_DIR = os.path.join(os.path.expanduser('~'), 'JARVIS_Notes')
os.makedirs(NOTES_DIR, exist_ok=True)

@app.route('/api/notes/save', methods=['POST'])
def notes_save():
    data    = request.json or {}
    title   = data.get('title', '').strip() or f"note_{int(time.time())}"
    content = data.get('content', '').strip()
    tags    = data.get('tags', [])
    if not content:
        return jsonify({"success": False, "error": "Note content required"}), 400
    safe_title = re.sub(r'[<>:"/\\|?*]', '_', title)
    filepath   = os.path.join(NOTES_DIR, f"{safe_title}.txt")
    meta = {
        "title":      title,
        "tags":       tags,
        "created_at": time.strftime('%Y-%m-%d %H:%M'),
        "content":    content,
    }
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(f"# {title}\n")
        f.write(f"Created: {meta['created_at']}\n")
        if tags:
            f.write(f"Tags: {', '.join(tags)}\n")
        f.write("\n" + content)
    # Also save index
    index_path = os.path.join(NOTES_DIR, '_index.json')
    index = []
    if os.path.exists(index_path):
        try:
            with open(index_path, 'r', encoding='utf-8') as f:
                index = json.load(f)
        except Exception:
            pass
    index = [i for i in index if i.get('title') != title]  # dedup
    index.append({"title": title, "file": f"{safe_title}.txt",
                  "tags": tags, "created_at": meta['created_at']})
    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(index, f, indent=2)
    return jsonify({"success": True, "title": title, "file": filepath})

@app.route('/api/notes/list', methods=['GET'])
def notes_list():
    index_path = os.path.join(NOTES_DIR, '_index.json')
    if not os.path.exists(index_path):
        return jsonify({"success": True, "notes": [], "count": 0})
    try:
        with open(index_path, 'r', encoding='utf-8') as f:
            index = json.load(f)
        return jsonify({"success": True, "notes": index, "count": len(index)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/notes/get', methods=['POST'])
def notes_get():
    data  = request.json or {}
    title = data.get('title', '').strip()
    if not title:
        return jsonify({"success": False, "error": "Note title required"}), 400
    safe_title = re.sub(r'[<>:"/\\|?*]', '_', title)
    filepath   = os.path.join(NOTES_DIR, f"{safe_title}.txt")
    # Fuzzy: search index
    if not os.path.exists(filepath):
        index_path = os.path.join(NOTES_DIR, '_index.json')
        if os.path.exists(index_path):
            with open(index_path, 'r', encoding='utf-8') as f:
                index = json.load(f)
            for entry in index:
                if title.lower() in entry['title'].lower():
                    filepath = os.path.join(NOTES_DIR, entry['file'])
                    break
    if not os.path.exists(filepath):
        return jsonify({"success": False, "error": f"Note '{title}' not found"}), 404
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    return jsonify({"success": True, "title": title, "content": content})

@app.route('/api/notes/search', methods=['POST'])
def notes_search():
    data    = request.json or {}
    keyword = data.get('keyword', '').strip().lower()
    if not keyword:
        return jsonify({"success": False, "error": "Keyword required"}), 400
    matches = []
    for fname in os.listdir(NOTES_DIR):
        if fname.endswith('.txt'):
            fpath = os.path.join(NOTES_DIR, fname)
            with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            if keyword in content.lower():
                matches.append({"file": fname, "snippet": content[:200]})
    return jsonify({"success": True, "matches": matches, "count": len(matches)})


# ============================================================
# PDF SUMMARIZER  (uses pdfplumber or PyPDF2 + Gemini)
# ============================================================
@app.route('/api/pdf/summarize', methods=['POST'])
def pdf_summarize():
    """Upload a PDF path (desktop) and summarize with Gemini."""
    data    = request.json or {}
    path    = data.get('path', '').strip()
    api_key = data.get('api_key', '')
    prompt  = data.get('prompt', 'Summarize this document in clear bullet points. Highlight key concepts, definitions, and important formulas. Use an academic tone.')

    if not path:
        # Default to last PDF on Desktop
        for f in sorted(os.listdir(DESKTOP), reverse=True):
            if f.lower().endswith('.pdf'):
                path = os.path.join(DESKTOP, f)
                break

    if not path or not os.path.exists(path):
        return jsonify({"success": False, "error": "PDF not found. Place it on Desktop or specify full path."}), 404

    text = ''
    try:
        try:
            import pdfplumber
            with pdfplumber.open(path) as pdf:
                for page in pdf.pages[:15]:  # cap at 15 pages
                    t = page.extract_text()
                    if t:
                        text += t + '\n'
        except ImportError:
            try:
                import PyPDF2
                with open(path, 'rb') as f:
                    reader = PyPDF2.PdfReader(f)
                    for page in reader.pages[:15]:
                        text += (page.extract_text() or '') + '\n'
            except ImportError:
                return jsonify({"success": False,
                                "error": "Install pdfplumber: pip install pdfplumber"}), 500
    except Exception as e:
        return jsonify({"success": False, "error": f"PDF read error: {e}"}), 500

    if not text.strip():
        return jsonify({"success": False, "error": "Could not extract text from PDF (may be scanned)."}), 500

    truncated = text[:8000]

    if api_key:
        try:
            gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
            body = {
                "contents": [{"parts": [{"text": f"{prompt}\n\nDOCUMENT:\n{truncated}"}]}],
                "generationConfig": {"temperature": 0.3, "maxOutputTokens": 800}
            }
            req = urllib.request.Request(
                gemini_url,
                data=json.dumps(body).encode('utf-8'),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=20) as resp:
                result = json.loads(resp.read().decode('utf-8'))
            summary = result['candidates'][0]['content']['parts'][0]['text']
            return jsonify({"success": True, "file": os.path.basename(path),
                            "summary": summary, "chars_extracted": len(text)})
        except Exception as e:
            return jsonify({"success": False, "error": f"Gemini error: {e}"}), 500

    # No API key — return raw extract
    return jsonify({"success": True, "file": os.path.basename(path),
                    "summary": truncated[:2000], "chars_extracted": len(text),
                    "note": "No API key — returning raw text. Add Gemini key for smart summary."})


# ============================================================
# EMERGENCY SOS  (sends via mailto + shows location)
# ============================================================
@app.route('/api/sos', methods=['POST'])
def emergency_sos():
    """Open email client with emergency message and geo-location."""
    data    = request.json or {}
    contact = data.get('contact', '')      # email or phone (for WhatsApp)
    message = data.get('message', 'EMERGENCY: I need immediate help!')
    lat     = data.get('lat', '')
    lon     = data.get('lon', '')

    # Get location from IP if not provided
    location_str = ''
    maps_url     = ''
    if lat and lon:
        maps_url     = f"https://maps.google.com/?q={lat},{lon}"
        location_str = f"My location: {maps_url}"
    else:
        try:
            req = urllib.request.Request(
                'http://ip-api.com/json/?fields=city,regionName,country,lat,lon',
                headers={'User-Agent': 'JARVIS/3.0'}
            )
            with urllib.request.urlopen(req, timeout=5) as r:
                geo = json.loads(r.read().decode())
            lat, lon = geo.get('lat', ''), geo.get('lon', '')
            city     = geo.get('city', '')
            region   = geo.get('regionName', '')
            country  = geo.get('country', '')
            maps_url = f"https://maps.google.com/?q={lat},{lon}"
            location_str = f"Approximate location: {city}, {region}, {country}\n{maps_url}"
        except Exception:
            location_str = "Location unavailable"

    full_msg = f"{message}\n\n{location_str}\n\n[Sent via JARVIS Emergency SOS]"

    # Open mailto link
    if contact and '@' in contact:
        mailto = f"mailto:{contact}?subject=EMERGENCY+SOS&body={urllib.parse.quote(full_msg)}"
        subprocess.Popen(f'start "" "{mailto}"', shell=True)

    # Also try WhatsApp if phone provided
    if contact and contact.startswith('+'):
        wa_url = f"https://wa.me/{contact.replace('+', '')}?text={urllib.parse.quote(full_msg)}"
        subprocess.Popen(f'start "" "{wa_url}"', shell=True)

    return jsonify({
        "success":    True,
        "message":    full_msg,
        "maps_url":   maps_url,
        "contact":    contact,
        "location":   location_str,
    })


# ============================================================
# USER PROFILE  (stored in ~/.jarvis_profile.json)
# ============================================================
PROFILE_FILE = os.path.join(os.path.expanduser('~'), '.jarvis_profile.json')

def _load_profile():
    if not os.path.exists(PROFILE_FILE):
        return {}
    try:
        with open(PROFILE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}

def _save_profile(p):
    with open(PROFILE_FILE, 'w', encoding='utf-8') as f:
        json.dump(p, f, indent=2)

@app.route('/api/profile', methods=['GET'])
def profile_get():
    return jsonify({"success": True, "profile": _load_profile()})

@app.route('/api/profile/save', methods=['POST'])
def profile_save():
    data = request.json or {}
    p    = _load_profile()
    p.update({k: v for k, v in data.items() if k not in ('success',)})
    p['updated_at'] = time.strftime('%Y-%m-%d %H:%M')
    _save_profile(p)
    return jsonify({"success": True, "profile": p})


# ============================================================
# DAILY SUMMARY  (query-count, tasks, notes, alarms)
# ============================================================
@app.route('/api/summary/daily', methods=['GET'])
def daily_summary():
    try:
        tasks       = _load_tasks()
        pending     = [t for t in tasks if not t.get('done')]
        completed   = [t for t in tasks if t.get('done')]
        profile     = _load_profile()
        mem         = _load_memory()
        notes_index_path = os.path.join(NOTES_DIR, '_index.json')
        notes_count = 0
        if os.path.exists(notes_index_path):
            with open(notes_index_path, 'r', encoding='utf-8') as f:
                notes_count = len(json.load(f))

        name = profile.get('name', 'Sir')
        hour = int(time.strftime('%H'))
        greeting = ('Good morning' if hour < 12 else
                    'Good afternoon' if hour < 17 else 'Good evening')

        summary = {
            "greeting":          f"{greeting}, {name}.",
            "date":              time.strftime('%A, %d %B %Y'),
            "time":              time.strftime('%H:%M'),
            "tasks_pending":     len(pending),
            "tasks_completed":   len(completed),
            "tasks_list":        pending[:5],
            "notes_saved":       notes_count,
            "memories_stored":   len(mem),
            "profile_name":      name,
            "quote":             _daily_quote(),
        }
        return jsonify({"success": True, "summary": summary})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

def _daily_quote():
    quotes = [
        "The only way to do great work is to love what you do. — Steve Jobs",
        "An investment in knowledge pays the best interest. — Benjamin Franklin",
        "It does not matter how slowly you go as long as you do not stop. — Confucius",
        "Success is not final, failure is not fatal: it is the courage to continue that counts. — Churchill",
        "The future belongs to those who believe in the beauty of their dreams. — Eleanor Roosevelt",
        "Strive not to be a success, but rather to be of value. — Albert Einstein",
        "Education is the passport to the future. — Malcolm X",
        "The secret of getting ahead is getting started. — Mark Twain",
    ]
    import random
    return random.choice(quotes)


# ============================================================
# OFFLINE STT — Vosk  (audio file → text)
# ============================================================
@app.route('/api/vosk/transcribe', methods=['POST'])
def vosk_transcribe():
    """
    Transcribe an audio file offline using Vosk.
    Expects: { "audio_path": "<path to wav file>", "lang": "en" }
    Install: pip install vosk
    Download model: https://alphacephei.com/vosk/models
    Place model at ~/vosk-model-en/ or ~/vosk-model-kn/
    """
    data       = request.json or {}
    audio_path = data.get('audio_path', '').strip()
    lang       = data.get('lang', 'en').lower()  # 'en' | 'kn' (Kannada)

    if not audio_path or not os.path.exists(audio_path):
        return jsonify({"success": False,
                        "error": "audio_path is required and must exist on disk"}), 400

    model_dir_map = {
        'en': os.path.join(os.path.expanduser('~'), 'vosk-model-en'),
        'kn': os.path.join(os.path.expanduser('~'), 'vosk-model-kn'),
    }
    model_dir = model_dir_map.get(lang, model_dir_map['en'])

    if not os.path.exists(model_dir):
        return jsonify({
            "success": False,
            "error":   (f"Vosk model not found at {model_dir}. "
                        "Download from https://alphacephei.com/vosk/models "
                        "and extract to ~/vosk-model-en/")
        }), 500

    try:
        from vosk import Model, KaldiRecognizer
        import wave

        model      = Model(model_dir)
        wf         = wave.open(audio_path, 'rb')
        recognizer = KaldiRecognizer(model, wf.getframerate())
        recognizer.SetWords(True)

        results = []
        while True:
            data_chunk = wf.readframes(4000)
            if len(data_chunk) == 0:
                break
            if recognizer.AcceptWaveform(data_chunk):
                r = json.loads(recognizer.Result())
                if r.get('text'):
                    results.append(r['text'])

        final = json.loads(recognizer.FinalResult())
        if final.get('text'):
            results.append(final['text'])

        transcript = ' '.join(results).strip()
        return jsonify({
            "success":    True,
            "transcript": transcript,
            "lang":       lang,
            "model":      model_dir,
        })
    except ImportError:
        return jsonify({
            "success": False,
            "error":   "Vosk not installed. Run: pip install vosk"
        }), 500
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# MULTI-LANGUAGE TRANSLATION HELPER  (EN ↔ Kannada)
# ============================================================
@app.route('/api/lang/detect', methods=['POST'])
def lang_detect():
    """Detect language of input text and transliterate if needed."""
    data = request.json or {}
    text = data.get('text', '').strip()
    if not text:
        return jsonify({"success": False, "error": "text required"}), 400
    try:
        # Simple heuristic: Kannada Unicode range U+0C80–U+0CFF
        kannada_chars = sum(1 for c in text if '\u0C80' <= c <= '\u0CFF')
        total_chars   = len([c for c in text if c.strip()])
        ratio         = kannada_chars / total_chars if total_chars else 0
        if ratio > 0.3:
            lang = 'kn'
        else:
            # Check for common Kannada transliteration keywords
            kn_words = ['nimage', 'namaskara', 'hegle', 'idheya', 'gottilla',
                        'aagbeku', 'madona', 'banni', 'hogona', 'yenu']
            lang = 'kn' if any(w in text.lower() for w in kn_words) else 'en'

        return jsonify({"success": True, "lang": lang,
                        "kannada_ratio": round(ratio, 2), "text": text})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# START
# ============================================================
if __name__ == '__main__':
    print("=" * 55)
    print("  JARVIS — System Control Backend v4.0")
    port = int(os.environ.get("PORT", 5501))
    print(f"  Running at: http://127.0.0.1:{port}")
    print("  New: Tasks | Notes | PDF | SOS | Profile | Vosk")
    print("=" * 55)
    app.run(host='0.0.0.0', port=port, debug=False)

