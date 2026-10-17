# Lumen Quiz: jogo bíblico com perguntas sorteadas

Data: 2026-10-17 · Estado: aguarda aprovação

## Intenção

O Lumen Quiz é um jogo bíblico em grupo, ao estilo Kahoot, para igrejas, grupos de jovens e famílias. O ecrã grande mostra a pergunta, o tempo e a classificação. Cada jogador responde no telemóvel, na sua língua.

Hoje a app assenta em quizzes que cada anfitrião escreve à mão. O dono do projeto não quer isso. Quer que **ninguém tenha de criar perguntas**: as perguntas aparecem **ao acaso**, a partir de um banco grande, sempre com **referência bíblica**, em três níveis de dificuldade. O jogo deve ensinar, não só pontuar. Por isso mostra o versículo depois de cada pergunta.

O banco é construído a partir dos PDFs do dono do projeto, em `~/Desktop/biblia`, que cobrem do Antigo ao Novo Testamento.

## Objetivos

1. O anfitrião, com conta, lança um jogo escolhendo só **nível** e **número de perguntas**.
2. As perguntas são **sorteadas no servidor** a partir do banco, no nível escolhido.
3. Três **tipos de pergunta** misturados ao acaso no mesmo jogo:
   - **Escolha múltipla:** 2 a 4 opções, uma certa. Inclui verdadeiro ou falso.
   - **Ordenar os acontecimentos:** 4 episódios bíblicos para pôr pela ordem certa.
   - **Completar o versículo:** um versículo com uma palavra em falta e 4 palavras à escolha.
4. Na **revelação**, aparece a resposta certa, a referência e o **texto do versículo** na língua de cada jogador, no ecrã grande e nos telemóveis.
5. **Pódio** no fim. Já existe e mantém-se.
6. Banco nas **quatro línguas** da app: pt, fr, en, es.
7. A página **Descobrir** passa a servir para **explorar o banco** por nível e por livro da Bíblia.

## Não objetivos (primeira versão)

- Anfitriões ou jogadores a criar ou editar perguntas.
- Modo equipas.
- Lista de passagens para ler em casa.
- Cada jogador com um nível diferente no mesmo jogo.
- Gerar perguntas com IA durante o jogo.
- Imagens, mapas ou áudio nas perguntas.
- Evitar repetições entre jogos diferentes. Dentro do mesmo jogo, nunca há repetições.

## Anti-objetivos (falha mesmo que funcione)

- **Referências ou factos bíblicos errados.** É o maior risco, porque não há revisão humana antes do sorteio.
- **A resposta certa chegar ao telemóvel antes da revelação**, incluindo a ordem certa dos acontecimentos e a palavra em falta.
- **Texto bíblico com direitos de autor** dentro da app.
- **Versículos longos** que atrasam o ritmo do jogo ou não cabem no ecrã.
- Perguntas do nível fácil com linguagem que uma criança não percebe.

## Decisões do dono do projeto

- Perguntas sorteadas, sem quizzes feitos à mão. O **editor de quizzes desaparece**.
- Antes de começar, o anfitrião escolhe **nível** e **número de perguntas**, e nada mais.
- Níveis: **fácil** para crianças, **médio** e **difícil**.
- Interatividade extra: **versículo depois de cada pergunta**, **pódio no fim**, e os tipos **ordenar os acontecimentos** e **completar o versículo**.
- **Claude gera as perguntas e verifica as referências.** Não há aprovação humana antes do sorteio.
- Banco nas **quatro línguas** desde a primeira versão.
- O anfitrião **continua a precisar de conta** com e-mail.
- **Descobrir** = explorar o banco por **nível** e **livro**.
- Perguntas e opções em **português de Portugal**, apesar de os PDFs estarem em português do Brasil. O versículo mostra-se na grafia da tradução usada.

## Decisões tomadas pelo Claude (podem ser revistas)

- **Banco gerado antes, não durante o jogo.** As perguntas ficam nas tabelas Postgres do Supabase, não no Supabase Storage. O sorteio, os filtros e a resposta escondida exigem tabelas.
- **Número de perguntas** por opções fixas: 5, 10, 15 ou 20. Valor inicial: 10.
- **Tamanho do banco:** mínimo de 60 perguntas por nível na primeira versão, com os três tipos representados em cada nível. Objetivo: 100 por nível. Se um nível tiver menos perguntas do que o pedido, a app oferece só os números possíveis.
- **Mistura de tipos:** sorteio ao acaso, sem quotas. A escolha múltipla deve ser a maioria do banco, para o jogo não ficar pesado.
- **Ordenar os acontecimentos:** só ganha pontos quem acerta a ordem completa. Mesma fórmula de pontos das outras perguntas. Recebe mais 10 segundos do que o tempo normal.
- **Tempo por pergunta:** o valor das preferências do anfitrião, como hoje.
- **Versículo na revelação:** no máximo dois versículos seguidos e cerca de 300 caracteres. Mostra-se a referência junto ao texto.
- **Traduções da Bíblia em domínio público**, uma por língua:
  - fr: Louis Segond 1910
  - en: King James Version
  - es: Reina-Valera 1909
  - pt: uma edição Almeida em domínio público. O construtor confirma qual está de facto em domínio público. Muitas edições Almeida populares, como a ARC de 1995 e a ACF, têm direitos de autor.
