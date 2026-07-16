"""
Иконки PWA: icons/icon-192.png и icons/icon-512.png
Сейчас — кастомный арт (W + неон). Перегенерация из master:

  python generate_icons.py path/to/master.jpg

Нужен Pillow: pip install Pillow
"""
try:
    from PIL import Image
except ImportError:
    import subprocess, sys
    subprocess.run([sys.executable, '-m', 'pip', 'install', 'Pillow'], check=True)
    from PIL import Image

import os, sys

os.makedirs('icons', exist_ok=True)

def square_crop(im):
    w, h = im.size
    s = min(w, h)
    left = (w - s) // 2
    top = (h - s) // 2
    return im.crop((left, top, left + s, top + s))

def export_from(src_path):
    im = Image.open(src_path).convert('RGBA')
    im = square_crop(im)
    for sz in (192, 512, 1024):
        out = im.resize((sz, sz), Image.Resampling.LANCZOS)
        path = os.path.join('icons', f'icon-{sz}.png' if sz != 1024 else 'icon-1024.png')
        out.save(path, 'PNG')
        print('OK', path)

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python generate_icons.py master.jpg')
        print('Иконки уже лежат в icons/ — этот скрипт только для пересборки из master.')
        sys.exit(0)
    export_from(sys.argv[1])
