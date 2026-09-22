-- Espelho do que foi criado pela tela "New Table" do Railway (schema public, prefixo rastreio_).
-- ponytail: sem CHECK de status, FK e índice parcial (a UI não cria). Status é validado no domínio;
-- com ~24 mil corridas/ano a busca por telefone sem índice é trivial. Criar o índice se passar de ~500 mil linhas.

create table if not exists rastreio_corridas (
  id              serial primary key,
  autocab_booking text unique,     -- webhook repetido do Autocab não duplica corrida
  telefone        text,            -- E.164: +5511999999999
  nome_cliente    text,
  motorista_id    text,
  token           text unique,     -- /r/{token} do link de rastreio
  status          text,            -- ATIVA | FINALIZADA | CANCELADA (validado no código)
  criado_em       text,  -- ISO 8601 UTC (toISOString): ordena certo como texto
  finalizado_em   text        
);

create table if not exists rastreio_mensagens (
  id          serial primary key,
  corrida_id  integer,             -- rastreio_corridas.id
  origem      text,                -- CLIENTE | MOTORISTA
  texto       text,
  externo_id  text unique,         -- id da Evolution/Autocab: não reprocessa a mesma msg
  criado_em   text  -- ISO 8601 UTC (toISOString): ordena certo como texto
);