- **Perguntas e opções** escritas em português a partir dos PDFs e traduzidas para fr, en, es. Os nomes próprios seguem a forma habitual de cada língua.
- **Verificação automática** antes de importar: cada referência tem de existir na tradução de domínio público, e o texto do versículo guardado tem de coincidir com essa tradução. O facto em que a pergunta assenta tem de estar no versículo citado ou nos PDFs.
- **Como o banco é gerado:** é um trabalho de conteúdo feito uma vez pelo Claude durante a construção, e não um sistema que chama a API do Claude. Não é precisa chave de API nem há custo recorrente. As perguntas ficam em ficheiros no repositório, que um script importa para o Supabase. Para repor ou acrescentar perguntas, faz-se uma nova sessão de trabalho com o Claude.
- **Verificação em duas camadas:** um script verifica automaticamente que cada referência existe e que o texto do versículo coincide com a tradução de domínio público. Depois, uma segunda passagem feita por outro agente Claude, independente de quem gerou, confirma que cada facto está no versículo citado. As perguntas que falham são corrigidas ou retiradas antes da importação.
- **Completar o versículo no nível fácil:** só com versículos curtos e conhecidos, em que a linguagem antiga continua compreensível para crianças, como Génesis 1:1 ou João 3:16. Os níveis médio e difícil usam qualquer versículo dentro dos limites de tamanho.
- **Revelação de "ordenar os acontecimentos":** mostra os quatro episódios pela ordem certa, cada um com a sua referência, sem o texto completo dos versículos. É a exceção à regra do versículo.
- **Se não houver Almeida em domínio público confirmada:** usar uma tradução portuguesa com licença aberta, como CC BY ou CC BY-SA, com a atribuição exigida visível na app. Se também não houver, as revelações em pt mostram só a referência, e o jogo lança na mesma.
- **Rede de segurança:** cada pergunta tem um estado ativo ou inativo. Durante a revelação, o anfitrião pode **reportar** a pergunta. Uma pergunta reportada sai do sorteio até alguém a reativar diretamente no Supabase.
- **Descobrir** só é visível para anfitriões com conta e mostra as respostas certas, porque o objetivo é estudar.
- **Dados atuais:** a base de dados é nova e não tem dados reais. A migração pode substituir as tabelas de quizzes em vez de as converter.

## Restrições

- Manter a stack atual: Next.js 15, next-intl, Supabase com Realtime, Tailwind.
- Manter o que já funciona no jogo: PIN, QR code, jogadores anónimos, entrada a meio do jogo, pontos calculados no servidor, classificação em direto, pódio, 4 línguas na interface.
- O sorteio e a correção acontecem **no servidor**, em funções do Supabase. A lista de perguntas sorteadas fica fixa para a sessão, para todos verem a mesma ordem.
- O telemóvel nunca recebe `is_correct`, a ordem certa ou a palavra em falta antes da revelação.
- Interface de "ordenar" utilizável no telemóvel com uma mão. O ecrã grande mostra os quatro episódios e, na revelação, a ordem certa.
- Todos os textos novos da interface existem em pt, fr, en, es.
- Material de base: `~/Desktop/biblia`. "Jornada da Bíblia" partes 1 a 4 têm texto extraível, cerca de 250 páginas em português do Brasil. "Os 4 Evangelhos" são 4 páginas só em imagem.

## Deixado ao construtor

- Modelo de dados exato do banco, dos tipos de pergunta e da sessão.
- Interação de ordenar no telemóvel: arrastar ou tocar por ordem.
- Fonte e formato dos ficheiros das traduções de domínio público, e o script de importação.
- Formato intermédio do banco gerado, por exemplo JSON por livro, e onde fica no repositório.
- Que etiquetas extra guardar além de nível, testamento e livro.
- Aspeto visual do ecrã de revelação e do Descobrir, mantendo o estilo atual da app.
- Que ficheiros e rotas do editor apagar e como limpar as traduções da interface.
