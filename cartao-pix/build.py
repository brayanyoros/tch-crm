"""Gera cartao-pix.html (com extras), _card.html (so o cartao) e payload.txt.
Logo do Santander: coloque santander.svg ou santander.png nesta pasta (arquivo oficial) e rode de novo."""
import base64, io, os, re, segno
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__))
KEY, NAME, CITY = "70078584000101", "TCH EXPERIENCIA MOVEIS E MADEIRAS LTDA", "TERESOPOLIS"

def tlv(i, v): return f"{i}{len(v):02d}{v}"
def crc16(s):
    c = 0xFFFF
    for b in s.encode():
        c ^= b << 8
        for _ in range(8): c = ((c << 1) ^ 0x1021 if c & 0x8000 else c << 1) & 0xFFFF
    return f"{c:04X}"
body = (tlv("00", "01") + tlv("01", "11")
        + tlv("26", tlv("00", "br.gov.bcb.pix") + tlv("01", KEY))
        + tlv("52", "0000") + tlv("53", "986") + tlv("58", "BR")
        + tlv("59", NAME[:25].strip()) + tlv("60", CITY) + tlv("62", tlv("05", "***")) + "6304")
payload = body + crc16(body)
open(f"{D}/payload.txt", "w").write(payload)

qr = segno.make(payload, error="h", micro=False)
buf = io.BytesIO()
qr.save(buf, kind="svg", border=4, xmldecl=False, svgns=True, nl=False, dark="#101010", light=None, omitsize=True, scale=1)
qr_svg = buf.getvalue().decode()
qr_svg = re.sub(r'<svg ', '<svg id="qr" ', qr_svg, 1)

def b64(p): return base64.b64encode(open(p, "rb").read()).decode()
fonts = "".join(
    f"@font-face{{font-family:Montserrat;font-weight:{w};src:url(data:font/ttf;base64,{b64(f'{D}/fonts/mont-{w}.ttf')}) format('truetype')}}"
    for w in (300, 400, 600, 700)) + f"@font-face{{font-family:'Playfair Display';font-style:italic;font-weight:400;src:url(data:font/ttf;base64,{b64(f'{D}/fonts/playfair-italic-400.ttf')}) format('truetype')}}"
im = Image.open(f"{D}/brand/simbolo.png"); im.thumbnail((520, 320)); lb = io.BytesIO(); im.save(lb, "PNG", optimize=True)
logo_tch = f"data:image/png;base64,{base64.b64encode(lb.getvalue()).decode()}"

sant = None
for ext, mime in (("svg", "image/svg+xml"), ("png", "image/png")):
    p = f"{D}/santander.{ext}"
    if os.path.exists(p): sant = f"data:{mime};base64,{b64(p)}"
def sant_el(cls): return (f'<img class="{cls}" src="{sant}" alt="Santander">' if sant
                          else f'<span class="{cls} ph">[LOGO SANTANDER]</span>')

# ondas douradas do material grafico (Cartao-Verso), deslocadas para o rodape do cartao
waves = "".join(
    f'<path d="M-10 {1305+i*3.6:.1f} C 380 {1338+i*2:.1f} 700 {1292+i*3:.1f} 1090 {1298+i*3.6:.1f}" opacity="{round(min(.16+i*.05,.55),2)}"'
    + (' stroke="url(#ghl)" stroke-width="2.4"' if i == 9 else '') + '/>' for i in range(15))
html = open(f"{D}/template.html", encoding="utf-8").read()
for k, v in {"{{FONTS}}": fonts, "{{QR}}": qr_svg, "{{LOGO_TCH}}": logo_tch, "{{WAVES}}": waves, "{{PAYLOAD}}": payload,
             "{{SANT_QR}}": sant_el("sant-qr"), "{{SANT_LINE}}": sant_el("sant-line")}.items():
    html = html.replace(k, v)
open(f"{D}/cartao-pix.html", "w", encoding="utf-8").write(html)
open(f"{D}/_card.html", "w", encoding="utf-8").write(html.replace("<body>", '<body class="render">'))
print(payload, "| santander:", bool(sant))
