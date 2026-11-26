"""Gera as páginas legais estáticas do site (politica-de-privacidade/, politica-de-cookies/, termos-de-uso/,
compras-entregas-e-devolucoes/). Edite o texto aqui e rode: python site/_paginas.py
Trechos marcados "a confirmar" são dados da empresa que ainda faltam (CNPJ, razão social, encarregado etc.)."""
import html, pathlib

ROOT = pathlib.Path(__file__).parent
VER = 'Versão 2.0 · Atualizado em 26/11/2026'
END = 'Rod. Dr. José de Moura Estevão, 188 · Loja 9 + Anexo, Teresópolis – RJ'
WA = '<a href="https://wa.me/5521999664099" target="_blank" rel="noopener">WhatsApp (21) 99966-4099</a>'
FALTA = lambda s: f'<mark>a confirmar: {s}</mark>'

PAGES = {
'politica-de-privacidade': ('Política de privacidade', 'Explicamos, de forma direta, quais dados pessoais tratamos, para quê, com quem compartilhamos e como você exerce seus direitos.', [
  ('h2', '1. Quem é o controlador'),
  ('p', f'O controlador dos dados pessoais tratados por meio deste site é {FALTA("razão social")}, nome fantasia TCH Experiência, inscrita no CNPJ {FALTA("CNPJ")}, com endereço em {END}.'),
  ('h2', '2. Quais dados tratamos'),
  ('ul', [
    'Atendimento pelo WhatsApp: ao clicar em um botão de WhatsApp, a conversa acontece no aplicativo WhatsApp, da Meta. Recebemos os dados que você nos envia por lá, como seu número, o nome do seu perfil e as mensagens.',
    'Registros de acesso: a hospedagem do site registra dados técnicos de cada acesso, como endereço IP, data e hora, página acessada e tipo de navegador.',
    'O site não tem formulário, não pede cadastro e não usa cookies, ferramentas de análise ou de marketing.']),
  ('h2', '3. Finalidades e bases legais'),
  ('table', [['Finalidade', 'Dados', 'Base legal (LGPD)'],
    ['Responder ao seu contato, enviar valores e condições e agendar visitas à loja', 'Dados do WhatsApp', 'Procedimentos preliminares relacionados a contrato, a pedido do titular (art. 7º, V)'],
    ['Guardar registros de acesso ao site', 'Registros de acesso', 'Cumprimento de obrigação legal (art. 7º, II), conforme o art. 15 do Marco Civil da Internet'],
    ['Manter a segurança do site e prevenir abusos', 'Registros de acesso', 'Legítimo interesse (art. 7º, IX)']]),
  ('h2', '4. Com quem compartilhamos'),
  ('p', 'Não vendemos dados pessoais. Compartilhamos apenas o necessário com fornecedores que viabilizam o serviço:'),
  ('ul', [
    'Hospedagem do site: Vercel Inc., que processa os acessos e os registros técnicos.',
    'Fontes tipográficas: Google Fonts. Ao abrir o site, seu navegador baixa as fontes dos servidores do Google, que recebem o seu endereço IP.',
    'WhatsApp (Meta) e Instagram (Meta): quando você escolhe falar conosco ou nos visitar por lá.',
    'Google Maps: apenas quando você clica em “Como chegar”, que abre o mapa no site do Google.']),
  ('h2', '5. Transferência internacional'),
  ('p', 'Alguns fornecedores, como a hospedagem (Vercel), o Google e a Meta, podem processar dados fora do Brasil. Nesses casos, a transferência segue o art. 33 da LGPD, com as garantias oferecidas por esses fornecedores.'),
  ('h2', '6. Por quanto tempo guardamos'),
  ('ul', [
    f'Conversas comerciais: {FALTA("prazo de retenção das conversas")}.',
    'Registros de acesso: pelo prazo mínimo de 6 meses exigido pelo Marco Civil da Internet.']),
  ('h2', '7. Segurança'),
  ('p', 'O site usa conexão criptografada (HTTPS), cabeçalhos de segurança e não coleta dados além dos registros técnicos de acesso. O acesso às conversas de atendimento é restrito a quem precisa delas para atender você.'),
  ('h2', '8. Seus direitos'),
  ('p', 'Pelo art. 18 da LGPD, você pode solicitar a qualquer momento:'),
  ('ul', ['confirmação de que tratamos seus dados e acesso a eles;', 'correção de dados incompletos, inexatos ou desatualizados;',
    'anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade;',
    'portabilidade, informação sobre com quem compartilhamos e eliminação dos dados tratados com consentimento;',
    'revogação do consentimento e oposição a tratamentos.']),
  ('p', 'Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).'),
  ('h2', '9. Canal de privacidade'),
  ('p', f'Encarregado pelo tratamento de dados: {FALTA("nome do encarregado")}. Contato: {FALTA("e-mail de privacidade")} ou {WA}.'),
  ('h2', '10. Alterações'),
  ('p', 'Esta política pode ser atualizada. A versão e a data da última atualização aparecem no início da página.'),
]),
'politica-de-cookies': ('Política de cookies', 'Listamos apenas as tecnologias que o site realmente usa.', [
  ('h2', '1. O que usamos'),
  ('p', 'Este site não grava cookies nem dados no armazenamento local do seu navegador, e não usa ferramentas de análise ou de marketing. Por isso não exibimos aviso de cookies.'),
  ('p', 'Se alguma ferramenta de análise ou marketing for ativada no futuro, ela será listada aqui e só funcionará depois do seu consentimento.'),
  ('h2', '2. Conteúdo de terceiros'),
  ('p', 'As fontes tipográficas são carregadas do Google Fonts, que recebe o seu endereço IP mas não grava cookies para isso. Os botões de WhatsApp, Instagram e “Como chegar” abrem serviços externos, que seguem as políticas da Meta e do Google.'),
  ('h2', '3. Mais informações'),
  ('p', 'Veja como tratamos dados pessoais na <a href="/politica-de-privacidade/">Política de privacidade</a>.'),
]),
'termos-de-uso': ('Termos de uso', 'Ao navegar neste site, você concorda com estas condições. Elas não afastam nenhum direito garantido pelo Código de Defesa do Consumidor.', [
  ('h2', '1. Quem somos'),
  ('p', f'Este site pertence a {FALTA("razão social")} (TCH Experiência), CNPJ {FALTA("CNPJ")}, com loja em {END}.'),
  ('h2', '2. Finalidade do site'),
  ('p', 'O site apresenta as saunas, banheiras, spas e demais produtos da TCH Experiência e permite pedir orçamento e agendar visitas pelo WhatsApp. O site não realiza vendas nem pagamentos online.'),
  ('h2', '3. Catálogo e informações comerciais'),
  ('ul', [
    'Os valores exibidos são de referência e não constituem oferta. Preço, disponibilidade e condições são confirmados no orçamento.',
    'Fotos, cores e texturas podem variar conforme a tela e o lote de fabricação. Algumas imagens são ambientações ilustrativas.',
    'Medidas, acabamentos e configurações são confirmados no orçamento.',
    'Em caso de erro evidente de informação, a equipe corrigirá e avisará antes de qualquer confirmação de compra.']),
  ('h2', '4. Atendimento pelo WhatsApp'),
  ('p', 'Enviar uma mensagem, inclusive a gerada pelo “Monte sua sauna”, é um pedido de informações. Por si só, não representa um pedido confirmado nem uma compra. A compra só se forma quando você aprova o orçamento com preço, prazo e condições informados pela equipe.'),
  ('h2', '5. Uso permitido'),
  ('p', 'Você pode navegar e compartilhar links do site. Não é permitido usar o site para fins ilícitos, tentar invadir ou sobrecarregar sistemas, nem enviar conteúdo falso ou ofensivo pelos canais de atendimento.'),
  ('h2', '6. Propriedade intelectual'),
  ('p', 'A marca TCH Experiência, os textos, as fotos e a identidade visual do site pertencem à empresa. A reprodução para fins comerciais depende de autorização.'),
  ('h2', '7. Links externos'),
  ('p', 'O site contém links para serviços de terceiros, como WhatsApp, Instagram e Google Maps. Esses serviços seguem políticas próprias, pelas quais a TCH Experiência não responde.'),
  ('h2', '8. Privacidade'),
  ('p', 'O tratamento de dados pessoais está descrito na <a href="/politica-de-privacidade/">Política de privacidade</a> e na <a href="/politica-de-cookies/">Política de cookies</a>.'),
  ('h2', '9. Atualizações'),
  ('p', 'Estes termos podem ser atualizados. A versão e a data aparecem no início da página.'),
  ('h2', '10. Contato'),
  ('p', f'Dúvidas sobre estes termos: {WA}.'),
]),
'compras-entregas-e-devolucoes': ('Compras, entregas e devoluções', 'Como funciona a compra com a TCH Experiência, do primeiro contato ao pós-venda. Nada aqui reduz os seus direitos previstos no Código de Defesa do Consumidor.', [
  ('h2', '1. Como comprar'),
  ('ul', ['Escolha o modelo no site ou monte a sua sauna e fale com a equipe pelo WhatsApp, ou visite a loja.',
    'A equipe confirma disponibilidade, medidas, acabamentos, preço, prazo e condições.',
    'A compra só é confirmada quando você aprova o orçamento.']),
  ('h2', '2. Atendimento comercial'),
  ('p', f'Atendimento pelo {WA} e na loja: {END}. Horários: {FALTA("horários de atendimento")}.'),
  ('h2', '3. Disponibilidade e preços'),
  ('p', 'Os valores exibidos no site são de referência e não constituem oferta. O preço final, a disponibilidade e as condições constam do orçamento. Opcionais, integração com piscina e frete são orçados à parte.'),
  ('h2', '4. Formas de pagamento'),
  ('p', 'À vista ou parcelado no cartão: saunas em até 24× e banheiras e spas em até 12×. As condições de cada parcelamento constam do orçamento.'),
  ('h2', '5. Entrega e frete'),
  ('ul', ['Prazo: entrega prevista em cerca de 30 dias; o prazo exato consta do orçamento.',
    'Frete: não incluso nos valores do site; calculado no orçamento conforme o endereço.',
    f'Regiões atendidas: {FALTA("regiões atendidas")}.']),
  ('h2', '6. Instalação'),
  ('p', FALTA('condições de instalação')),
  ('h2', '7. Garantias'),
  ('ul', ['Garantia legal: todos os produtos têm a garantia prevista no Código de Defesa do Consumidor. Para produtos duráveis, você pode reclamar de vícios aparentes em até 90 dias após a entrega (art. 26). No caso de vício oculto, o prazo começa quando o defeito aparece. Se o vício não for sanado em até 30 dias, você pode escolher a troca do produto, a devolução do valor pago ou o abatimento do preço (art. 18).',
    f'Garantia contratual: {FALTA("garantia contratual oferecida")}. Ela complementa a garantia legal e não a substitui (art. 50).']),
  ('h2', '8. Direito de arrependimento'),
  ('p', 'Em compras feitas fora do estabelecimento comercial, como pelo WhatsApp ou telefone, você pode desistir em até 7 dias a contar da assinatura do contrato ou do recebimento do produto, com devolução integral dos valores pagos, inclusive frete (art. 49 do CDC).'),
  ('h2', '9. Trocas e devoluções'),
  ('p', FALTA('procedimento de trocas e devoluções')),
  ('h2', '10. Cancelamentos'),
  ('p', FALTA('regras de cancelamento')),
  ('h2', '11. Suporte pós-venda'),
  ('p', f'{FALTA("como funciona o pós-venda")}. Para qualquer solicitação, fale pelo {WA}.'),
]),
}

