with open(r'd:\Jarvis-AI-main\_voice_cmds.js', 'r', encoding='utf-8') as f:
    new_block = f.read()
with open(r'd:\Jarvis-AI-main\app.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_marker = '  return null; // not a system command\n}'
if old_marker not in content:
    print('ERROR: marker not found')
else:
    content = content.replace(old_marker, new_block, 1)
    with open(r'd:\Jarvis-AI-main\app.js', 'w', encoding='utf-8') as f:
        f.write(content)
    lines = content.count('\n')
    print('Done. Total lines: ' + str(lines))
    for c in ['wikipedia', 'speedtest', 'brightness', 'translate', 'alarmMatch', 'virus/scan', 'whatsapp']:
        status = 'OK' if c in content else 'MISSING'
        print('  ' + c + ': ' + status)
