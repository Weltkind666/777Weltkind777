"""
Генерация иконок для PWA (192x192 и 512x512)
Запустить один раз: python generate_icons.py
Нужен Pillow: pip install Pillow
"""
try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    import subprocess, sys
    subprocess.run([sys.executable, '-m', 'pip', 'install', 'Pillow'], check=True)
    from PIL import Image, ImageDraw, ImageFont

import os, math

os.makedirs('icons', exist_ok=True)

def draw_icon(size):
    img = Image.new('RGBA', (size, size), (0,0,0,0))
    d = ImageDraw.Draw(img)
    # Фон — скруглённый прямоугольник
    pad = size // 8
    d.rounded_rectangle([0, 0, size, size], radius=size//5,
                         fill=(12, 10, 30, 255))
    # Градиентный круг / форма
    for i in range(size//2, 0, -1):
        t = i / (size//2)
        r = int(124 * t + 0 * (1-t))
        g = int(92 * t + 229 * (1-t))
        b = int(252 * t + 255 * (1-t))
        a = int(200 * (1 - t*0.7))
        cx, cy = size//2, size//2
        d.ellipse([cx-i, cy-i, cx+i, cy+i], fill=(r, g, b, a))
    # Буква
    text = 'M'
    fs = size // 2
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', fs)
    except:
        font = ImageFont.load_default()
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2]-bbox[0], bbox[3]-bbox[1]
    d.text(((size-tw)//2, (size-th)//2 - bbox[1]//2), text,
           fill=(255,255,255,230), font=font)
    return img

for sz in [192, 512]:
    draw_icon(sz).save(f'icons/icon-{sz}.png', 'PNG')
    print(f'✅ icons/icon-{sz}.png создан')

print('Готово! Иконки сгенерированы.')
