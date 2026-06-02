/**
 * Test runner del routine-detector. Corre con: npx tsx src/lib/chat/routine-detector.test.ts
 *
 * Cubre los casos que el usuario reportó como rotos + variantes comunes.
 * No es un framework formal — solo imprime PASS/FAIL para iterar rápido.
 */
import { detectRoutineInMessage } from './routine-detector';

interface TestCase {
  name: string;
  message: string;
  childrenNames: string[];
  expectedNonNull: boolean;
  expectedDays?: number[];
  expectedStart?: string;
  expectedEnd?: string | null;
  expectedActivity?: string;
  expectedChild?: string;
}

const cases: TestCase[] = [
  {
    name: 'Caso original: Pau guarde días-primero',
    message: 'Pau tiene guarde de lunes a viernes de 9 a 4:30',
    childrenNames: ['Pau', 'Bru'],
    expectedNonNull: true,
    expectedDays: [1, 2, 3, 4, 5],
    expectedStart: '09:00',
    expectedEnd: '16:30',
    expectedActivity: 'Guardería',
    expectedChild: 'Pau',
  },
  {
    name: 'Caso del usuario que falla: Bru guarde números-primero',
    message: 'Bru tiene guarde de 9 a 5 de lunes a viernes',
    childrenNames: ['Pau', 'Bru'],
    expectedNonNull: true,
    expectedDays: [1, 2, 3, 4, 5],
    expectedStart: '09:00',
    expectedEnd: '17:00',
    expectedActivity: 'Guardería',
    expectedChild: 'Bru',
  },
  {
    name: 'Lista de días: "los martes y jueves"',
    message: 'Lucía tiene fútbol los martes y jueves a las 18',
    childrenNames: ['Lucía'],
    expectedNonNull: true,
    expectedDays: [2, 4],
    expectedStart: '18:00',
    expectedEnd: null,
    expectedActivity: 'Fútbol',
    expectedChild: 'Lucía',
  },
  {
    name: 'Sin "de": "L a V 9-17"',
    message: 'Pau guarde lunes a viernes 9-17',
    childrenNames: ['Pau'],
    expectedNonNull: true,
    expectedDays: [1, 2, 3, 4, 5],
    expectedStart: '09:00',
    expectedEnd: '17:00',
  },
  {
    name: 'Cole con días primero',
    message: 'Mateo va al cole de lunes a viernes de 8 a 13',
    childrenNames: ['Mateo'],
    expectedNonNull: true,
    expectedDays: [1, 2, 3, 4, 5],
    expectedStart: '08:00',
    expectedEnd: '13:00',
    expectedActivity: 'Cole',
  },
  {
    name: 'Solo fines de semana',
    message: 'Bru tiene natación los sábados y domingos a las 10',
    childrenNames: ['Bru'],
    expectedNonNull: true,
    expectedDays: [0, 6],
    expectedStart: '10:00',
    expectedActivity: 'Natación',
  },
  {
    name: 'Hijo no presente: NO matchear',
    message: 'el perro tiene paseo lunes a viernes',
    childrenNames: ['Pau'],
    expectedNonNull: false,
  },
  {
    name: 'Sin actividad clara: NO matchear',
    message: 'Pau de lunes a viernes de 9 a 17',
    childrenNames: ['Pau'],
    expectedNonNull: false,
  },
  {
    name: 'Cancelación puntual NO debe matchear como rutina',
    message: 'el viernes Pau no va a la guarde',
    childrenNames: ['Pau'],
    expectedNonNull: false,
  },
];

let passed = 0;
let failed = 0;

for (const tc of cases) {
  const result = detectRoutineInMessage(tc.message, tc.childrenNames);
  const isNull = result === null;
  const expectedNull = !tc.expectedNonNull;

  if (isNull !== expectedNull) {
    console.log(`❌ FAIL: ${tc.name}`);
    console.log(`   Mensaje: "${tc.message}"`);
    console.log(`   Esperado nonNull=${tc.expectedNonNull}, recibido: ${isNull ? 'null' : JSON.stringify(result)}`);
    failed++;
    continue;
  }

  if (result === null) {
    console.log(`✅ PASS: ${tc.name}`);
    passed++;
    continue;
  }

  // Validar campos
  const errors: string[] = [];
  if (tc.expectedDays && JSON.stringify(result.days_of_week) !== JSON.stringify(tc.expectedDays)) {
    errors.push(`days_of_week: esperado ${JSON.stringify(tc.expectedDays)}, recibido ${JSON.stringify(result.days_of_week)}`);
  }
  if (tc.expectedStart && result.time_start !== tc.expectedStart) {
    errors.push(`time_start: esperado ${tc.expectedStart}, recibido ${result.time_start}`);
  }
  if (tc.expectedEnd !== undefined && result.time_end !== tc.expectedEnd) {
    errors.push(`time_end: esperado ${tc.expectedEnd}, recibido ${result.time_end}`);
  }
  if (tc.expectedActivity && result.name !== tc.expectedActivity) {
    errors.push(`activity: esperado ${tc.expectedActivity}, recibido ${result.name}`);
  }
  if (tc.expectedChild && result.child_name !== tc.expectedChild) {
    errors.push(`child: esperado ${tc.expectedChild}, recibido ${result.child_name}`);
  }

  if (errors.length > 0) {
    console.log(`❌ FAIL: ${tc.name}`);
    console.log(`   Mensaje: "${tc.message}"`);
    errors.forEach(e => console.log(`   ${e}`));
    failed++;
  } else {
    console.log(`✅ PASS: ${tc.name}`);
    passed++;
  }
}

console.log(`\n${passed}/${passed + failed} casos pasaron.`);
if (failed > 0) {
  process.exit(1);
}
