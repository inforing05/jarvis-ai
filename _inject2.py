with open(r'd:\Jarvis-AI-main\_voice_cmds2.js', 'r', encoding='utf-8') as f:
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
    print('Done. Lines: ' + str(content.count('\n')))
    for c in ['memory/set', 'memory/get', 'camera/describe', 'camera/detect', 'file_ops', 'remMatch', 'recallMatch']:
        print('  ' + c + ': ' + ('OK' if c in content else 'MISSING'))
