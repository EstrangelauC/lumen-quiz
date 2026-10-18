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

## Correções tipográficas

Na Bíblia Livre (pt) aplicam-se, ao carregar o texto (`content/bible-corrections.json`), poucas correções de gralhas evidentes (espaço em falta, letra a mais ou a menos, palavra repetida); nunca se reformula nada. Em cumprimento da licença CC BY 4.0, ficam aqui listadas (referência: antes → depois):

- ACT 9:5: "Senhor?E o Senhor" → "Senhor? E o Senhor"
- ACT 12:7: "depressa!E as" → "depressa! E as"
- LUK 3:1: "Herodes tetraca" → "Herodes tetrarca"
- LUK 10:33: "dele ." → "dele."
- LUK 24:18: "um deles ,cujo" → "um deles, cujo"
- MRK 2:14: "Segue-me.Então" → "Segue-me. Então"
- NEH 1:11: "homem!Pois" → "homem! Pois"
- HAG 1:1: "segundo ano segundo" → "segundo ano"
- MAL 3:10: "janelas dos céu" → "janelas dos céus"
- LEV 16:22: "deles a terra inabitada" → "deles à terra inabitada"
- LEV 17:11: "eu vos a dei" → "eu vo-la dei"
- NUM 23:19: "e não fará?; Falou" → "e não fará? Falou"
- JOS 24:15: "aos deuses a os quais" → "aos deuses aos quais"

### Correções acrescentadas com o lote de +700 perguntas (2026-10-18)
Só gralhas evidentes de tipografia nos versículos (espaços, concordância, uma palavra trocada); a redação da tradução não foi alterada. Lista completa em `content/bible-corrections.json`.
- pt: ISA 1:18, AMO 8:11, ZEC 13:7, MAL 3:1 (falta espaço antes de "diz"); JON 3:8 ("convertam-se"); HAB 3:19 (espaço antes do parêntese); LAM 5:21 ("os nossos"); OBA 1:3 ("tua alta morada"); JOS 9:4 ("sacos velhos", "odres velhos", em vez de "anciãos"); JDG 14:5 ("leão jovem vinha"); 2KI 4:43 ("Dá ao povo"); JOB 1:5 ("holocaustos conforme"); SNG 3:1 e 5:2 ("Ela:"); 2CO 5:17 ("é;"); ROM 5:3 ("isso, mas").
- es: JOS 21:45 ("todas las buenas"); 2KI 23:25 ("todas sus fuerzas").
