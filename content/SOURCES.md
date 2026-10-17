# Fontes das Bíblias

Descarregadas por `npm run bibles:fetch` (`scripts/bible/fetch-bibles.mjs`) a partir de eBible.org, formato VPL (`https://ebible.org/Scriptures/<id>_vpl.zip`), para `data/bibles/<locale>.tsv` (fora do git). Estado de direitos confirmado nas páginas de detalhe de eBible.org (`https://ebible.org/find/details.php?id=<id>`) e em `translations.csv`, em 2026-10-17.

| Língua | Tradução | ID eBible.org | Estado |
|---|---|---|---|
| fr | Louis Segond 1910 | `fraLSG` | Domínio público |
| en | King James Version (texto padrão de 1769; só os 66 livros canónicos são usados, sem Apócrifos) | `eng-kjv` | Domínio público. Nota: no Reino Unido a impressão exige autorização (carta patente da Coroa); sem efeito fora do RU, e aqui só se mostra texto num ecrã. |
| es | Reina-Valera 1909 | `spaRV1909` | Domínio público |
| pt | Bíblia Livre (BLIVRE), 2018, atualizada a partir da tradução de João Ferreira de Almeida (1819), edição Textus Receptus | `porbr2018` | Licença aberta Creative Commons Atribuição 4.0 (CC BY 4.0) |

## Português: escolha e atribuição

O eBible.org não tem uma edição Almeida em domínio público. As edições portuguesas listadas são: `porbr2018` Bíblia Livre (CC BY 4.0, derivada de Almeida), `porbrbsl` Bíblia Portuguesa Mundial (domínio público, mas não é Almeida), `poronbv` Nova Bíblia Viva (© Biblica), `porblt` e `portft` (© Free Bible Ministry / Ellis W. Deibler, só Novo Testamento), `por-WBTC` (© World Bible Translation Center, não redistribuível). Seguindo a regra do projeto (Almeida em domínio público; senão tradução pt com licença CC BY ou CC BY-SA e atribuição visível), foi escolhida a **Bíblia Livre**, que cobre os 66 livros. A Bíblia Portuguesa Mundial fica como alternativa em domínio público se se preferir não depender de atribuição.

Licença (conforme a página da tradução em eBible.org): "A Bíblia Livre tem uso livre, porém a menção da obra de forma adequada é obrigatória. Essa menção pode ser feita de qualquer maneira razoável, dependendo do meio, em conformidade com a Licença Creative Commons Atribuição 4.0 Brasil" (http://creativecommons.org/licenses/by/4.0/br/). Se se alterar o texto, é preciso indicá-lo.

Atribuição obrigatória a mostrar na aplicação sempre que se mostrar um versículo em português:

> Todas as Escrituras em português citadas são da Bíblia Livre (BLIVRE), Copyright © Diego Santos, Mario Sérgio, e Marco Teles, http://sites.google.com/site/biblialivre/ - fevereiro de 2018. Licença Creative Commons Atribuição 4.0 Brasil (http://creativecommons.org/licenses/by/4.0/br/).

Forma curta aceite pelos autores quando falta espaço: `BLIVRE`.

Observação: a grafia é a do português do Brasil (a regra do projeto manda manter a grafia da tradução usada no versículo).

## Normalização do texto

Uma linha por versículo (`LIVRO\tcapítulo\tversículo\ttexto`), códigos USFM; só os 66 livros canónicos; remove-se a marca de parágrafo `¶`, os `[ ]` e restos de marcação, colapsam-se os espaços; grafia e pontuação originais mantidas; removem-se os parênteses retos `[ ]` que assinalam palavras acrescentadas pelos tradutores (ficam as palavras, p. ex. "darkness [was] upon" passa a "darkness was upon"). Versículos vazios na fonte são omitidos (a RV1909 tem 31 084 versículos, a Louis Segond 31 170 por numeração própria dos Salmos).

## Fixtures

`scripts/fixtures/bibles/{pt,fr,en,es}.tsv` contêm o texto real destas traduções para GEN 1:1, GEN 7:1, EXO 3:2, EXO 14:21 e JHN 3:16-18, para testes sem descarregar nada.
