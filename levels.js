/**
 * ============================================================================
 * PICOS UNIDOS (BREAD & FRED EDITION) — LEVELS.JS
 * ============================================================================
 * Mapa vertical continuo de 0m a 500m (12.000 píxeles de escalada vertical)
 * dividido en 5 sectores con física, embudos de castigo y mecánicas exactas:
 *
 * Sector 1 (0m - 100m)   : Base Glaciar (Saltos altos, primer péndulo)
 * Sector 2 (100m - 200m) : Cuevas de Hielo Resbaladizo (Fricción baja, no anclaje)
 * Sector 3 (200m - 300m) : Cumbres de Viento (Ráfagas cíclicas, chimeneas de stamina)
 * Sector 4 (300m - 400m) : Minas Inestables (Bloques crumble que caen, plataformas móviles)
 * Sector 5 (400m - 500m) : La Cima (Examen maestro, saltos catapulta 3-2-1 hasta el Altar)
 *
 * Escala: 1 metro = 24 píxeles de elevación vertical.
 * Y = 0 (0m) -> Y = -12000 (500m Cumbre).
 * ============================================================================
 */

(function () {
  'use strict';

  const PIXELS_PER_METER = 24;

  /**
   * Helper para crear plataformas con tipos específicos
   */
  function plat(x, y, w, h, type = 'normal', extra = {}) {
    return {
      x,
      y,
      w,
      h,
      type, // 'normal' | 'ice' | 'climbWall' | 'crumble' | 'moving'
      ...extra
    };
  }

  function movingPlat(x1, y1, x2, y2, w, h, speed = 80, type = 'normal') {
    return {
      x: x1,
      y: y1,
      x1,
      y1,
      x2,
      y2,
      w,
      h,
      speed,
      type: 'moving',
      subType: type,
      progress: 0,
      dir: 1
    };
  }

  function spike(x, y, w, h = 18) {
    return { x, y, w, h, type: 'spikes' };
  }

  function sardine(id, x, y) {
    return { id, x, y, collected: false };
  }

  function sign(x, y, text) {
    return { x, y, text };
  }

  function chat(x, y, speaker, text, nextText = null) {
    return { x, y, speaker, text, nextText, triggered: false };
  }

  function checkpoint(x, y, label = '') {
    const meter = Math.max(0, Math.round(-y / PIXELS_PER_METER));
    return { x, y, meter, label: label || `${meter}m`, reached: false };
  }

  // =========================================================================
  // GENERACIÓN DEL SECTOR 1: BASE GLACIAR (0m a 100m | Y: 0 a -2400)
  // =========================================================================
  function buildSector1() {
    const platforms = [];
    const hazards = [];
    const checkpoints = [];
    const collectibles = [];
    const signs = [];
    const dialogues = [];
    const movingPlatforms = [];

    // Base del Glaciar (0m)
    platforms.push(plat(100, 0, 500, 60, 'normal'));
    checkpoints.push(checkpoint(220, 0, '0m - Campamento Base'));

    signs.push(sign(340, -75, "📜 Diario: «Atarse con cuerda parecía buena idea... ¡hasta que Fredo resbaló!»"));
    dialogues.push(chat(240, -40, 1, "¡Pingo! ¿Seguro que este nudo marinero aguanta?", "¡Tú salta sin miedo, Fredo! Si caemos, caemos con estilo."));

    // Escalón 1: salto simple para habituarse
    platforms.push(plat(680, -60, 220, 45, 'normal'));
    signs.push(sign(790, -135, "Usa A/D (◄/►) para moverte y W (▲) para saltar"));

    // Escalón 2: salto más alto que requiere tirar o impulso
    platforms.push(plat(980, -145, 240, 45, 'normal'));
    dialogues.push(chat(1060, -190, 2, "¡Mis patitas no llegan arriba solas!", "¡Usa la inercia de la cuerda!"));

    // Primer muro de impulso (subida izquierda)
    platforms.push(plat(940, -260, 200, 45, 'normal'));
    platforms.push(plat(640, -370, 220, 45, 'normal'));
    collectibles.push(sardine('fish_1_1', 650, -425));

    // Abismo horizontal con primer péndulo (Y: -500)
    // El anfitrión se clava con S/▼ en el saliente derecho, el otro se balancea
    platforms.push(plat(360, -480, 180, 40, 'normal'));
    signs.push(sign(450, -555, "🪢 PÉNDULO: Uno se ANCLA al borde con S o ▼; el otro salta al vacío"));

    // Plataforma de recepción del péndulo
    platforms.push(plat(70, -440, 210, 42, 'normal'));
    checkpoints.push(checkpoint(140, -440, '20m - Salto del Péndulo'));

    // Embudo de castigo: si fallan el péndulo caen al suelo de 0m
    // Continuación ascendiendo por la derecha
    platforms.push(plat(100, -590, 200, 45, 'normal'));
    platforms.push(plat(370, -690, 230, 45, 'normal'));
    hazards.push(spike(430, -708, 65, 18));

    // Checkpoint 40m
    platforms.push(plat(680, -800, 280, 45, 'normal'));
    checkpoints.push(checkpoint(760, -800, '35m - Terraza de la Escarcha'));

    dialogues.push(chat(760, -845, 1, "¡35 metros de altura! Ya veo las nubes de reojo.", "No mires abajo, Fredo, que me mareas a mí."));

    // Tramo de escalones de hielo combinados
    platforms.push(plat(1040, -920, 200, 42, 'ice'));
    signs.push(sign(1140, -995, "🧊 ¡Cuidado con el hielo! En hielo NO te puedes anclar (S/▼ resbala)"));

    platforms.push(plat(800, -1040, 190, 42, 'normal'));
    platforms.push(plat(530, -1140, 200, 42, 'ice'));
    collectibles.push(sardine('fish_1_2', 540, -1195));

    // Pared vertical de hielo escalable con piolet (climbWall)
    platforms.push(plat(320, -1400, 50, 260, 'climbWall'));
    platforms.push(plat(140, -1400, 180, 45, 'normal'));
    signs.push(sign(220, -1475, "⛏️ Mantén S o ▼ tocando la pared azul para clavar piolet (WALL CLING)"));

    // Terraza 60m
    platforms.push(plat(280, -1530, 220, 45, 'normal'));
    platforms.push(plat(580, -1640, 240, 45, 'normal'));
    checkpoints.push(checkpoint(660, -1640, '70m - Cornisa Ventosa'));

    // Péndulo doble hacia la pared este
    platforms.push(plat(900, -1750, 170, 42, 'normal'));
    signs.push(sign(980, -1825, "🪢 Bombea con ◄/► en el aire mientras la cuerda esté tensa para ganar altura"));

    // Plataforma distante con embudo de castigo (caída libre hasta Y: -800 si fallan)
    platforms.push(plat(1180, -1700, 200, 45, 'normal'));
    collectibles.push(sardine('fish_1_3', 1240, -1755));

    platforms.push(plat(1000, -1880, 210, 45, 'normal'));
    platforms.push(plat(720, -1990, 220, 45, 'normal'));
    hazards.push(spike(780, -2008, 60, 18));

    platforms.push(plat(430, -2100, 230, 45, 'normal'));
    platforms.push(plat(150, -2220, 220, 45, 'normal'));
    collectibles.push(sardine('fish_1_4', 160, -2275));

    // Entrada al Sector 2 (100m)
    platforms.push(plat(380, -2400, 420, 55, 'normal'));
    checkpoints.push(checkpoint(480, -2400, '100m - Refugio del Glaciar'));
    signs.push(sign(600, -2475, "⛺ 100 METROS SUPERADOS. ¡Entrando a las Cuevas de Hielo!"));
    dialogues.push(chat(520, -2445, 2, "¡100 metros! ¡Fredo, aún no hemos roto la cuerda!", "Pues prepárate, que las cuevas de arriba están heladas..."));

    return { platforms, hazards, checkpoints, collectibles, signs, dialogues, movingPlatforms };
  }

  // =========================================================================
  // GENERACIÓN DEL SECTOR 2: CUEVAS DE HIELO RESBALADIZO (100m a 200m | Y: -2400 a -4800)
  // =========================================================================
  function buildSector2() {
    const platforms = [];
    const hazards = [];
    const checkpoints = [];
    const collectibles = [];
    const signs = [];
    const dialogues = [];
    const movingPlatforms = [];

    // Rampas de hielo resbaladizo (Fricción bajísima: 0.015)
    // El anclaje está prohibido en bloques 'ice'
    platforms.push(plat(860, -2510, 260, 40, 'ice'));
    signs.push(sign(960, -2585, "⚠️ Fricción casi nula. Si un compañero resbala, te arrastrará"));

    platforms.push(plat(1180, -2630, 240, 40, 'ice'));
    hazards.push(spike(1240, -2648, 70, 18));

    // Pared de salvación (único lugar donde clavar piolet para detener la caída)
    platforms.push(plat(1460, -2890, 50, 260, 'climbWall'));
    platforms.push(plat(1200, -2890, 240, 45, 'normal'));
    checkpoints.push(checkpoint(1270, -2890, '120m - Gruta Congelada'));

    dialogues.push(chat(1280, -2935, 1, "¡Casi salgo disparado al piso de abajo!", "¡Te dije que apuntaras a la pared azul con S/▼!"));

    // Tramo de saltos milimétricos sobre hielo
    platforms.push(plat(920, -2990, 210, 38, 'ice'));
    platforms.push(plat(640, -3100, 220, 38, 'ice'));
    collectibles.push(sardine('fish_2_1', 650, -3155));

    // Abismo de péndulo sobre estalagmitas de hielo
    platforms.push(plat(380, -3210, 170, 42, 'normal'));
    signs.push(sign(460, -3285, "🪢 Péndulo a ciegas: Salta hacia la izquierda con impulso"));

    platforms.push(plat(60, -3170, 210, 42, 'ice'));
    hazards.push(spike(110, -3188, 70, 18));

    // Checkpoint 140m
    platforms.push(plat(80, -3360, 250, 45, 'normal'));
    checkpoints.push(checkpoint(160, -3360, '140m - Caverna del Eco'));

    // Chimenea de hielo vertical (subida combinada pared-pared)
    platforms.push(plat(400, -3600, 45, 240, 'climbWall'));
    platforms.push(plat(580, -3600, 45, 240, 'climbWall'));
    platforms.push(plat(450, -3620, 120, 38, 'normal'));
    signs.push(sign(510, -3695, "🧗 Escalada en Chimenea: Alternad agarres en pared antes de que se agote la stamina"));

    collectibles.push(sardine('fish_2_2', 510, -3760));

    // Embudo de castigo: un resbalón aquí te tira 60 metros abajo a Y: -2890
    platforms.push(plat(740, -3740, 240, 40, 'ice'));
    platforms.push(plat(1040, -3850, 220, 40, 'ice'));
    hazards.push(spike(1100, -3868, 60, 18));

    platforms.push(plat(1320, -3970, 250, 45, 'normal'));
    checkpoints.push(checkpoint(1400, -3970, '165m - Saliente de Cristal'));

    dialogues.push(chat(1410, -4015, 2, "¡Mira ese carámbano gigante! ¿Aguantará?", "Más te vale que sí, porque no pienso bajar a buscarte."));

    // Balancín cooperativo largo
    platforms.push(plat(1080, -4090, 180, 42, 'normal'));
    platforms.push(plat(780, -4200, 190, 40, 'ice'));
    collectibles.push(sardine('fish_2_3', 790, -4255));

    platforms.push(plat(490, -4310, 210, 42, 'normal'));
    platforms.push(plat(200, -4420, 230, 40, 'ice'));
    hazards.push(spike(260, -4438, 65, 18));

    // Checkpoint 185m
    platforms.push(plat(120, -4560, 280, 45, 'normal'));
    checkpoints.push(checkpoint(200, -4560, '185m - Portal Subterráneo'));

    // Salida de las cuevas hacia las cumbres
    platforms.push(plat(460, -4670, 230, 42, 'normal'));
    platforms.push(plat(760, -4780, 240, 42, 'normal'));
    collectibles.push(sardine('fish_2_4', 820, -4835));

    // Plataforma de transición Sector 2 -> Sector 3 (200m)
    platforms.push(plat(1060, -4800, 420, 55, 'normal'));
    checkpoints.push(checkpoint(1160, -4800, '200m - Paso de los Vientos'));
    signs.push(sign(1270, -4875, "🌬️ 200 METROS: ¡Salisteis de las cuevas! Se aproxima viento huracanado"));
    dialogues.push(chat(1180, -4845, 1, "¡Siento una corriente de aire helado que corta la cara!", "¡Es la Cumbre de los Vientos! ¡Agárrate fuerte!"));

    return { platforms, hazards, checkpoints, collectibles, signs, dialogues, movingPlatforms };
  }

  // =========================================================================
  // GENERACIÓN DEL SECTOR 3: CUMBRES DE VIENTO (200m a 300m | Y: -4800 a -7200)
  // =========================================================================
  function buildSector3() {
    const platforms = [];
    const hazards = [];
    const checkpoints = [];
    const collectibles = [];
    const signs = [];
    const dialogues = [];
    const movingPlatforms = [];

    // Sistema de viento activo (Ciclo: 4s calma -> 2s aviso nieve rápida -> 3.5s ráfaga fuerte)
    // Plataformas flotantes al aire libre expuestas a la ventisca
    platforms.push(plat(750, -4930, 230, 42, 'normal'));
    signs.push(sign(850, -5005, "🌬️ RÁFAGA: Durante la ventisca, quédate ANCLADO o te empujará al abismo"));

    platforms.push(plat(460, -5040, 220, 42, 'normal'));
    hazards.push(spike(520, -5058, 60, 18));

    platforms.push(plat(180, -5150, 220, 45, 'normal'));
    checkpoints.push(checkpoint(260, -5150, '215m - Cresta del Vendaval'));

    // Chimenea vertical extrema #1: deben escalar rápido antes de que la stamina (3s) expire
    platforms.push(plat(120, -5420, 48, 270, 'climbWall'));
    platforms.push(plat(280, -5420, 48, 270, 'climbWall'));
    platforms.push(plat(180, -5440, 150, 42, 'normal'));
    collectibles.push(sardine('fish_3_1', 230, -5495));

    dialogues.push(chat(200, -5485, 2, "¡Se me cansan las aletas de clavar el piolet!", "¡No te duermas en la pared que a los 3 segundos te caes!"));

    // Paso de cuerda expuesto al viento cruzado
    platforms.push(plat(480, -5560, 180, 42, 'normal'));
    signs.push(sign(560, -5635, "🪢 El viento altera la parábola del péndulo. ¡Aprovecha el empuje a favor!"));

    platforms.push(plat(790, -5520, 210, 42, 'ice'));
    hazards.push(spike(840, -5538, 65, 18));

    platforms.push(plat(1080, -5640, 240, 45, 'normal'));
    checkpoints.push(checkpoint(1160, -5640, '235m - Atalaya del Huracán'));

    // Embudo de castigo: hueco de 500px entre Y: -5640 y Y: -5150
    platforms.push(plat(820, -5760, 200, 40, 'ice'));
    platforms.push(plat(540, -5880, 210, 42, 'normal'));
    collectibles.push(sardine('fish_3_2', 550, -5935));

    platforms.push(plat(260, -6000, 220, 45, 'normal'));
    checkpoints.push(checkpoint(340, -6000, '250m - Refugio de la Ventisca'));

    // Tramo de doble pared vertical con descanso mínimo
    platforms.push(plat(100, -6260, 48, 260, 'climbWall'));
    platforms.push(plat(100, -6280, 190, 42, 'normal'));

    platforms.push(plat(380, -6380, 200, 42, 'normal'));
    hazards.push(spike(430, -6398, 60, 18));

    platforms.push(plat(670, -6490, 210, 40, 'ice'));
    platforms.push(plat(960, -6600, 220, 42, 'normal'));
    collectibles.push(sardine('fish_3_3', 970, -6655));

    // Checkpoint 275m
    platforms.push(plat(1240, -6720, 250, 45, 'normal'));
    checkpoints.push(checkpoint(1320, -6720, '280m - Cornisa de los Rayos'));

    dialogues.push(chat(1330, -6765, 1, "¡Mira las nubes tormentosas abajo!", "¡Estamos a casi 300 metros, Pingo! ¡Un último empujón!"));

    // Péndulo largo hacia la izquierda
    platforms.push(plat(990, -6840, 170, 42, 'normal'));
    platforms.push(plat(690, -6800, 200, 40, 'ice'));

    platforms.push(plat(400, -6930, 210, 42, 'normal'));
    platforms.push(plat(120, -7060, 220, 42, 'normal'));
    collectibles.push(sardine('fish_3_4', 130, -7115));

    // Plataforma de transición Sector 3 -> Sector 4 (300m)
    platforms.push(plat(320, -7200, 440, 55, 'normal'));
    checkpoints.push(checkpoint(420, -7200, '300m - Entrada a las Minas'));
    signs.push(sign(540, -7275, "⛏️ 300 METROS: ¡Minas Inestables! Cuidado con plataformas quebradizas y móviles"));
    dialogues.push(chat(460, -7245, 2, "¡Estas vigas de madera vieja rechinan muchísimo!", "Pisa rápido y no te quedes mirando las vistas..."));

    return { platforms, hazards, checkpoints, collectibles, signs, dialogues, movingPlatforms };
  }

  // =========================================================================
  // GENERACIÓN DEL SECTOR 4: MINAS INESTABLES (300m a 400m | Y: -7200 a -9600)
  // =========================================================================
  function buildSector4() {
    const platforms = [];
    const hazards = [];
    const checkpoints = [];
    const collectibles = [];
    const signs = [];
    const dialogues = [];
    const movingPlatforms = [];

    // Plataformas 'crumble' (Tiemblan 1.2s, se rompen 3.5s y reaparecen)
    platforms.push(plat(820, -7310, 180, 36, 'crumble'));
    signs.push(sign(910, -7385, "💥 BLOQUES CRUMBLE: Se desmoronan a los 1.2s de pisarlos"));

    platforms.push(plat(1080, -7420, 180, 36, 'crumble'));

    // Primera plataforma móvil: se desplaza entre (1320, -7540) y (1560, -7540)
    movingPlatforms.push(movingPlat(1300, -7540, 1580, -7540, 160, 38, 90, 'normal'));

    // Checkpoint 320m
    platforms.push(plat(1640, -7660, 250, 45, 'normal'));
    checkpoints.push(checkpoint(1720, -7660, '320m - Engranaje Central'));

    dialogues.push(chat(1730, -7705, 1, "¡La plataforma se movía sola!", "¡Si te anclas con S/▼ encima, te mueves con ella!"));

    // Secuencia de crumbles sobre abismo con pinchos
    platforms.push(plat(1380, -7780, 160, 36, 'crumble'));
    hazards.push(spike(1400, -7740, 120, 18));

    platforms.push(plat(1120, -7890, 160, 36, 'crumble'));
    platforms.push(plat(860, -8000, 160, 36, 'crumble'));
    collectibles.push(sardine('fish_4_1', 870, -8055));

    // Plataforma móvil vertical: sube y baja entre Y: -8200 y Y: -7980
    movingPlatforms.push(movingPlat(620, -8000, 620, -8250, 150, 38, 75, 'normal'));

    platforms.push(plat(340, -8280, 230, 45, 'normal'));
    checkpoints.push(checkpoint(420, -8280, '345m - Pozo de Ventilación'));

    // Pared de escalada con secciones crumble intercaladas
    platforms.push(plat(160, -8520, 50, 240, 'climbWall'));
    platforms.push(plat(240, -8540, 150, 36, 'crumble'));
    signs.push(sign(310, -8615, "⚠️ Si te agarras a un bloque crumble en la pared, también se romperá"));

    platforms.push(plat(460, -8650, 190, 42, 'normal'));
    collectibles.push(sardine('fish_4_2', 470, -8705));

    // Embudo de castigo masivo: hueco vertical que te lleva 70 metros abajo
    movingPlatforms.push(movingPlat(740, -8760, 1020, -8760, 160, 38, 100, 'ice'));

    platforms.push(plat(1140, -8880, 170, 36, 'crumble'));
    platforms.push(plat(1380, -8990, 240, 45, 'normal'));
    checkpoints.push(checkpoint(1460, -8990, '375m - Estación de Carga'));

    dialogues.push(chat(1470, -9035, 2, "¡Mira las poleas gigantes! Estamos en el corazón de la mina.", "¡Agárrate bien a la cuerda y mira arriba!"));

    // Péndulo de relevo entre dos plataformas móviles
    movingPlatforms.push(movingPlat(1100, -9120, 1100, -9340, 150, 38, 85, 'normal'));
    collectibles.push(sardine('fish_4_3', 1120, -9400));

    platforms.push(plat(840, -9230, 170, 36, 'crumble'));
    platforms.push(plat(580, -9350, 170, 36, 'crumble'));
    hazards.push(spike(630, -9368, 65, 18));

    platforms.push(plat(300, -9460, 210, 42, 'normal'));
    collectibles.push(sardine('fish_4_4', 310, -9515));

    // Plataforma de transición Sector 4 -> Sector 5 (400m)
    platforms.push(plat(520, -9600, 460, 55, 'normal'));
    checkpoints.push(checkpoint(620, -9600, '400m - La Antesala del Cielo'));
    signs.push(sign(750, -9675, "👑 400 METROS: ¡LA CIMA FINAL! Viento polar, paredes quebradizas y salto catapulta"));
    dialogues.push(chat(660, -9645, 1, "¡Solo quedan 100 metros para el Altar Dorado!", "¡Pase lo que pase, coronamos juntos!"));

    return { platforms, hazards, checkpoints, collectibles, signs, dialogues, movingPlatforms };
  }

  // =========================================================================
  // GENERACIÓN DEL SECTOR 5: LA CIMA DE LOS PICOS (400m a 500m | Y: -9600 a -12000)
  // =========================================================================
  function buildSector5() {
    const platforms = [];
    const hazards = [];
    const checkpoints = [];
    const collectibles = [];
    const signs = [];
    const dialogues = [];
    const movingPlatforms = [];

    // Combinación maestra: viento fuerte + hielo + crumbles + saltos catapulta "3, 2, 1"
    platforms.push(plat(1040, -9720, 170, 36, 'crumble'));
    signs.push(sign(1120, -9795, "⏱️ CATAPULTA: Pulsa C (o botón 3-2-1) y saltad ambos sincronizados en '¡YA!'"));

    platforms.push(plat(1280, -9840, 170, 38, 'ice'));
    hazards.push(spike(1330, -9858, 60, 18));

    movingPlatforms.push(movingPlat(1500, -9960, 1740, -9960, 150, 38, 110, 'normal'));

    // Checkpoint 420m
    platforms.push(plat(1800, -10080, 240, 45, 'normal'));
    checkpoints.push(checkpoint(1880, -10080, '420m - Filo del Estratosfera'));

    dialogues.push(chat(1890, -10125, 2, "¡El cielo se volvió oscuro! ¡Se ven las estrellas en pleno día!", "¡Estamos tan altos que la gravedad parece ligera!"));

    // Chimenea final de hielo vertical sobre abismo infinito
    platforms.push(plat(1520, -10340, 48, 260, 'climbWall'));
    platforms.push(plat(1360, -10340, 48, 260, 'climbWall'));
    platforms.push(plat(1400, -10360, 130, 36, 'crumble'));
    collectibles.push(sardine('fish_5_1', 1420, -10420));

    platforms.push(plat(1120, -10470, 180, 40, 'ice'));
    platforms.push(plat(840, -10590, 180, 36, 'crumble'));
    hazards.push(spike(890, -10608, 60, 18));

    platforms.push(plat(560, -10710, 230, 45, 'normal'));
    checkpoints.push(checkpoint(640, -10710, '445m - Terraza de las Auroras'));

    // Salto de catapulta doble sincronizada a través de ráfaga horizontal
    platforms.push(plat(280, -10830, 170, 42, 'normal'));
    signs.push(sign(360, -10905, "🪢 Salto Slingshot máximo: Un compañero cuelga tenso y salta con el impulso"));

    platforms.push(plat(60, -10950, 160, 36, 'crumble'));
    collectibles.push(sardine('fish_5_2', 70, -11005));

    movingPlatforms.push(movingPlat(180, -11100, 460, -11100, 150, 38, 95, 'normal'));

    platforms.push(plat(580, -11220, 230, 45, 'normal'));
    checkpoints.push(checkpoint(660, -11220, '470m - Vía Láctea Helada'));

    dialogues.push(chat(670, -11265, 1, "¡30 metros más y tocamos el Altar!", "¡No resbales ahora por el amor de Poseidón!"));

    // Escalones finales hacia el Altar
    platforms.push(plat(920, -11340, 160, 36, 'crumble'));
    platforms.push(plat(1160, -11460, 160, 40, 'ice'));
    hazards.push(spike(1210, -11478, 60, 18));

    platforms.push(plat(1400, -11580, 180, 36, 'crumble'));
    collectibles.push(sardine('fish_5_3', 1420, -11635));

    platforms.push(plat(1120, -11700, 200, 42, 'normal'));
    checkpoints.push(checkpoint(1200, -11700, '488m - El Último Saliente'));

    platforms.push(plat(840, -11820, 190, 40, 'ice'));
    platforms.push(plat(560, -11930, 180, 42, 'normal'));
    collectibles.push(sardine('fish_5_4', 580, -11985));

    // =========================================================================
    // CUMBRE FINAL: EL ALTAR DORADO DEL GRAN PINGÜINO (500m | Y: -12000)
    // =========================================================================
    const summitPlat = plat(150, -12000, 520, 65, 'normal');
    platforms.push(summitPlat);

    checkpoints.push(checkpoint(320, -12000, '500m - ¡CUMBRE ALCANZADA!'));
    signs.push(sign(410, -12075, "🏆 ¡EL ALTAR DE LOS PICOS UNIDOS! Tocad el Iglú Dorado"));
    dialogues.push(chat(280, -12045, 1, "¡LO HICIMOS FREDO! ¡500 METROS DE ESCALADA!", "¡Y CON LA CUERDA ENTERA! ¡A POR LAS SARDINAS!"));

    return {
      platforms,
      hazards,
      checkpoints,
      collectibles,
      signs,
      dialogues,
      movingPlatforms,
      goal: { x: 440, y: -12110, w: 120, h: 110 }
    };
  }

  // =========================================================================
  // ENSAMBLADOR DE LA MONTAÑA CONTINUA Y LOS NIVELES MODULARES
  // =========================================================================
  const s1 = buildSector1();
  const s2 = buildSector2();
  const s3 = buildSector3();
  const s4 = buildSector4();
  const s5 = buildSector5();

  /**
   * NIVEL 0: La Gran Montaña Continua (0m a 500m sin pantallas de corte)
   */
  const continuousMountain = {
    id: 0,
    name: "Gran Montaña Continua (0m — 500m)",
    isContinuous: true,
    stepCount: 88,
    ropeLength: 185,
    windForce: 1.15,
    spawn: { x: 220, y: -45 },
    goal: s5.goal,
    platforms: [...s1.platforms, ...s2.platforms, ...s3.platforms, ...s4.platforms, ...s5.platforms],
    hazards: [...s1.hazards, ...s2.hazards, ...s3.hazards, ...s4.hazards, ...s5.hazards],
    checkpoints: [...s1.checkpoints, ...s2.checkpoints, ...s3.checkpoints, ...s4.checkpoints, ...s5.checkpoints],
    collectibles: [...s1.collectibles, ...s2.collectibles, ...s3.collectibles, ...s4.collectibles, ...s5.collectibles],
    signs: [...s1.signs, ...s2.signs, ...s3.signs, ...s4.signs, ...s5.signs],
    dialogues: [...s1.dialogues, ...s2.dialogues, ...s3.dialogues, ...s4.dialogues, ...s5.dialogues],
    movingPlatforms: [
      ...s1.movingPlatforms,
      ...s2.movingPlatforms,
      ...s3.movingPlatforms,
      ...s4.movingPlatforms,
      ...s5.movingPlatforms
    ]
  };

  /**
   * Helper para generar niveles individuales de práctica por sector
   */
  function makeSectorLevel(id, name, sectorData, spawnX, spawnY, goalRect, windForce = 0) {
    return {
      id,
      name,
      isContinuous: false,
      stepCount: sectorData.platforms.length,
      ropeLength: 185,
      windForce,
      spawn: { x: spawnX, y: spawnY },
      goal: goalRect,
      platforms: sectorData.platforms,
      hazards: sectorData.hazards,
      checkpoints: sectorData.checkpoints,
      collectibles: sectorData.collectibles,
      signs: sectorData.signs,
      dialogues: sectorData.dialogues,
      movingPlatforms: sectorData.movingPlatforms
    };
  }

  const sector1Lvl = makeSectorLevel(
    1,
    "Sector 1: Base Glaciar (0m — 100m)",
    s1,
    220,
    -45,
    { x: 540, y: -2510, w: 100, h: 110 },
    0
  );

  const sector2Lvl = makeSectorLevel(
    2,
    "Sector 2: Cuevas de Hielo (100m — 200m)",
    s2,
    920,
    -2555,
    { x: 1200, y: -4910, w: 100, h: 110 },
    0
  );

  const sector3Lvl = makeSectorLevel(
    3,
    "Sector 3: Cumbres de Viento (200m — 300m)",
    s3,
    810,
    -4975,
    { x: 480, y: -7310, w: 100, h: 110 },
    1.1
  );

  const sector4Lvl = makeSectorLevel(
    4,
    "Sector 4: Minas Inestables (300m — 400m)",
    s4,
    870,
    -7355,
    { x: 680, y: -9710, w: 100, h: 110 },
    0.6
  );

  const sector5Lvl = makeSectorLevel(
    5,
    "Sector 5: La Cima Final (400m — 500m)",
    s5,
    1080,
    -9765,
    s5.goal,
    1.25
  );

  // Niveles exportados a window.LEVELS
  // Índice 0: Gran Montaña Continua (modo principal)
  // Índices 1-5: Sectores individuales para práctica
  window.LEVELS = [
    continuousMountain,
    sector1Lvl,
    sector2Lvl,
    sector3Lvl,
    sector4Lvl,
    sector5Lvl
  ];

  window.PIXELS_PER_METER = PIXELS_PER_METER;
})();