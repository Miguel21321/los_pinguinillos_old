/**
 * DEFINICIÓN MODULAR DE LOS 5 NIVELES DE LA MONTAÑA
 * Puedes añadir nuevos niveles fácilmente agregando objetos al array LEVELS.
 */
window.LEVELS = [
  {
    id: 1,
    name: "Primeros Pasos y Cuerda",
    ropeLength: 175,
    windForce: 0,
    spawn: { x: 120, y: -60 },
    goal: { x: 2420, y: -790, w: 90, h: 110 },
    platforms: [
      { x: 20, y: 0, w: 420, h: 45, type: 'normal' },
      { x: 530, y: -80, w: 300, h: 40, type: 'normal' },
      { x: 940, y: -170, w: 260, h: 40, type: 'normal' },
      { x: 1320, y: -270, w: 320, h: 40, type: 'ice' },
      { x: 1760, y: -430, w: 250, h: 40, type: 'normal' },
      { x: 2080, y: -590, w: 230, h: 40, type: 'normal' },
      { x: 2330, y: -680, w: 260, h: 50, type: 'normal' }
    ],
    checkpoints: [
      { x: 120, y: 0 },
      { x: 640, y: -80 },
      { x: 1440, y: -270 },
      { x: 2150, y: -590 }
    ],
    hazards: [
      { x: 560, y: 20, w: 230, h: 25, type: 'spikes' }
    ],
    signs: [
      { x: 190, y: -75, text: "A/D o ◄/► Mover • W o ▲ Saltar" },
      { x: 1030, y: -240, text: "Uno se ancla con S/▼ al borde y el otro salta" },
      { x: 1450, y: -340, text: "Hielo resbaladizo: frena con tu compañero" }
    ]
  },
  {
    id: 2,
    name: "Saltos Largos y Péndulo",
    ropeLength: 190,
    windForce: 0,
    spawn: { x: 100, y: -60 },
    goal: { x: 2680, y: -960, w: 90, h: 110 },
    platforms: [
      { x: 30, y: 0, w: 320, h: 45, type: 'normal' },
      { x: 470, y: -130, w: 190, h: 36, type: 'normal' },
      { x: 830, y: -60, w: 230, h: 40, type: 'ice' },
      { x: 1210, y: -220, w: 180, h: 40, type: 'normal' },
      { x: 1550, y: -390, w: 180, h: 40, type: 'ice' },
      { x: 1910, y: -560, w: 220, h: 40, type: 'normal' },
      { x: 2290, y: -740, w: 210, h: 40, type: 'ice' },
      { x: 2580, y: -850, w: 260, h: 50, type: 'normal' }
    ],
    checkpoints: [
      { x: 100, y: 0 },
      { x: 920, y: -60 },
      { x: 1990, y: -560 }
    ],
    hazards: [
      { x: 870, y: -76, w: 80, h: 16, type: 'spikes' }
    ],
    signs: [
      { x: 520, y: -200, text: "Péndulo: Uno clava piolet (S/▼) arriba y el otro se balancea" },
      { x: 1270, y: -290, text: "Pulsa SALTAR colgando de la cuerda tensa para impulsarte" }
    ]
  },
  {
    id: 3,
    name: "Paredes de Hielo y Piolet",
    ropeLength: 180,
    windForce: 0,
    spawn: { x: 100, y: -60 },
    goal: { x: 2260, y: -1310, w: 90, h: 110 },
    platforms: [
      { x: 20, y: 0, w: 340, h: 45, type: 'normal' },
      { x: 440, y: -360, w: 55, h: 360, type: 'climbWall' },
      { x: 495, y: -360, w: 280, h: 40, type: 'normal' },
      { x: 910, y: -490, w: 260, h: 40, type: 'ice' },
      { x: 1270, y: -890, w: 60, h: 420, type: 'climbWall' },
      { x: 1330, y: -890, w: 290, h: 40, type: 'normal' },
      { x: 1770, y: -1200, w: 55, h: 350, type: 'climbWall' },
      { x: 1825, y: -1200, w: 580, h: 50, type: 'normal' }
    ],
    checkpoints: [
      { x: 100, y: 0 },
      { x: 600, y: -360 },
      { x: 1450, y: -890 }
    ],
    hazards: [
      { x: 1010, y: -506, w: 70, h: 16, type: 'spikes' }
    ],
    signs: [
      { x: 210, y: -70, text: "Mantén S o ▼ en las paredes azules verticales para trepar" },
      { x: 620, y: -430, text: "Sube por relevos: uno se ancla arriba y el otro impulsa su salto" }
    ]
  },
  {
    id: 4,
    name: "Ventisca y Hielo Frágil",
    ropeLength: 185,
    windForce: 1.0,
    spawn: { x: 100, y: -60 },
    goal: { x: 2780, y: -1090, w: 90, h: 110 },
    platforms: [
      { x: 20, y: 0, w: 330, h: 45, type: 'normal' },
      { x: 460, y: -110, w: 190, h: 32, type: 'fragile' },
      { x: 760, y: -220, w: 190, h: 32, type: 'fragile' },
      { x: 1060, y: -330, w: 300, h: 42, type: 'normal' },
      { x: 1490, y: -470, w: 240, h: 40, type: 'ice' },
      { x: 1850, y: -630, w: 190, h: 32, type: 'fragile' },
      { x: 2150, y: -790, w: 260, h: 40, type: 'normal' },
      { x: 2510, y: -980, w: 400, h: 50, type: 'normal' }
    ],
    checkpoints: [
      { x: 100, y: 0 },
      { x: 1180, y: -330 },
      { x: 2250, y: -790 }
    ],
    hazards: [],
    signs: [
      { x: 180, y: -75, text: "Hielo frágil: se rompe 0.8s después de pisarlo" },
      { x: 1190, y: -400, text: "¡Ráfagas de viento! Clavad el piolet (S/▼) para no volar" }
    ]
  },
  {
    id: 5,
    name: "La Cumbre — Desafío Final",
    ropeLength: 185,
    windForce: 1.25,
    spawn: { x: 90, y: -60 },
    goal: { x: 3060, y: -1580, w: 100, h: 120 },
    platforms: [
      { x: 20, y: 0, w: 300, h: 45, type: 'normal' },
      { x: 430, y: -140, w: 200, h: 34, type: 'fragile' },
      { x: 740, y: -280, w: 240, h: 40, type: 'ice' },
      { x: 1090, y: -640, w: 55, h: 380, type: 'climbWall' },
      { x: 1145, y: -640, w: 280, h: 42, type: 'normal' },
      { x: 1540, y: -780, w: 200, h: 34, type: 'fragile' },
      { x: 1860, y: -930, w: 260, h: 40, type: 'ice' },
      { x: 2240, y: -1310, w: 55, h: 400, type: 'climbWall' },
      { x: 2295, y: -1310, w: 270, h: 42, type: 'normal' },
      { x: 2680, y: -1470, w: 520, h: 55, type: 'normal' }
    ],
    checkpoints: [
      { x: 90, y: 0 },
      { x: 1260, y: -640 },
      { x: 1960, y: -930 },
      { x: 2410, y: -1310 }
    ],
    hazards: [
      { x: 830, y: -296, w: 65, h: 16, type: 'spikes' },
      { x: 1950, y: -946, w: 65, h: 16, type: 'spikes' }
    ],
    rockSpawners: [
      { x: 1640, y: -1350, interval: 3.2 },
      { x: 2560, y: -1850, interval: 2.8 }
    ],
    signs: [
      { x: 160, y: -75, text: "Ascenso Final: Coordinaos ante el viento, las rocas y el hielo" }
    ]
  }
];