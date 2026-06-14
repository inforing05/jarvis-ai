
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

