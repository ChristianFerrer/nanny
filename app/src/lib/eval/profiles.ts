import type { FamilyProfile } from './types';

export const profiles: FamilyProfile[] = [
  {
    id: 'organized',
    name: 'Pareja Organizada',
    mamaName: 'Ana',
    papaName: 'Carlos',
    children: [
      { name: 'Lucía', age: '6 años', emoji: '👧', school: 'Colegio San José', allergies: ['frutos secos'] },
      { name: 'Mateo', age: '3 años', emoji: '👶', school: 'Guardería Arcoíris' },
    ],
    communicationStyle: 'Mensajes claros, completos, con detalles. Confirman todo explícitamente.',
    organizationLevel: 'alta',
    stressLevel: 'bajo',
    coordinationPattern: 'Se turnan responsabilidades equitativamente. Calendarios compartidos.',
    frequentConflicts: [],
    specialContext: 'Ambos trabajan desde casa. Muy metódicos.',
  },
  {
    id: 'chaotic',
    name: 'Pareja Caótica',
    mamaName: 'Laura',
    papaName: 'Diego',
    children: [
      { name: 'Santiago', age: '7 años', emoji: '👦', school: 'Escuela Primaria Norte' },
      { name: 'Valentina', age: '4 años', emoji: '👧', school: 'Guardería Patitos' },
      { name: 'Emma', age: '1 año', emoji: '👶' },
    ],
    communicationStyle: 'Mensajes desordenados, cambian de tema sin avisar, mezclan temas en un mismo mensaje.',
    organizationLevel: 'baja',
    stressLevel: 'alto',
    coordinationPattern: 'Improvisan sobre la marcha. Muchos mensajes de último momento.',
    frequentConflicts: ['Olvidan citas', 'Doble agendamiento', 'Nadie sabe quién recoge a quién'],
  },
  {
    id: 'short-messages',
    name: 'Pareja Mensajes Cortos',
    mamaName: 'Marta',
    papaName: 'Andrés',
    children: [
      { name: 'Pablo', age: '5 años', emoji: '👦', school: 'Jardín Los Pinos' },
    ],
    communicationStyle: 'Mensajes muy cortos, abreviados, con emojis. Mucha información implícita.',
    organizationLevel: 'media',
    stressLevel: 'medio',
    coordinationPattern: 'Comunicación telegráfica. Asumen que el otro entiende el contexto.',
    frequentConflicts: ['Malentendidos por mensajes ambiguos', 'Info incompleta'],
  },
  {
    id: 'plan-changers',
    name: 'Pareja Cambia Planes',
    mamaName: 'Valentina',
    papaName: 'Roberto',
    children: [
      { name: 'Martín', age: '8 años', emoji: '👦', school: 'Colegio del Valle' },
      { name: 'Isabella', age: '5 años', emoji: '👧', school: 'Jardín Mariposas' },
    ],
    communicationStyle: 'Mensajes normales pero cambian planes frecuentemente. Muchos "mejor no", "cambio de planes".',
    organizationLevel: 'media',
    stressLevel: 'alto',
    coordinationPattern: 'Planean algo y luego lo cambian 2-3 veces antes de que suceda.',
    frequentConflicts: ['Cambios de última hora', 'Confusión sobre cuál es el plan final'],
  },
  {
    id: 'unequal-load',
    name: 'Pareja Carga Desigual',
    mamaName: 'Sofía',
    papaName: 'Fernando',
    children: [
      { name: 'Pau', age: '4 años', emoji: '👦', school: 'Guardería Sol', allergies: ['lactosa'] },
      { name: 'Mía', age: '2 años', emoji: '👶' },
    ],
    communicationStyle: 'Mamá envía mensajes largos y detallados. Papá responde con "ok", "👍", "dale".',
    organizationLevel: 'media',
    stressLevel: 'alto',
    coordinationPattern: 'Mamá organiza todo, papá ejecuta lo que le piden.',
    frequentConflicts: ['Mamá sobrecargada', 'Papá no toma iniciativa', 'Olvidos del papá'],
    specialContext: 'Pau tiene intolerancia a la lactosa. Mía está empezando guardería.',
  },
  {
    id: 'bilingual',
    name: 'Pareja Bilingüe',
    mamaName: 'Sarah',
    papaName: 'Miguel',
    children: [
      { name: 'Leo', age: '3 años', emoji: '👶', school: 'Guardería Bilingüe Happy Kids' },
    ],
    communicationStyle: 'Mezclan español e inglés. A veces frases completas en un idioma, a veces mezclan en la misma oración.',
    organizationLevel: 'alta',
    stressLevel: 'bajo',
    coordinationPattern: 'Buena comunicación, se organizan bien pero el idioma puede confundir a Nanny.',
    frequentConflicts: ['Confusión por términos en inglés'],
    specialContext: 'Sarah es estadounidense, Miguel mexicano. Leo va a guardería bilingüe.',
  },
  {
    id: 'newborn',
    name: 'Pareja Bebé Recién Nacido',
    mamaName: 'Camila',
    papaName: 'Javier',
    children: [
      { name: 'Emilio', age: '2 meses', emoji: '👶', medicalNotes: 'Prematuro 36 semanas. Control mensual.' },
    ],
    communicationStyle: 'Mensajes a todas horas. Preocupación constante por salud del bebé. Info médica distribuida.',
    organizationLevel: 'baja',
    stressLevel: 'alto',
    coordinationPattern: 'Se apoyan mutuamente pero están agotados. Olvidan cosas por falta de sueño.',
    frequentConflicts: ['Cansancio extremo', 'Olvidan citas médicas', 'Confusión con horarios de medicación'],
    specialContext: 'Bebé prematuro con controles frecuentes. Vitamina D diaria. Preocupados por su peso.',
  },
  {
    id: 'daycare-primary',
    name: 'Pareja Guardería + Primaria',
    mamaName: 'María',
    papaName: 'Pablo',
    children: [
      { name: 'Sofía', age: '7 años', emoji: '👧', school: 'Colegio Santa María' },
      { name: 'Lucas', age: '2 años', emoji: '👶', school: 'Guardería Ositos' },
    ],
    communicationStyle: 'Mensajes prácticos enfocados en logística. Horarios diferentes para cada hijo.',
    organizationLevel: 'alta',
    stressLevel: 'medio',
    coordinationPattern: 'Dividen: mamá se encarga de la primaria, papá de la guardería. Pero a veces cruzan.',
    frequentConflicts: ['Horarios que no coinciden', 'Dos recojas diferentes', 'Eventos simultáneos'],
    specialContext: 'Sofía tiene clase de ballet martes y jueves. Lucas tiene adaptación en guardería.',
  },
  {
    id: 'argue-responsibilities',
    name: 'Pareja Discute Responsabilidades',
    mamaName: 'Patricia',
    papaName: 'Tomás',
    children: [
      { name: 'Diego', age: '6 años', emoji: '👦', school: 'Escuela República', allergies: ['polvo'] },
      { name: 'Renata', age: '4 años', emoji: '👧', school: 'Jardín Los Olivos' },
    ],
    communicationStyle: 'Tensión en los mensajes. Reclamos pasivo-agresivos. Negociación de responsabilidades.',
    organizationLevel: 'media',
    stressLevel: 'alto',
    coordinationPattern: 'Discuten quién hace qué. Ambos sienten que hacen más que el otro.',
    frequentConflicts: ['Quién recoge', 'Quién lleva al doctor', 'Quién compra las cosas', 'Tareas domésticas'],
  },
  {
    id: 'loving-messy',
    name: 'Pareja Cariñosa Desordenada',
    mamaName: 'Lucía',
    papaName: 'Daniel',
    children: [
      { name: 'Emilia', age: '5 años', emoji: '👧', school: 'Jardín Girasoles' },
    ],
    communicationStyle: 'Muy cariñosos entre sí. Mezclan info práctica con muestras de afecto. Desordenados.',
    organizationLevel: 'baja',
    stressLevel: 'bajo',
    coordinationPattern: 'Se quieren mucho pero se olvidan de todo. Info útil perdida entre mensajes de cariño.',
    frequentConflicts: ['Olvidan citas', 'No compran lo que necesitan', 'Pierden el hilo del tema'],
    specialContext: 'Emilia empieza clases de natación. Tienen un viaje familiar planeado.',
  },
];

/**
 * Genera el familyContext string para enviar al API,
 * en el formato que espera el system prompt.
 */
export function buildFamilyContext(profile: FamilyProfile): string {
  const childrenStr = profile.children
    .map(c => `${c.name} (${c.emoji}, ${c.age})`)
    .join(', ');
  return `Familia: ${childrenStr}, ${profile.mamaName} (👩), ${profile.papaName} (👨)`;
}
