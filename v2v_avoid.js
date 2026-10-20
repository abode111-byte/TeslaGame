/* v2v_avoid.js - cooperative V2V avoidance for the traffic cars.
   Load it LAST in Game.html:  <script src="v2v_avoid.js"></script>   (after supercharger_snippet.js)

   How it works (once per frame):
   1. PREDICT   the player's path for the next 4 s from position, speed and measured turn rate.
   2. DETECT    every car predicts its own path; the first time it would enter the player's bubble it becomes
                an "alert" car and picks a side AWAY from the player's predicted path (+ speeds up if it is
                ahead of the player, brakes if it is behind).
   3. COOPERATE alert cars send a V2V message to the neighbouring-lane cars on the side they are moving to;
                those make room (keeping a 2.5 m gap) and pass the message on, so the whole row moves aside
                together, also far cars. A car that has a wall behind it limits its neighbour, so nobody
                gets squeezed into another car.
   4. ANIMATE   amber links + travelling data packets + pulsing halos, only while cars are avoiding.
   The lateral shift is an overlay (c.av) on top of the normal lane AI, so lane changes still work. */
(() => {
    const T_H = 4, DS = .25, N = 17, MAXO = 2.4, HALF = 10.3, GAP = 2.5, MAXN = 48;
    const PX = new Float32Array(N), PZ = new Float32Array(N);
    let psiPrev = P.psi, psiRate = 0, lastT = -1, AI = false;   /* AI = avoidance mode, OFF by default */

    /* ---------- on/off button (bottom-middle row) + key B ---------- */
    function setAI(on) {
        AI = on; const b = document.getElementById('aiB');
        if (b) { b.textContent = 'V2V AI Mode: ' + (on ? 'On' : 'Off') + ' (B)'; b.classList.toggle('on', on) }
        if (typeof sfx !== 'undefined' && sfx.click) sfx.click()
    }
    {
        const ctl = document.getElementById('ctl'), ref = document.getElementById('v2vB');
        if (ctl) {
            const b = document.createElement('button'); b.id = 'aiB'; b.textContent = 'V2V AI Mode: Off (B)'; ctl.insertBefore(b, ref ? ref.nextSibling : null);
            b.onclick = () => { if (typeof audioInit === 'function') audioInit(); setAI(!AI) }
        }
        addEventListener('keydown', e => { if (e.code === 'KeyB' && !e.repeat && !e.ctrlKey && !e.metaKey) setAI(!AI) })
    }

    /* ---------- animation objects ---------- */
    const tex = f => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; f(cv.getContext('2d')); return new THREE.CanvasTexture(cv) };
    const dotT = tex(g => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 30); r.addColorStop(0, '#fff'); r.addColorStop(.35, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64) });
    const ringT = tex(g => { g.strokeStyle = '#fff'; g.lineWidth = 5; g.shadowColor = '#fff'; g.shadowBlur = 8; g.beginPath(); g.arc(32, 32, 22, 0, 7); g.stroke() });
    const mk = (Obj, mat, n, k) => { const geo = new THREE.BufferGeometry(), pos = new Float32Array(n * k * 3), col = new Float32Array(n * k * 3); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); const o = new Obj(geo, mat); o.frustumCulled = false; o.renderOrder = 6; o.visible = false; scene.add(o); return { o, geo, pos, col } };
    const blend = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
    const L = mk(THREE.LineSegments, new THREE.LineBasicMaterial({ vertexColors: true, ...blend }), MAXN, 2);
    const K = mk(THREE.Points, new THREE.PointsMaterial({ size: 1.1, map: dotT, vertexColors: true, ...blend }), MAXN, 2);
    const H = mk(THREE.Points, new THREE.PointsMaterial({ size: 6, map: ringT, color: 0xffb020, ...blend }), MAXN, 1);

    function draw() {
        const vis = typeof v2vOn === 'undefined' || v2vOn; let k = 0, m = 0, h = 0;
        if (vis) for (const c of traffic) {
            if (!c.on || !c.src || k >= MAXN) continue;
            const a = c.src, p = .55 + .45 * Math.sin(time * 14 + k), f = ((time - c.evT) * 2.4) % 1, f2 = 1 - ((f + .5) % 1);
            L.pos.set([a.x, 2.1, a.z, c.x, 2.1, c.z], k * 6); L.col.set([p, .72 * p, .1 * p, p, .72 * p, .1 * p], k * 6);
            K.pos.set([a.x + (c.x - a.x) * f, 2.2, a.z + (c.z - a.z) * f], m * 3); K.col.set([1, .95, .7], m * 3); m++;     /* alert packet a -> c */
            K.pos.set([a.x + (c.x - a.x) * f2, 2.2, a.z + (c.z - a.z) * f2], m * 3); K.col.set([.4, 1, 1], m * 3); m++;     /* ack c -> a */
            H.pos.set([c.x, .3, c.z], h * 3); h++; k++
        }
        L.geo.setDrawRange(0, k * 2); K.geo.setDrawRange(0, m); H.geo.setDrawRange(0, h);
        for (const q of [L, K, H]) { q.geo.attributes.position.needsUpdate = true; q.geo.attributes.color.needsUpdate = true; q.o.visible = k > 0 }
        const fr = (time * 1.6) % 1; H.o.material.size = 3 + 9 * fr; H.o.material.opacity = .9 * (1 - fr)
    }

    /* ---------- planning ---------- */
    function push(a, s, depth) {   /* a is moving sideways in direction s -> tell the neighbours on that side to make room */
        if (depth > 5) return;
        const abx = a.x - (a.av || 0), ax = abx + a.nT;
        for (const n of traffic) {
            if (n === a || Math.abs(n.z - a.z) > 11) continue;
            const nb = n.x - (n.av || 0), rel = (nb - abx) * s;
            if (rel < .8 || rel > 5.6 || n.nT * s < -.3) continue;
            let off = (ax + s * GAP - nb) * s; if (off <= 0) continue;
            off = Math.min(off, MAXO, Math.max(0, s > 0 ? HALF - nb : nb + HALF));
            if (n.nT * s < off - .05) { n.nT = s * off; n.nSrc = a; push(n, s, depth + 1) }
            const maxA = ((nb + n.nT) - s * GAP - abx) * s;    /* never overlap the neighbour, even if it hit a wall */
            if (a.nT * s > maxA) a.nT = s * Math.max(0, maxA)
        }
    }

    function plan(dt) {
        if (!AI) {   /* mode off: cars behave normally, any leftover sideways shift relaxes back to the lane */
            for (const c of traffic) { if (c.pz !== undefined && Math.abs(c.z - c.pz) > 30) c.av = 0; c.pz = c.z; c.avT = c.va = 0; c.on = false }
            draw(); return
        }
        const d = Math.atan2(Math.sin(P.psi - psiPrev), Math.cos(P.psi - psiPrev)); psiPrev = P.psi;
        psiRate += (d / dt - psiRate) * Math.min(1, dt * 6);
        let x = P.x, z = P.z;
        for (let i = 0; i < N; i++) { PX[i] = x; PZ[i] = z; const h = P.psi + psiRate * i * DS; x += -Math.sin(h) * P.v * DS; z += -Math.cos(h) * P.v * DS }
        const seeds = [];
        for (const c of traffic) {
            if (c.pz !== undefined && Math.abs(c.z - c.pz) > 30) { c.av = c.avT = 0; c.on = false }   /* car was recycled */
            c.pz = c.z; c.nT = 0; c.va = 0; c.nSrc = null;
            if (Math.abs(c.z - P.z) > 220) continue;
            const bx = c.x - (c.av || 0), cvx = c.vx || 0, bz = 6.5 + Math.min(5, Math.abs(P.v - c.v) * .12);
            for (let i = 0; i < N; i++) {
                const t = i * DS, cx = bx + cvx * Math.min(t, 1) * .5, cz = c.z - c.v * t, dx = Math.abs(PX[i] - cx);
                if (dx >= 3 || Math.abs(PZ[i] - cz) >= bz) continue;
                const u = 1 - t / T_H, s = dx < .25 ? (bx > 0 ? -1 : 1) : Math.sign(cx - PX[i]);
                const room = s > 0 ? HALF - bx : bx + HALF, off = Math.min(MAXO, 3.45 - dx, Math.max(0, room));
                if (off > .15) { c.nT = s * off; c.nSrc = P; seeds.push(c) }
                c.va = cz > PZ[i] ? -(2 + 5 * u) : (1 + 2 * u);    /* car behind the player brakes, car ahead speeds up */
                break
            }
        }
        for (const c of seeds) push(c, Math.sign(c.nT), 0);
        for (const c of traffic) {
            if (c.nT) { c.avT = c.nT; c.alT = time; c.src = c.nSrc || c.src }
            else if (time - (c.alT || -9) > .7) c.avT = 0;
            const on = Math.abs(c.avT || 0) > .3; if (on && !c.on) c.evT = time; c.on = on
        }
        draw()
    }

    /* ---------- hook: wrap stepCar ---------- */
    const s0 = stepCar;
    stepCar = function (c, dt) {
        if (time !== lastT) { lastT = time; plan(dt) }
        const old = c.av || 0, tgt = c.avT || 0;
        c.x -= old;                                   /* the normal lane AI sees the car without the avoidance shift */
        s0(c, dt);
        let nv = old + (tgt - old) * Math.min(1, dt * (Math.abs(tgt) > Math.abs(old) ? 5 : 2.2));   /* react fast, relax slowly */
        nv = Math.max(-HALF - c.x, Math.min(HALF - c.x, nv));
        c.x += nv; c.av = nv;
        c.psi += (-Math.atan2(c.vx + (nv - old) / dt, Math.max(c.v, 2)) - c.psi) * Math.min(1, dt * 8);
        if (c.va) c.v = Math.max(0, Math.min(c.vd + 6, c.v + c.va * dt))
    }
})();