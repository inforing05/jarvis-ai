
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
# REAL WEATHER (wttr.in — no API key needed)
# ============================================================
@app.route('/api/weather/real', methods=['POST'])
def real_weather():
    data = request.json or {}
    city = data.get('city', 'auto').strip().replace(' ', '+')
    try:
        url = f"https://wttr.in/{city}?format=j1"
        req = urllib.request.Request(url, headers={'User-Agent': 'curl/7.80.0'})
        with urllib.request.urlopen(req, timeout=8) as resp:
            raw = json.loads(resp.read().decode('utf-8'))
        cur  = raw['current_condition'][0]
        area = raw['nearest_area'][0]
        return jsonify({
            "success":      True,
            "city":         f"{area['areaName'][0]['value']}, {area['country'][0]['value']}",
            "temp_c":       cur['temp_C'],
            "temp_f":       cur['temp_F'],
            "feels_like_c": cur['FeelsLikeC'],
            "humidity":     cur['humidity'],
            "description":  cur['weatherDesc'][0]['value'],
            "wind_kmph":    cur['windspeedKmph'],
            "visibility":   cur['visibility'],
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================
# WHATSAPP (pywhatkit)
# ============================================================
@app.route('/api/whatsapp', methods=['POST'])
def send_whatsapp():
    data = request.json or {}
    phone   = data.get('phone', '')
    message = data.get('message', '')
    if not phone or not message:
        return jsonify({"success": False, "error": "phone and message required"}), 400
    try:
        import pywhatkit as pw
        now = datetime.datetime.now()
        pw.sendwhatmsg(phone, message, now.hour, now.minute + 1,
                       wait_time=20, tab_close=True)
        return jsonify({"success": True, "phone": phone, "message": message})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


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

