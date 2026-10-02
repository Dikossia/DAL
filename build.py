"""Собирает автономные файлы (всё встроено, открываются двойным щелчком):
   Dal.html     — сайт для учеников (из index.html)
   Studio.html  — кабинет эксперта (из studio.html)
А также *-artifact.html — варианты для публикации в Claude."""
import base64, json, re, pathlib

root = pathlib.Path(__file__).parent
read = lambda n: (root / n).read_text(encoding='utf8')
b64 = lambda n: base64.b64encode((root / n).read_bytes()).decode()

FONTS = {f"url('assets/{f}.ttf')": f"url('data:font/ttf;base64,{b64('assets/' + f + '.ttf')}')" for f in ('manrope-regular', 'manrope-bold')}
IMAGES = {p.stem: 'data:image/jpeg;base64,' + b64('assets/' + p.name) for p in sorted((root / 'assets').glob('*.jpg'))}
LIBS = {'assets/lucide.min.js'}


def build(source, out, artifact_out):
    html = read(source)
    def inline_css(m):
        css = read(m.group(1))
        for k, v in FONTS.items():
            css = css.replace(k, v)
        return f'<style>{css}</style>'
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', inline_css, html)
    srcs = re.findall(r'<script src="([^"]+)" defer></script>', html)
    html = re.sub(r'\s*<script src="[^"]+" defer></script>', '', html)
    scripts = []
    for s in srcs:
        scripts.append(read(s))
        if s in LIBS:  # картинки встраиваем сразу после библиотеки иконок
            scripts.append('window.DAL_IMAGES = ' + json.dumps(IMAGES) + ';')
    html = html.replace('</body>', ''.join(f'<script>{s}</script>\n' for s in scripts) + '</body>')
    (root / out).write_text(html, encoding='utf8')

    head = re.search(r'<head>(.*?)</head>', html, re.S).group(1)
    head = re.sub(r'\s*<meta (charset|name="viewport")[^>]*>', '', head)
    body_tag = re.search(r'<body([^>]*)>', html).group(1)
    body = re.search(r'<body[^>]*>(.*?)</body>', html, re.S).group(1)
    cls = re.search(r'class="([^"]+)"', body_tag)
    boot = f"<script>document.body.classList.add({json.dumps(cls.group(1))});</script>\n" if cls else ''
    art = head.strip() + '\n<style>body{background:var(--bg);color:var(--text)}</style>\n' + boot + body
    (root / artifact_out).write_text(art, encoding='utf8')
    print(out, len(html), '|', artifact_out, len(art))


build('index.html', 'Dal.html', 'artifact.html')
build('studio.html', 'Studio.html', 'studio-artifact.html')
