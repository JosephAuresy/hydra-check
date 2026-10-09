"""Inline the modules in src/ into index.html between the HDA:src markers.

index.html stays a single self-contained file (it works offline and from GitHub Pages);
src/ is the editable source. Run:  python build.py
"""
import io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ORDER = ['characterize.js', 'advice.js', 'char_ui.js']          # dependency order
START, END = '/*<<HDA:src:start>>*/', '/*<<HDA:src:end>>*/'

def main():
    p = os.path.join(HERE, 'index.html')
    with io.open(p, 'r', encoding='utf-8', newline='') as fh:
        html = fh.read()
    eol = '\r\n' if '\r\n' in html else '\n'
    a, b = html.find(START), html.find(END)
    if a < 0 or b < 0 or b < a:
        sys.exit('markers not found in index.html')
    parts = []
    for name in ORDER:
        with io.open(os.path.join(HERE, 'src', name), 'r', encoding='utf-8', newline='') as fh:
            parts.append('/* ---- src/' + name + ' ---- */' + '\n' + fh.read().replace('\r\n', '\n'))
    body = '\n'.join(parts).replace('\n', eol)
    new = html[:a + len(START)] + eol + body + eol + html[b:]
    if new == html:
        print('index.html already up to date'); return
    with io.open(p, 'w', encoding='utf-8', newline='') as fh:
        fh.write(new)
    print('index.html updated:', len(new) // 1024, 'KB')

if __name__ == '__main__':
    main()
