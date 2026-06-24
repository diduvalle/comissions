# COMISSIONS — Ideias de Analytics

> Estado atual (página **Resumo**): 4 KPIs (comissão ganha / pago / por pagar / bónus), gráfico de comissão por mês, melhor mês e top 5 clientes.
> Objetivo: transformar o "Resumo" num verdadeiro centro de analytics. Abaixo, todas as ideias agrupadas por tema. Cada uma indica **dados** que usa e **esforço** (🟢 fácil, dados que já temos · 🟡 médio · 🔴 precisa de dados novos).

---

## 1. Desempenho pessoal & metas
- **Meta mensal/anual + progresso** — medidor (gauge/bullet) "ganhaste X€ de Y€ (Z%)". 🔴 (tabela `metas`)
- **Comissão acumulada (YTD)** vs mesmo período do ano anterior. 🟢
- **Run-rate anual** — "ao ritmo atual fechas o ano em ~X€". 🟢
- **Recordes** — melhor mês/trimestre de sempre; "estás a Y€ do teu recorde". 🟢
- **Médias** — comissão média por projeto, ticket médio de venda, nº de projetos/mês. 🟢

## 2. Recorrente vs pontual ⭐ (a jóia, dado o teu modelo Setup + SaaS)
- **Separar comissão Recorrente (SaaS) de Pontual (Setup/Serviços)** — dois números distintos. 🟢
- **Base recorrente (MRR/ARR de comissão)** — soma das comissões SaaS mensais ativas × 12 = rendimento previsível anual. 🟢
- **Crescimento da carteira recorrente** — waterfall mês a mês: novo SaaS (+), perdido (−). 🟡
- **% do rendimento que é recorrente** — quanto mais alto, mais previsível o teu ano. 🟢
- **Comissão recorrente "garantida"** dos próximos meses (SaaS já vendido × meses de contrato a decorrer). 🟡

## 3. Saúde de pagamentos / cash-flow
- **Pendente vs pago ao longo do tempo** — área empilhada. 🟢
- **Aging dos pendentes** — há quanto tempo estão por pagar (0–30 / 31–60 / 60+ dias). Mostra o que está "preso". 🟢
- **Tempo médio até pagamento** — da data de envio à marcação como paga. 🟢 (usa `envios`)
- **Taxa de pagamento por mês** — % que o diretor efetivamente paga vs comissão apresentada. 🟢
- **Valor preso em "parciais"** — comissões pagas a meias. 🟢

## 4. Previsão / forecast
- **Projeção anual** — run-rate + recorrente garantido. 🟡
- **Pipeline de comissão potencial** — usar `projeto_valores` **sem comissão lançada** (os tais 44!): comissão à espera de ser registada/ganha. 🟢
- **Probabilidade por estado do projeto** — ponderar o pipeline pela fase (proposta vs adjudicado). 🔴 (capturar estado do projeto)
- **Tendência (regressão linear)** — linha de tendência sobre os meses. 🟢

## 5. Por cliente
- **Top clientes** (já existe) + **concentração** — % que os top 5 representam do total (risco de dependência). 🟢
- **Clientes recorrentes vs únicos** — quantos compram repetidamente. 🟢
- **Lifetime por cliente** — Setup + SaaS acumulado por entidade. 🟢
- **Novos clientes por mês** — aquisição. 🟢
- **Heatmap cliente × mês** — onde e quando há atividade. 🟡

## 6. Por produto / marca
- **Mix de comissão por produto** — donut: Setup Fee, SaaS<24, SaaS>24, Serviços, Alojamento. 🟢
- **Produto que mais rende** e tendência por produto ao longo do tempo. 🟢
- **Cross-sell** — nº médio de produtos por projeto. 🟢
- **Por marca (Host / CLEVER / hey! / Profile)** — comparar marcas. 🔴 (guardar a marca em cada comissão)

## 7. Bónus
- **Bónus por mês/ano** e **% do total** que representa. 🟢
- **Bónus médio**; quantos meses com/sem bónus. 🟢
- **Generosidade do diretor** — correlação bónus vs comissão do mês (é mais generoso em meses fortes?). 🟡

## 8. Comportamento do diretor (de `envios`)
- **Tempo até abrir** o link e **tempo até concluir** (Revisto). 🟢
- **Taxa de abertura** e nº de aberturas por envio. 🟢
- **Histórico de validações** — pontualidade ao longo dos meses. 🟢

## 9. Tendências temporais
- **YoY por mês** — barras lado a lado (2025 vs 2026). 🟢
- **Heatmap mês × ano** — sazonalidade (que meses rendem mais). 🟢
- **Média móvel de 3 meses** — suaviza o ruído. 🟢
- **Acumulado YTD** — curva de comissão acumulada vs ano anterior. 🟢

## 10. Insights automáticos (texto gerado)
- Frases dinâmicas: *"Este mês +18% vs a tua média."* · *"O teu maior cliente vale 22% do total."* · *"Tens 2.916€ presos em pendentes há +60 dias."* · *"A tua base recorrente cresceu 240€ este trimestre."* 🟢
- **Alertas** — queda vs mês anterior, cliente concentrado demais, pendentes a envelhecer. 🟢

## 11. Visualizações a usar
- **Gauge / bullet** (metas) · **waterfall** (variação da carteira recorrente) · **funnel** (proposta → adjudicado → pago) · **heatmap** (sazonalidade) · **donut** (mix por produto) · **linha com média móvel** · **sparklines** nos cartões de KPI · **slope chart** (YoY).

## 12. Relatórios / exportação
- **Relatório anual em PDF** (capa + KPIs + gráficos) para arquivo/partilha. 🟡
- **Exportar por período** (já há CSV mensal) — alargar a intervalos à escolha. 🟢
- **Fecho de ano** — comparativo trimestral e resumo executivo. 🟡

---

## Dados a acrescentar para desbloquear o 🔴
- Tabela **`metas`** (objetivos mensais/anuais) → secção 1.
- Campo **marca** por comissão/projeto → analytics por marca (secção 6).
- **Estado do projeto** na plataforma (proposta/adjudicado) → ponderar pipeline (secção 4).

## Sugestão de faseamento
- **Fase 1 (rápida, só com dados atuais):** recorrente vs pontual ⭐, YoY + acumulado, aging de pendentes, mix por produto, concentração de clientes, insights automáticos.
- **Fase 2:** metas + forecast, pipeline dos 44, heatmap de sazonalidade, comportamento do diretor.
- **Fase 3:** por marca, PDF anual, média móvel/tendência, waterfall recorrente.

---

### Fontes (boas práticas)
- Salesforce — Sales KPIs · CaptivateIQ — Sales KPIs / Pipeline forecasting · QuotaPath — Compensation dashboards · Geckoboard / Improvado / HubSpot — Sales dashboard examples · Cobloom / ChartMogul / Baremetrics — MRR/ARR · Snowflake / Pecan AI — forecasting · Sigma / Hex — cohort & heatmaps.
