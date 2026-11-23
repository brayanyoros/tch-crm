-- Cadastros iniciais da TCH Experiência (idempotente). Sem usuários, canais ou leads:
-- usuários entram por convite (admin-users) e canais com os IDs reais da Meta.
insert into public.pipeline_stages (name, position, chance)
select * from (values ('Novo contato', 0, 10), ('Em atendimento', 1, 25), ('Proposta enviada', 2, 50), ('Negociação', 3, 75), ('Fechado ganho', 4, 100)) s
where not exists (select 1 from public.pipeline_stages);

insert into public.tags (name, color) values
  ('Showroom', 'champanhe'), ('Arquiteto', 'lago'), ('Prioridade', 'vinho'), ('Retorno', 'areia'), ('Indicação', 'floresta'),
  ('Visita agendada', 'oliva'), ('Anúncio', 'neutro'), ('Condomínio', 'grafite'), ('Pousada', 'areia'), ('Sauna', 'champanhe')
on conflict do nothing;

insert into public.products (name, category, price) values
  ('Sauna a vapor 4 pessoas', 'Saunas', 38900), ('Sauna seca finlandesa 6 pessoas', 'Saunas', 52300),
  ('Sauna barril 4 pessoas', 'Saunas', 34700), ('Ofurô em cedro 2 pessoas', 'Banheiras', 17800),
  ('Banheira de imersão', 'Banheiras', 21500), ('Banheira de hidromassagem externa', 'Banheiras', 29400),
  ('Fire pit em aço corten', 'Fire pits', 6800), ('Fire pit e lounge para deck', 'Fire pits', 41200),
  ('Conjunto de móveis outdoor', 'Mobiliário', 14200), ('Par de espreguiçadeiras em teca', 'Mobiliário', 9700),
  ('Banco curvo para fire pit', 'Mobiliário', 4400), ('Sauna e banheira de imersão', 'Combinações', 86500)
on conflict do nothing;

insert into public.quick_replies (shortcut, text) values
  ('/prazo', 'O prazo de entrega é de 25 a 30 dias úteis após a confirmação do pedido.'),
  ('/instalacao', 'A instalação está inclusa num raio de 60 km do showroom. Fora desse raio, enviamos o valor junto com o frete.'),
  ('/visita', 'Podemos agendar uma visita técnica sem custo para medir o espaço e indicar os pontos de água e energia. Qual dia fica melhor para você?'),
  ('/showroom', 'Nosso showroom fica em Teresópolis. Abrimos de segunda a sábado, das 9h às 18h.')
on conflict do nothing;

update public.app_settings set
  off_message = 'Recebemos sua mensagem. O showroom abre de segunda a sábado, das 9h às 18h, e respondemos assim que abrir.'
where off_message = '';