LINKS = [('politica-de-privacidade', 'Privacidade'), ('politica-de-cookies', 'Cookies'), ('termos-de-uso', 'Termos de uso'), ('compras-entregas-e-devolucoes', 'Compras e entregas')]

CSS = '''*{box-sizing:border-box}body{margin:0;background:#FAF9F6;color:#101010;font-family:Montserrat,system-ui,sans-serif;font-size:16px;line-height:1.7;-webkit-font-smoothing:antialiased}
a{color:#7A5F33}a:hover{color:#101010}
.wrap{max-width:820px;margin:0 auto;padding:0 24px}
header{background:#101010;position:relative}header::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;background:linear-gradient(90deg,#6E552D,#C6A667 40%,#F3E2B0 62%,#B8975A 85%,#6E552D);opacity:.6}
header .wrap{display:flex;justify-content:space-between;align-items:center;min-height:76px;gap:16px}header img{height:34px;width:auto;display:block}
header a.back{color:#E9D39C;font-size:12px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;text-decoration:none}
main{padding:64px 0 88px}
.eyebrow{font-size:11.5px;font-weight:600;letter-spacing:.26em;text-transform:uppercase;color:#7A5F33}
h1{font-size:clamp(32px,5vw,48px);line-height:1.1;letter-spacing:-.015em;margin:14px 0 0;font-weight:600}h1 em{font-family:'Playfair Display',Georgia,serif;font-weight:400;color:#7A5F33}
.lead{font-size:17px;color:#5E5A53;margin:16px 0 0}.ver{font-size:13px;color:#A39E95;margin:10px 0 0}
h2{font-size:20px;margin:44px 0 10px;padding-top:24px;border-top:1px solid #E3DDD1}
p{margin:0 0 12px}ul{margin:0 0 12px;padding-left:20px}li{margin:0 0 8px}
mark{background:#F3EFE7;color:#7A5F33;padding:1px 6px;border-radius:4px}
.tbl{overflow-x:auto;margin:8px 0 12px}table{border-collapse:collapse;width:100%;font-size:14px;min-width:520px}th,td{text-align:left;vertical-align:top;padding:10px 12px;border-bottom:1px solid #E3DDD1}th{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7A5F33}
footer{background:#0A0A0A;color:#A39E95;font-size:13px;padding:28px 0}footer .wrap{display:flex;flex-wrap:wrap;gap:10px 22px;justify-content:space-between}footer nav{display:flex;flex-wrap:wrap;gap:8px 18px}footer a{color:#D9D4CA;text-decoration:none}footer a:hover,footer a[aria-current]{color:#E9D39C}'''

