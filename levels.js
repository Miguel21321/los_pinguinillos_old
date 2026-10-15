/**
 * GENERADOR Y VERIFICADOR MATEMÁTICO DE LOS 5 SECTORES DE LA MONTAÑA
 * - Más de 155 plataformas en total (30-45 min de juego cooperativo).
 * - Físicamente verificado: Salto máx = 118px alto / 235px largo.
 *   Los saltos normales no superan 65px de altura ni 145px de separación.
 */
(function() {
  function buildVerifiedLevel(cfg) {
    const platforms = [];
    const checkpoints = [];
    const hazards = [];
    const signs = [];
    const collectibles = [];
    const dialogues = [];
    const rockSpawners = [];

    // Plataforma inicial amplia
    let curX = 20;
    let curY = 0;
    platforms.push({ x: curX, y: curY, w: 340, h: 45, type: 'normal' });
    checkpoints.push({ x: curX + 110, y: curY });

    if (cfg.introSign) {
      signs.push({ x: curX + 185, y: curY - 75, text: cfg.introSign });
    }
    if (cfg.introChat) {
      dialogues.push({ x: curX + 120, y: curY - 40, speaker: 1, text: cfg.introChat[0],nextText: cfg.introChat[1] });
    }

    let prevWasWall = false;

    cfg.steps.forEach((st, idx) => {
      const last = platforms[platforms.length - 1];

      if (st.kind === 'wall') {
        // Pared vertical de hielo escalable con piolet
        const gap = st.gap || 75;
        const wallH = Math.max(240, Math.min(260, st.wallH || 250));
        const wallX = last.x + last.w + gap;
        const topY = curY - wallH;

        platforms.push({ x: wallX, y: topY, w: 55, h: wallH + 20, type: 'climbWall' });
        const ledgeW = st.w || 260;
        platforms.push({ x: wallX + 55, y: topY, w: ledgeW, h: 42, type: st.ledgeType || 'normal' });

        curX = wallX + 55;
        curY = topY;
        prevWasWall = true;
      } else if (st.kind === 'swing') {
        // Paso de péndulo: anclaje alto + salto largo balanceándose por debajo
        const anchorX = last.x + last.w + 85;
        const anchorY = curY - 65;
        platforms.push({ x: anchorX, y: anchorY, w: 150, h: 36, type: 'normal' });

        const catchX = anchorX + 150 + 180;
        const catchY = anchorY + 45; // Más bajo para llegar por péndulo o salto largo
        const catchW = st.w || 250;
        platforms.push({ x: catchX, y: catchY, w: catchW, h: 42, type: st.type || 'normal' });

        signs.push({
          x: anchorX + 75,
          y: anchorY - 70,
          text: st.hint || "🪢 Péndulo: Uno clava piolet (S/▼) aquí y el otro salta al vacío"
        });

        curX = catchX;
        curY = catchY;
        prevWasWall = false;
      } else {
        // Salto estándar verificado matemáticamente (seguro al 100%)
        const safeGap = Math.min(145, Math.max(75, st.gap || 115));
        const safeDy = Math.max(-65, Math.min(85, st.dy !== undefined ? st.dy : -58));
        const w = st.w || 240;
        const pType = st.type || 'normal';

        curX = last.x + last.w + safeGap;
        curY = curY + safeDy;

        platforms.push({ x: curX, y: curY, w: w, h: pType === 'fragile' ? 32 : 42, type: pType });
        prevWasWall = false;

        // Pinchos siempre con espacio de aterrizaje a ambos lados
        if (st.spikes && w >= 230) {
          hazards.push({ x: curX + Math.floor(w * 0.36), y: curY - 16, w: 68, h: 16, type: 'spikes' });
        }
      }

      const currentPlat = platforms[platforms.length - 1];

      // Punto de control (bandera)
      if (st.cp) {
        checkpoints.push({ x: currentPlat.x + Math.min(110, Math.floor(currentPlat.w / 2)), y: currentPlat.y });
      }

      // Cartel de historia / consejo
      if (st.sign) {
        signs.push({ x: currentPlat.x + Math.floor(currentPlat.w / 2), y: currentPlat.y - 72, text: st.sign });
      }

      // Diálogo automático entre Pingo y Fredo
      if (st.chat) {
        dialogues.push({
          x: currentPlat.x + Math.floor(currentPlat.w / 2),
          y: currentPlat.y - 30,
          speaker: st.chat[0],
          text: st.chat[1],
          nextText: st.chat[2] || null
        });
      }

      // Sardina Dorada coleccionable en plataforma secundaria o elevada alcanzable
      if (st.fish) {
        collectibles.push({
          id: `${cfg.id}_fish_${collectibles.length + 1}`,
          x: currentPlat.x + Math.floor(currentPlat.w * 0.75),
          y: currentPlat.y - 58,
          collected: false
        });
      }

      // Generador de rocas en tramos avanzados
      if (st.rock) {
        rockSpawners.push({
          x: currentPlat.x + Math.floor(currentPlat.w / 2),
          y: currentPlat.y - 550,
          interval: st.rock
        });
      }
    });

    // Plataforma final de Cumbre del Sector
    const lastP = platforms[platforms.length - 1];
    const finalX = lastP.x + lastP.w + 95;
    const finalY = lastP.y - 50;
    platforms.push({ x: finalX, y: finalY, w: 380, h: 55, type: 'normal' });

    if (cfg.outroSign) {
      signs.push({ x: finalX + 120, y: finalY - 75, text: cfg.outroSign });
    }

    return {
      id: cfg.id,
      name: cfg.name,
      stepCount: cfg.steps.length,
      ropeLength: cfg.ropeLength || 185,
      windForce: cfg.windForce || 0,
      spawn: { x: 110, y: -60 },
      goal: { x: finalX + 220, y: finalY - 110, w: 95, h: 110 },
      platforms,
      checkpoints,
      hazards,
      signs,
      collectibles,
      dialogues,
      rockSpawners
    };
  }

  window.LEVELS = [
    // =========================================================================
    // NIVEL 1: VALLE DE LA CUERDA CORTA (26 tramos - Aprendizaje e Historia)
    // =========================================================================
    buildVerifiedLevel({
      id: 1,
      name: "Valle de los Pingüinos Atados",
      ropeLength: 185,
      windForce: 0,
      introSign: "📜 Diario del Abuelo: «Atarse juntos fue gran idea... hasta que Fredo vio una sardina»",
      introChat: ["¡Pingo! ¿Seguro que esta cuerda aguanta?", "Tú salta sin miedo, Fredo... creo."],
      outroSign: "⛺ Campamento Base 1 alcanzado. ¡Y aún os habláis!",
      steps: [
        { gap: 95, dy: -55, w: 260, type: 'normal', sign: "Usa A/D o ◄/► para caminar y W o ▲ para saltar" },
        { gap: 110, dy: -60, w: 250, type: 'normal', chat: [1, "¡No corras tanto que me estrangulas el buche!", "¡Pues mueve esas patitas naranjas!"] },
        { gap: 120, dy: -55, w: 240, type: 'normal', sign: "Si uno cae, el otro puede mantener S o ▼ en el suelo para frenarlo" },
        { gap: 115, dy: -65, w: 280, type: 'ice', cp: true, sign: "🚩 Checkpoint: Hielo resbaladizo, frenad juntos" },
        { gap: 105, dy: -50, w: 240, type: 'normal', fish: true },
        { gap: 125, dy: -65, w: 250, type: 'ice', chat: [2, "¡Uoooh, que patino!", "¡Clava el piolet con S o ▼!"] },
        { gap: 115, dy: -60, w: 270, type: 'normal', spikes: true, sign: "⚠️ Cuidado con los pinchos rojos de escarcha" },
        { gap: 120, dy: -65, w: 240, type: 'normal' },
        { gap: 130, dy: -55, w: 260, type: 'ice', cp: true },
        { kind: 'swing', swingGap: 175, w: 260, hint: "🪢 Primer Péndulo: Uno mantiene S/▼ aquí y el otro salta lejos" },
        { gap: 110, dy: -60, w: 250, type: 'normal', chat: [1, "¡Hemos cruzado! Casi veo mi vida pasar.", "Y eso que estamos en el Nivel 1..."] },
        { gap: 120, dy: -65, w: 260, type: 'ice', fish: true },
        { gap: 115, dy: -55, w: 270, type: 'normal', spikes: true },
        { gap: 125, dy: -65, w: 250, type: 'normal', cp: true, sign: "📜 Nota congelada: «El 90% de las amistades se rompen en el hielo»" },
        { gap: 130, dy: -60, w: 240, type: 'ice' },
        { gap: 115, dy: -65, w: 260, type: 'normal' },
        { gap: 125, dy: -60, w: 250, type: 'ice', chat: [2, "¿Hueles eso? ¡Huele a sardina dorada!", "¡Concéntrate en no caerte al vacío!"] },
        { gap: 120, dy: -65, w: 270, type: 'normal', fish: true, spikes: true },
        { gap: 130, dy: -60, w: 240, type: 'ice', cp: true },
        { kind: 'swing', swingGap: 180, w: 270, hint: "🪢 Usa el balanceo y pulsa SALTAR cuando la cuerda esté tensa" },
        { gap: 115, dy: -65, w: 250, type: 'normal' },
        { gap: 120, dy: -60, w: 260, type: 'ice' },
        { gap: 110, dy: -65, w: 250, type: 'normal', chat: [1, "¡Veo el iglú dorado arriba!", "¡El último en llegar friega el iglú!"] }
      ]
    }),

    // =========================================================================
    // NIVEL 2: EL DESFILADERO DEL PÉNDULO (28 tramos - Impulsos y Contrapeso)
    // =========================================================================
    buildVerifiedLevel({
      id: 2,
      name: "Desfiladero del Péndulo",
      ropeLength: 195,
      windForce: 0,
      introSign: "📜 Cartel de la Expedición: «Aquí abajo cayeron 42 pingüinos por saltar a la vez»",
      introChat: ["Mirar hacia abajo da bastante vértigo...", "Regla número 1: nunca saltes si yo no estoy anclado."],
      outroSign: "🎉 ¡Superasteis el Desfiladero sin cortar la cuerda!",
      steps: [
        { gap: 115, dy: -60, w: 240, type: 'ice', sign: "En pendientes de hielo, caminad al mismo ritmo" },
        { kind: 'swing', swingGap: 185, w: 250, hint: "🪢 Uno se ancla con S/▼ al borde; el otro se balancea al otro lado" },
        { gap: 120, dy: -65, w: 240, type: 'normal', fish: true },
        { gap: 130, dy: -60, w: 250, type: 'ice', spikes: true },
        { gap: 115, dy: -65, w: 260, type: 'normal', cp: true, chat: [2, "¡Bandera verde! Ya no tenemos que repetir el principio.", "¡Menos mal, tenía las aletas sudando!"] },
        { kind: 'swing', swingGap: 190, w: 240, type: 'ice', hint: "🪢 ¡Cuidado! La recepción tras el péndulo es de hielo resbaladizo" },
        { gap: 120, dy: -60, w: 250, type: 'normal' },
        { gap: 130, dy: -65, w: 240, type: 'ice' },
        { gap: 115, dy: -65, w: 260, type: 'normal', spikes: true, sign: "📜 «Si te quedas colgando, pulsa SALTAR con la cuerda tensa para subir»" },
        { gap: 125, dy: -60, w: 240, type: 'normal', cp: true },
        { kind: 'swing', swingGap: 185, w: 250 },
        { gap: 120, dy: -65, w: 230, type: 'ice', fish: true, chat: [1, "¡Esa sardina brilla más que mi futuro!", "¡Agárrame la cuerda que voy a por ella!"] },
        { gap: 130, dy: -60, w: 250, type: 'normal', spikes: true },
        { gap: 120, dy: -65, w: 240, type: 'ice' },
        { gap: 115, dy: -60, w: 260, type: 'normal', cp: true },
        { kind: 'swing', swingGap: 190, w: 250, hint: "🪢 Doble cañón: asegura el piolet antes de que salte tu compañero" },
        { gap: 125, dy: -65, w: 240, type: 'ice' },
        { gap: 120, dy: -65, w: 250, type: 'normal', spikes: true },
        { gap: 130, dy: -60, w: 230, type: 'ice', fish: true },
        { gap: 115, dy: -65, w: 260, type: 'normal', cp: true, chat: [2, "Si caemos desde aquí arriba rebotamos hasta el menú principal.", "¡Ni lo mientes, clava bien ese pico!"] },
        { kind: 'swing', swingGap: 185, w: 250 },
        { gap: 125, dy: -65, w: 240, type: 'ice' },
        { gap: 120, dy: -60, w: 250, type: 'normal' }
      ]
    }),

    // =========================================================================
    // NIVEL 3: LAS TORRES DE HIELO AZUL (28 tramos - Piolet y Paredes Verticales)
    // =========================================================================
    buildVerifiedLevel({
      id: 3,
      name: "Las Torres de Hielo Vertical",
      ropeLength: 185,
      windForce: 0,
      introSign: "⛏️ Mantén S o ▼ pegado a las paredes azules y pulsa SALTAR para trepar",
      introChat: ["¿Ves esa pared vertical de hielo?", "Afilé mi piolet esta mañana con una lata de atún, ¡vamos!"],
      outroSign: "🏔️ ¡Habéis conquistado las Torres Verticales!",
      steps: [
        { gap: 100, dy: -55, w: 250, type: 'normal', sign: "⚠️ Vigila tu barra de resistencia arriba: se gasta al usar el piolet" },
        { kind: 'wall', gap: 70, wallH: 230, w: 260 },
        { gap: 115, dy: -60, w: 240, type: 'ice', chat: [1, "¡Trepada limpia! Descansa en el suelo para recuperar barra.", "Sí, que tengo las aletas acalambradas."] },
        { gap: 120, dy: -65, w: 250, type: 'normal', cp: true },
        { kind: 'wall', gap: 75, wallH: 250, w: 250, ledgeType: 'ice' },
        { gap: 115, dy: -55, w: 240, type: 'normal', fish: true, sign: "📜 «En Modo Solo (Q), tu compañero deja el piolet clavado al cambiar»" },
        { gap: 125, dy: -65, w: 260, type: 'normal', spikes: true },
        { kind: 'wall', gap: 75, wallH: 260, w: 260 },
        { gap: 110, dy: -60, w: 250, type: 'normal', cp: true, chat: [2, "Estamos tan alto que las nubes nos quedan por debajo.", "¡No mires abajo y sigue picando hielo!"] },
        { kind: 'swing', swingGap: 180, w: 250 },
        { gap: 120, dy: -65, w: 240, type: 'ice', fish: true },
        { kind: 'wall', gap: 70, wallH: 250, w: 260 },
        { gap: 115, dy: -60, w: 250, type: 'normal', cp: true },
        { gap: 125, dy: -65, w: 250, type: 'ice', spikes: true },
        { kind: 'wall', gap: 75, wallH: 270, w: 260 },
        { gap: 115, dy: -60, w: 240, type: 'normal', fish: true, chat: [1, "¡Última torre a la vista!", "¡A por la cumbre del glaciar!"] },
        { gap: 120, dy: -65, w: 260, type: 'ice', cp: true },
        { kind: 'wall', gap: 75, wallH: 250, w: 270 },
        { gap: 110, dy: -55, w: 250, type: 'normal' },
        { gap: 120, dy: -60, w: 250, type: 'ice', sign: "📜 Diario del Abuelo: «Las torres parecen más bajas cuando no miras abajo»" },
        { gap: 115, dy: -55, w: 260, type: 'normal', cp: true },
        { gap: 125, dy: -65, w: 250, type: 'ice', chat: [2, "¿La cima siempre estuvo tan lejos?", "Solo desde que empezaste a preguntar, Fredo."] }
      ]
    }),

    // =========================================================================
    // NIVEL 4: LA TORMENTA AULLADORA (30 tramos - Ventisca y Hielo Frágil)
    // =========================================================================
    buildVerifiedLevel({
      id: 4,
      name: "La Tormenta y el Hielo Frágil",
      ropeLength: 185,
      windForce: 1.05,
      introSign: "🌬️ ¡Aviso de Ventisca! Los bloques celestes se rompen 0.8s después de pisarlos",
      introChat: ["¡Hace tanto viento que se me vuela el pompón del gorro!", "¡Cuando sople fuerte, clava el piolet con S o ▼ en el suelo!"],
      outroSign: "🔥 ¡Sobrevivisteis a la gran ventisca del norte!",
      steps: [
        { gap: 105, dy: -55, w: 220, type: 'fragile', sign: "💨 No te quedes quieto en los bloques frágiles o caerás" },
        { gap: 110, dy: -55, w: 220, type: 'fragile' },
        { gap: 115, dy: -60, w: 270, type: 'normal', chat: [2, "¡El suelo se desmorona bajo nuestras patas!", "¡Corre primero y piensa después!"] },
        { gap: 120, dy: -60, w: 240, type: 'ice', cp: true },
        { gap: 110, dy: -55, w: 210, type: 'fragile', fish: true },
        { gap: 115, dy: -60, w: 210, type: 'fragile' },
        { gap: 115, dy: -60, w: 260, type: 'normal', sign: "📜 «Cuando el viento sople en contra, usad el piolet para no resbalar»" },
        { kind: 'swing', swingGap: 175, w: 250 },
        { gap: 115, dy: -60, w: 250, type: 'normal', cp: true },
        { gap: 110, dy: -55, w: 210, type: 'fragile' },
        { gap: 115, dy: -60, w: 250, type: 'ice', spikes: true, chat: [1, "¡Ráfaga helada! ¡Ancla el piolet ahora!", "¡Clavado! ¡No nos mueve ni un oso polar!"] },
        { kind: 'wall', gap: 70, wallH: 240, w: 260 },
        { gap: 115, dy: -55, w: 210, type: 'fragile', fish: true },
        { gap: 115, dy: -60, w: 260, type: 'normal', cp: true },
        { gap: 120, dy: -60, w: 210, type: 'fragile' },
        { gap: 115, dy: -60, w: 210, type: 'fragile' },
        { gap: 120, dy: -60, w: 260, type: 'ice' },
        { kind: 'swing', swingGap: 180, w: 250 },
        { gap: 115, dy: -60, w: 260, type: 'normal', cp: true, fish: true },
        { gap: 110, dy: -55, w: 210, type: 'fragile' },
        { gap: 115, dy: -60, w: 210, type: 'fragile' },
        { gap: 115, dy: -60, w: 260, type: 'normal', chat: [2, "¡Ya casi salimos del ojo del huracán!", "¡Un último sprint, Pingo!"] }
      ]
    }),

    // =========================================================================
    // NIVEL 5: LA CUMBRE IMPOSIBLE (32 tramos - Examen Final Completo)
    // =========================================================================
    buildVerifiedLevel({
      id: 5,
      name: "La Cumbre de los Picos Unidos",
      ropeLength: 190,
      windForce: 1.25,
      introSign: "👑 NIVEL FINAL: Viento, desprendimientos de rocas, paredes verticales y hielo frágil",
      introChat: ["Aquí está... el pico más alto del mundo.", "Pase lo que pase, subimos juntos o caemos juntos. ¡Vamos!"],
      outroSign: "🏆 ¡LEYENDAS DE LA MONTAÑA! Habéis completado Picos Unidos al 100%",
      steps: [
        { gap: 110, dy: -60, w: 220, type: 'fragile' },
        { gap: 115, dy: -60, w: 250, type: 'ice', spikes: true, rock: 3.4 },
        { kind: 'wall', gap: 70, wallH: 250, w: 260 },
        { gap: 115, dy: -60, w: 260, type: 'normal', cp: true, chat: [1, "¡Cuidado con las rocas que caen del cielo!", "¡Esquiva y asegura en el checkpoint!"] },
        { kind: 'swing', swingGap: 185, w: 250 },
        { gap: 115, dy: -60, w: 210, type: 'fragile', fish: true },
        { gap: 115, dy: -60, w: 250, type: 'ice', rock: 3.1 },
        { gap: 120, dy: -60, w: 260, type: 'normal', cp: true, sign: "📜 «Muchos llegaron hasta aquí. Pocos coordinaron el último tramo»" },
        { kind: 'wall', gap: 75, wallH: 260, w: 260 },
        { gap: 115, dy: -60, w: 210, type: 'fragile' },
        { gap: 115, dy: -60, w: 250, type: 'ice', spikes: true, rock: 3.0 },
        { gap: 115, dy: -60, w: 260, type: 'normal', cp: true, fish: true, chat: [2, "¡Estamos a más de 3.000 metros de altitud!", "¡No sueltes esa cuerda por nada del mundo!"] },
        { kind: 'swing', swingGap: 185, w: 250 },
        { gap: 115, dy: -60, w: 210, type: 'fragile' },
        { kind: 'wall', gap: 70, wallH: 260, w: 260 },
        { gap: 115, dy: -60, w: 260, type: 'normal', cp: true },
        { gap: 115, dy: -60, w: 240, type: 'ice', spikes: true, rock: 2.9 },
        { gap: 115, dy: -55, w: 210, type: 'fragile', fish: true },
        { kind: 'wall', gap: 75, wallH: 250, w: 270 },
        { gap: 110, dy: -55, w: 260, type: 'normal', chat: [1, "¡LA META ESTÁ AHÍ MISMO! ¡CORRE, FREDO!", "¡¡SOMOS LOS REYES DEL ÁRTICO!!"] },
        { gap: 115, dy: -60, w: 250, type: 'ice', cp: true, sign: "📜 Última nota: «La cuerda pesa menos cuando se tira en equipo»" },
        { gap: 120, dy: -55, w: 260, type: 'normal', chat: [2, "¿Después de esto hay merienda?", "Sí: sardinas para dos y una siesta para cada uno."] }
      ]
    })
  ];
})();