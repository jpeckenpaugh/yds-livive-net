/**
 * The fixture's authored English → Spanish table (D6 §2.1, §4.2).
 *
 * The M1 fixture is *authored*, not machine-drafted: no MT model is installed in
 * M1 (amendment F3). This table is what the fixture translator returns, and it is
 * what makes `bake:check --author-only` pass against a fully-populated committed
 * artifact without a model. The provenance wart is recorded in
 * `meta.reviewPolicy: 'fixture'` and in `reviewedBy: 'agent'` (F2).
 *
 * The keys are the exact rendered English strings the templates produce.
 */

export const EN_TO_ES: Record<string, string> = {
  'Hi Bobby. Do you want to get together tomorrow?':
    'Hola Bobby. ¿Quieres que nos juntemos mañana?',

  "Sure Ron! Why don't we get together for a nice dinner.":
    '¡Claro, Ron! ¿Por qué no nos juntamos para una buena cena?',
  "Ok Ron. Let's meet at the theater to watch a new movie.":
    'Está bien, Ron. Nos vemos en el cine para ver una película nueva.',

  'Perfect, a nice dinner sounds great.': 'Perfecto, una buena cena suena genial.',
  'Perfect, a new movie sounds great.': 'Perfecto, una película nueva suena genial.',

  "Let's get Chinese.": 'Vamos por comida china.',
  'I could go for pizza.': 'Me apetece una pizza.',
  "Let's see a comedy.": 'Veamos una comedia.',
  "I'm in the mood for an action movie.": 'Tengo ganas de una película de acción.',

  "Let's go with Chinese.": 'Vamos con la comida china.',
  "Let's go with pizza.": 'Vamos con la pizza.',
  "Let's go with a comedy.": 'Vamos con una comedia.',
  "Let's go with an action movie.": 'Vamos con una película de acción.',

  'early works better for me, honestly.': 'Temprano me viene mejor, la verdad.',
  "Let's go with later, then.": 'Entonces quedamos más tarde.',

  'Great, early it is.': 'Genial, temprano entonces.',
  'Great, later it is.': 'Genial, más tarde entonces.',

  "Perfect. I'd like to keep it just the two of us.":
    'Perfecto. Prefiero que seamos solo nosotros dos.',
  "Perfect. I'll invite the whole crew.": 'Perfecto. Invitaré a todo el equipo.',

  'Perfect. See you early on Saturday for a nice dinner with just the two of us.':
    'Perfecto. Nos vemos temprano el sábado para una buena cena con nosotros dos.',
  'Perfect. See you early on Saturday for a nice dinner with the whole crew.':
    'Perfecto. Nos vemos temprano el sábado para una buena cena con todo el equipo.',
  'Perfect. See you early on Saturday for a new movie with just the two of us.':
    'Perfecto. Nos vemos temprano el sábado para una película nueva con nosotros dos.',
  'Perfect. See you early on Saturday for a new movie with the whole crew.':
    'Perfecto. Nos vemos temprano el sábado para una película nueva con todo el equipo.',
  'Perfect. See you later on Saturday for a nice dinner with just the two of us.':
    'Perfecto. Nos vemos más tarde el sábado para una buena cena con nosotros dos.',
  'Perfect. See you later on Saturday for a nice dinner with the whole crew.':
    'Perfecto. Nos vemos más tarde el sábado para una buena cena con todo el equipo.',
  'Perfect. See you later on Saturday for a new movie with just the two of us.':
    'Perfecto. Nos vemos más tarde el sábado para una película nueva con nosotros dos.',
  'Perfect. See you later on Saturday for a new movie with the whole crew.':
    'Perfecto. Nos vemos más tarde el sábado para una película nueva con todo el equipo.',

  'See you then, Ron!': '¡Nos vemos entonces, Ron!',
};