def block(kind, val):
    if kind == 'h2': return f'<h2>{val}</h2>'
    if kind == 'p': return f'<p>{val}</p>'
    if kind == 'ul': return '<ul>' + ''.join(f'<li>{x}</li>' for x in val) + '</ul>'
    if kind == 'table':
        head, *rows = val
        return ('<div class="tbl"><table><thead><tr>' + ''.join(f'<th>{h}</th>' for h in head) + '</tr></thead><tbody>'
                + ''.join('<tr>' + ''.join(f'<td>{c}</td>' for c in r) + '</tr>' for r in rows) + '</tbody></table></div>')
    raise ValueError(kind)

def footer_nav(cur=None):
    return ''.join(f'<a href="/{s}/"{" aria-current=\"page\"" if s == cur else ""}>{n}</a>' for s, n in LINKS)

for slug, (title, lead, blocks) in PAGES.items():
    first, last = title.rsplit(' ', 1) if ' ' in title else ('', title)
    page = f'''<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)} · TCH Experiência</title>
<meta name="description" content="{html.escape(lead)}">
<link rel="icon" href="/img/icone.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600&family=Playfair+Display:ital@1&display=swap" rel="stylesheet">
<style>{CSS}</style>
</head>
<body>
<header><div class="wrap"><a href="/" aria-label="TCH Experiência, página inicial"><img src="/img/logo-horizontal.png" alt="TCH Experiência" width="230" height="40"></a><a class="back" href="/">← Voltar ao site</a></div></header>
<main><div class="wrap">
<span class="eyebrow">TCH Experiência</span>
<h1>{first} <em>{last}.</em></h1>
<p class="lead">{lead}</p>
<p class="ver">{VER}</p>
{chr(10).join(block(k, v) for k, v in blocks)}
</div></main>
<footer><div class="wrap"><span>© 2026 TCH Experiência</span><nav aria-label="Políticas">{footer_nav(slug)}</nav></div></footer>
</body>
</html>
'''
    d = ROOT / slug; d.mkdir(exist_ok=True)
    (d / 'index.html').write_text(page, encoding='utf-8')
    print('ok', slug)
