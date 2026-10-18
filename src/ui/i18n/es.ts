/**
 * The Spanish message catalog (D4 §18.1).
 *
 * Typed as `Messages`, so this file cannot fall behind the English one: adding a
 * message to the type without translating it here is a compile error.
 *
 * Two things are deliberately not translated: the product name, and licence
 * identifiers (MIT, Apache-2.0, OpenRAIL-M) — only the prose around them is.
 */

import { plural } from './plural.ts';
import type { Messages } from './messages.ts';

const ES_LANGUAGES: Record<string, string> = {
  en: 'Inglés',
  es: 'Español',
  pt: 'Portugués',
  fr: 'Francés',
};

export const es: Messages = {
  appName: "You Don't Say",
  welcomeLede:
    'Escucha una conversación entre dos personas y decide qué dice una de ellas a continuación. Tú construyes la conversación; después puedes oírla entera.',
  iSpeak: 'Yo hablo',
  imLearning: 'Estoy aprendiendo',
  start: 'Empezar',
  save: 'Guardar',
  cancel: 'Cancelar',

  conversations: 'Conversaciones',
  pairLabel: (native, study) => `${native} → ${study} · cambiar`,
  noConversations: (native, study) =>
    `Todavía no hay conversaciones de ${native} → ${study}. Prueba con otro par.`,
  progress: (beats, beatsTotal, decisions, decisionsTotal) =>
    `${beats} de ${beatsTotal} turnos · ${decisions} de ${decisionsTotal} decisiones`,
  complete: 'Completa — volver a escucharla',

  pause: 'Pausar',
  play: 'Reproducir',
  replay: 'Repetir',
  replayCurrent: 'Repetir el turno actual',
  previous: 'Anterior',
  next: 'Siguiente',
  beatOf: (n, total) => `Turno ${n} de ${total}`,
  readyToPlay: 'Listo para reproducir',
  playingBeat: (n, total) => `Reproduciendo el turno ${n} de ${total}`,
  paused: 'En pausa',
  finished: 'Terminado',

  read: 'Leer',
  hear: 'Escuchar',
  channelOnly: (language) => `Sólo ${language}`,
  channelBoth: 'Ambos',
  channelNone: 'Ninguno',
  hints: 'Pistas',
  speed: 'Velocidad',
  voices: 'Voces',
  licences: 'Licencias',
  keyboardHelp: 'Atajos de teclado',

  audioNoL2Voice: (language) => `No hay ninguna voz de ${language} instalada en este dispositivo.`,
  audioUnavailable:
    'El audio no está disponible en este dispositivo. La transcripción sigue funcionando.',
  audioDifferentVoice: 'El idioma que se habla se reproduce con otra voz.',
  playAnyway: 'Reproducir con la voz predeterminada',
  dismiss: 'Descartar',
  audioDegraded: 'audio degradado',
  l2NotSpoken: (language) => `El audio en ${language} no se está reproduciendo`,

  skipToContent: 'Ir al contenido',
  backToConversations: 'Conversaciones',
  laterBeatsReset: (count) =>
    plural(
      count,
      'Se restableció 1 turno posterior porque el cambio anterior lo modificó.',
      `Se restablecieron ${count} turnos posteriores porque el cambio anterior los modificó.`,
    ),
  preview: 'Escuchar',
  replayOption: 'Repetir',

  conversationReady: 'Tu conversación está lista',
  completionLede: (decisions) =>
    plural(
      decisions,
      '1 decisión tomada. Toca la otra opción de cualquier paso para cambiarla.',
      `${decisions} decisiones tomadas. Toca la otra opción de cualquier paso para cambiarla.`,
    ),
  playWhole: 'Reproducir toda la conversación',

  whatIf: '¿Y si…?',
  whatIfLede:
    'Esta vista es de sólo lectura. Los turnos marcados como elegidos automáticamente se eligieron por ti.',
  makeThisReal: 'Hacerlo real',
  autoPicked: ' (elegido automáticamente)',

  close: 'Cerrar',
  keyboardHeading: 'Teclado',
  licencesHeading: 'Licencias',
  offlineStatement:
    'Esta aplicación funciona sin conexión y, por ahora, no descarga nada. Sin servidor, sin cuenta y sin red después de la primera carga.',
  offlineStatementDownloads:
    'La aplicación funciona sin conexión. En el primer uso descarga el motor de voz una vez (~92 MB) y lo guarda en este dispositivo. Después, sin red.',
  storage: 'Motor de voz',
  storageTotal: (mb) => `Descargado en este dispositivo: ${mb} MB.`,
  deleteCachedAudio: 'Borrar el audio guardado',
  storageDeleted: 'Audio guardado borrado. Se volverá a descargar al reproducir.',
  voiceOverridesHeading: 'Voces',
  voiceFor: (character, language) => `${character} en ${language}`,
  resolvedVoice: (name) => `Se usa ${name}`,
  unresolvableVoice: 'No hay ninguna voz disponible',
  voiceIndependence: 'Con las voces integradas, cada idioma usa una voz distinta.',
  voiceAutomatic: (name) => `Automática (${name})`,

  licencePurposeSpeech: 'motor de voz previsto (M3)',
  licencePurposeUi: 'interfaz',
  licencePurposeTranslation: 'modelos de traducción en tiempo de compilación',
  licencePurposeRuntime: 'entorno de ejecución del motor de voz',

  shortcutPlayPause: 'Reproducir o pausar',
  shortcutReplay: 'Repetir el turno actual',
  shortcutPrevNext: 'Turno anterior o siguiente',
  shortcutPick: 'Elegir la opción N en el turno pendiente',
  shortcutPreview: 'Escuchar la opción N',
  shortcutHint: 'Mostrar u ocultar la pista',
  shortcutGloss: 'Mostrar la traducción al enfocar',
  shortcutWhatIf: 'Abrir o cerrar el panel ¿Y si…?',
  shortcutHelp: 'Abrir la ayuda de teclado',
  shortcutClose: 'Cerrar el diálogo superior y devolver el foco',
  shortcutTab: 'Recorrer la conversación',

  languageName: (code) => ES_LANGUAGES[code] ?? code.toUpperCase(),
};
