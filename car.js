/* =============================================================================
   car.js  -  PLAYER CAR  (Tesla Model Y "Juniper"-style, fully procedural)
   -----------------------------------------------------------------------------
   Load AFTER three.js and BEFORE the main game script:
       <script src="car.js"></script>

   API
       const car = buildPlayerCar({ glow });   // glow = the game's sprite-glow helper
       scene.add(car.g);
       car.update(P, dt);                      // call once per frame

   Returns { g, body, wheels, rear, update, dims }
       g       root group  -> game sets position.x / z and rotation.y (heading)
       body    child group -> pitch / roll applied in update(). The game parents the
               interior cockpit to it and hides every child except the cockpit in
               the Interior camera, so keep ALL exterior parts inside `body`.
       wheels  the 4 wheel groups (front two steer, all four spin)
       rear    MeshBasicMaterial of the tail lights (brake light colour)

   INTERIOR: buildInterior() below builds the Model Y cabin (dash, door cards, seats, console, wheel,
   mirrors, glass roof). It is parented to `g` (not `body`) and shown only while the exterior body is
   hidden (Interior camera). It hides game.html's old cockpit boxes/wheel and re-uses the game's live
   dash screen (repositioned). No changes to game.html are required.

   Conventions: car faces -Z, origin = ground centre, units = metres.
   Size: length 4.84 / width 1.95 / height 1.63 / wheel radius 0.37 / wheelbase 2.86
   P fields read each frame: v, steer, pitch, roll, br
   ============================================================================= */
(function () {
    'use strict';

    const L2 = 2.42;                 // half length
    const WR = .37, WX = .84, WZ = 1.43;   // wheel radius, wheel x, wheel z (+/-)
    const NB = 6;                    // squareness of the lower body (superellipse exponent)
    const MR = 72;                   // vertices around each cross-section
    const PAINT_HEX = 0x9b1b22;      // <- body colour (also change PAINT below)
    const PAINT = [.608, .106, .133], TRIM = [.035, .035, .04];
    const GLASS = [.05, .06, .075], FRAME = [.012, .012, .014];

    /* ---------------------------------------------------------------- helpers */
    const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

    /* smooth 1-D curve through [z, value] control points (cubic Hermite / Catmull-Rom) */
    function curve(p) {
        const n = p.length;
        return z => {
            if (z <= p[0][0]) return p[0][1];
            if (z >= p[n - 1][0]) return p[n - 1][1];
            let i = 0; while (i < n - 2 && z > p[i + 1][0]) i++;
            const a = p[Math.max(i - 1, 0)], b = p[i], c = p[i + 1], d = p[Math.min(i + 2, n - 1)];
            const h = c[0] - b[0], t = (z - b[0]) / h, t2 = t * t, t3 = t2 * t;
            const m1 = (c[1] - a[1]) / ((c[0] - a[0]) || 1) * h, m2 = (d[1] - b[1]) / ((d[0] - b[0]) || 1) * h;
            return (2 * t3 - 3 * t2 + 1) * b[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * c[1] + (t3 - t2) * m2;
        };
    }

    /* ------------------------------------------------- body shape (side profile)
       Each curve is a function of z (-2.42 nose ... +2.42 tail).                    */
    const yT = curve([[-2.42, .64], [-2.34, .72], [-2.1, .79], [-1.6, .87], [-1.1, .93], [-.7, .97], [0, 1], [1, 1.02], [1.9, 1.06], [2.2, 1.085], [2.34, 1.10], [2.42, 1.03]]); // hood / belt / deck line
    const yB = curve([[-2.42, .40], [-2.3, .29], [-2.0, .22], [-1.4, .19], [1.4, .19], [2.0, .23], [2.3, .32], [2.42, .44]]);                                                    // underside
    const nTop = curve([[-2.42, 2.6], [-1.5, 2.8], [-.9, 3.6], [-.4, 4.4], [1.5, 4.4], [2.0, 3.6], [2.42, 3]]);                                                                // roundness of upper edge
    /* glass house (cabin) */
    const gHW = curve([[-1.5, .5], [-1.3, .66], [-1, .73], [-.5, .79], [0, .83], [.6, .845], [1.2, .83], [1.7, .77], [2, .69], [2.2, .6], [2.36, .45]]);
    const yR = curve([[-1.5, .78], [-1.3, .91], [-1, 1.14], [-.6, 1.38], [-.2, 1.55], [.2, 1.615], [.7, 1.625], [1.2, 1.585], [1.65, 1.485], [2, 1.335], [2.2, 1.21], [2.36, 1.07]]); // roof line

    /* half width seen from above: rounded nose / tail + rear haunch & front fender flare */
    function planHW(z) {
        const s = Math.min(Math.abs(z) / L2, 1), p = z < 0 ? 4.2 : 4.8;
        return .955 * Math.pow(Math.max(1 - Math.pow(s, p), 0), 1 / p)
            + .02 * Math.exp(-Math.pow((z - WZ) / .55, 2)) + .02 * Math.exp(-Math.pow((z + WZ) / .5, 2));
    }

    /* ---------------------------------------- cross-sections (rounded super-ellipse) */
    function superPt(hw, yb, yw, yt, nt, nb, phi) {
        const c = Math.cos(phi), s = Math.sin(phi), n = s >= 0 ? nt : nb;
        const r = 1 / Math.pow(Math.pow(Math.abs(c), n) + Math.pow(Math.abs(s), n), 1 / n);
        return [hw * r * c, s >= 0 ? yw + (yt - yw) * r * s : yw + (yw - yb) * r * s];
    }
    const sec = z => { const yb = yB(z), yt = yT(z); return { hw: planHW(z), yb, yt, yw: yb + .75 * (yt - yb), nt: nTop(z) }; };
    const gSec = z => { const yt = yR(z), yb = Math.min(yT(z) - .1, yt - .003); return { hw: gHW(z), yb, yt, yw: yb + Math.min(.12, (yt - yb) * .35), nt: 2.7 }; };
    const ringOf = S => { const o = []; for (let j = 0; j <= MR; j++) o.push(superPt(S.hw, S.yb, S.yw, S.yt, S.nt, NB, -Math.PI / 2 + j / MR * 2 * Math.PI)); return o; };
    const bodyRing = z => ringOf(sec(z)), glassRing = z => ringOf(gSec(z));

    /* exact surface lookups (used to lay trims / panel lines on the body) */
    function surfX(z, y) {
        const S = sec(z); let n, h;
        if (y >= S.yw) { n = S.nt; h = (y - S.yw) / (S.yt - S.yw); } else { n = NB; h = (S.yw - y) / (S.yw - S.yb); }
        h = Math.min(Math.max(h, 0), .999);
        return S.hw * Math.pow(1 - Math.pow(h, n), 1 / n);
    }
    function surfY(z, x) {
        const S = sec(z), u = Math.min(Math.abs(x) / S.hw, .999);
        return S.yw + (S.yt - S.yw) * Math.pow(1 - Math.pow(u, S.nt), 1 / S.nt);
    }

    /* ------------------------------------------------------------- lofting */
    const stations = (a, b, N) => { const o = []; for (let i = 0; i <= N; i++) o.push((a + b) / 2 - (b - a) / 2 * Math.cos(Math.PI * i / N)); return o; };
    function loft(zs, ringFn, colorFn) {
        const N = zs.length, M = MR + 1, pos = new Float32Array(N * M * 3), col = new Float32Array(N * M * 3), idx = [];
        for (let i = 0; i < N; i++) {
            const r = ringFn(zs[i]);
            for (let j = 0; j < M; j++) {
                const k = (i * M + j) * 3, c = colorFn(r[j][0], r[j][1], zs[i]);
                pos[k] = r[j][0]; pos[k + 1] = r[j][1]; pos[k + 2] = zs[i];
                col[k] = c[0]; col[k + 1] = c[1]; col[k + 2] = c[2];
            }
        }
        for (let i = 0; i < N - 1; i++) for (let j = 0; j < M - 1; j++) { const a = i * M + j, b = a + 1, c = a + M, d = c + 1; idx.push(a, b, c, b, d, c); }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.setIndex(idx); g.computeVertexNormals();
        return g;
    }

    /* paint map: red body, black rockers / front intake / rear diffuser */
    function bodyCol(x, y, z) {
        const ax = Math.abs(x);
        let k = 1 - smooth(.22, .31, y);
        k = Math.max(k, (1 - smooth(.38, .50, y)) * (1 - smooth(.55, .80, ax)) * smooth(-2.05, -2.28, z));
        k = Math.max(k, (1 - smooth(.40, .52, y)) * smooth(2.1, 2.3, z));
        return mix(PAINT, TRIM, k);
    }
    /* glass map: tinted glass, black belt trim + B / C pillars */
    function glassCol(x, y, z) {
        const yt = yT(z);
        let k = 1 - smooth(yt, yt + .05, y);
        if (y < yt + .55 * (yR(z) - yt)) k = Math.max(k, 1 - smooth(.04, .09, Math.abs(z - .40)), 1 - smooth(.05, .10, Math.abs(z - 1.58)));
        return mix(GLASS, FRAME, k);
    }

    /* --------------------------------------------- light bars (front & rear) */
    function contour(zs, deg, off) {
        return zs.map(z => {
            const S = sec(z), p = superPt(S.hw, S.yb, S.yw, S.yt, S.nt, NB, deg * Math.PI / 180);
            const dx = p[0], dy = p[1] - S.yw, l = Math.hypot(dx, dy) || 1, dz = z < 0 ? -1 : 1;
            return new THREE.Vector3(p[0] + dx / l * off, p[1] + dy / l * off, z + dz * off * .7);
        });
    }
    const mir = v => new THREE.Vector3(-v.x, v.y, v.z);
    function lightStrip(sign, mat, housing) {
        const D = [0, .0004, .001, .0025, .006, .012, .022, .04, .065, .1, .15, .22, .3, .4, .5];
        const zs = D.map(d => sign * (L2 - d));
        const pB = contour(zs, 30, .010), pL = contour(zs, 30, .022), pH = contour(zs, 30, .004);
        const i0 = Math.max(2, pB.findIndex(v => v.x > .36)), grp = new THREE.Group();
        const tube = (pts, r, m) => grp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), Math.max(30, pts.length * 8), r, 6, false), m));
        const R = pB.slice(0, i0 + 1);
        tube(R.slice(1).map(mir).reverse().concat(R), .011, mat);               // thin centre bar
        for (const s of [1, -1]) {                                              // wrap-around lamps
            const f = v => s > 0 ? v : mir(v);
            tube(pL.slice(i0 - 1).map(f), .015, mat);
            if (housing) tube(pH.slice(i0 - 1).map(f), .03, housing);
        }
        grp.userData.anchor = pL[Math.min(i0 + 3, pL.length - 1)];
        return grp;
    }

    /* -------------------------------------------------- panel lines & wheel arches */
    function panelLines() {
        const v = [];
        const seg = (a, b) => v.push(a[0], a[1], a[2], b[0], b[1], b[2]);
        for (const z of [-.55, .40, 1.52]) for (const sx of [-1, 1]) {            // door shut lines
            const top = Math.min(1.0, yT(z) - .035); let prev = null;
            for (let k = 0; k <= 12; k++) { const y = .30 + (top - .30) * k / 12, p = [sx * (surfX(z, y) + .004), y, z]; if (prev) seg(prev, p); prev = p; }
        }
        for (const sx of [-1, 1]) {                                               // hood seams
            let prev = null;
            for (let k = 0; k <= 14; k++) { const z = -2.15 + 1.05 * k / 14, p = [sx * .74, surfY(z, .74) + .004, z]; if (prev) seg(prev, p); prev = p; }
        }
        {
            let prev = null;                                                        // trunk-lid line
            for (let k = 0; k <= 12; k++) { const x = -.75 + 1.5 * k / 12, p = [x, surfY(2.12, x) + .004, 2.12]; if (prev) seg(prev, p); prev = p; }
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
        return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1a0507 }));
    }
    function archGeo(zc) {                                  // dark wheel-well crescent that follows the body surface
        const R1 = .385, R2 = .47, N = 30, pos = [], idx = [];
        for (let i = 0; i <= N; i++) {
            const a = (-30 + i * 240 / N) * Math.PI / 180;
            for (const R of [R1, R2]) { const z = zc + R * Math.cos(a), y = Math.max(WR + R * Math.sin(a), yB(z) + .025); pos.push(surfX(z, y) + .003, y, z); }
        }
        for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
    }

    /* ----------------------------------------------------------------- wheels */
    function makeWheel(sx, mats, geos) {
        const w = new THREE.Group(); w.rotation.order = 'YXZ';
        const tire = new THREE.Mesh(geos.tire, mats.tire); tire.rotation.z = Math.PI / 2; w.add(tire);
        const face = new THREE.Mesh(geos.face, mats.face); face.rotation.z = Math.PI / 2; face.position.x = sx * .1175; w.add(face);
        const hub = new THREE.Mesh(geos.hub, mats.blade); hub.rotation.z = Math.PI / 2; hub.position.x = sx * .136; w.add(hub);
        for (let k = 0; k < 10; k++) {                                            // aero-turbine blades
            const pv = new THREE.Group(); pv.position.x = sx * .133; pv.rotation.x = k * Math.PI * 2 / 10;
            const b = new THREE.Mesh(geos.blade, mats.blade); b.position.y = .175; b.rotation.y = sx * .8; pv.add(b); w.add(pv);
        }
        return w;
    }

    /* =========================================================================
       INTERIOR (Model Y cabin) - lives in car.js, hooked into the game automatically.
       - Built as a separate group on the root `g` (NOT inside `body`) so the game's
         "hide every body child except cockpit" rule does not hide it.
       - Shown only while the exterior body mesh is hidden (= Interior camera).
       - The game's own cockpit boxes / wheel are hidden; its live dash SCREEN is kept
         (it is drawn by game.html) and re-positioned onto this dashboard.
       - Everything is baked vertex-colour MeshBasicMaterial -> predictable look,
         one draw call for the cabin, dims automatically at night.
       ========================================================================= */
    function buildInterior() {
        const group = new THREE.Group();
        const LD = new THREE.Vector3(.35, 1, .5).normalize();
        const _E = new THREE.Euler(), _Q = new THREE.Quaternion(), _P = new THREE.Vector3(), _S = new THREE.Vector3(), _M = new THREE.Matrix4();
        const Zax = new THREE.Vector3(0, 0, 1), Yax = new THREE.Vector3(0, 1, 0);
        const shadedM = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
        const glowM = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });   // ambient light lines (never dimmed)

        /* collects many baked parts into ONE geometry */
        function collector(mat) {
            const pos = [], col = [];
            function part(geo, hex, o) {
                o = o || {};
                const p = o.p || [0, 0, 0], r = o.r || [0, 0, 0], s = o.s || [1, 1, 1];
                if (o.q) _Q.copy(o.q); else { _E.set(r[0], r[1], r[2], 'XYZ'); _Q.setFromEuler(_E); }
                _P.set(p[0], p[1], p[2]); _S.set(s[0], s[1], s[2]); _M.compose(_P, _Q, _S);
                if (!geo.attributes.normal) geo.computeVertexNormals();
                const g = geo.index ? geo.toNonIndexed() : geo;
                g.applyMatrix4(_M);
                const A = g.attributes.position, N = g.attributes.normal, n = A.count;
                const cr = ((hex >> 16) & 255) / 255, cg = ((hex >> 8) & 255) / 255, cb = (hex & 255) / 255;
                const amb = o.amb === undefined ? .55 : o.amb, dif = o.dif === undefined ? .5 : o.dif;
                for (let i = 0; i < n; i++) {
                    const x = A.getX(i), y = A.getY(i), z = A.getZ(i);
                    let k = amb + dif * Math.max(0, N.getX(i) * LD.x + N.getY(i) * LD.y + N.getZ(i) * LD.z);
                    if (o.fn) k *= o.fn(x, y, z);
                    pos.push(x, y, z); col.push(Math.min(1, cr * k), Math.min(1, cg * k), Math.min(1, cb * k));
                }
            }
            function mesh() {
                const g = new THREE.BufferGeometry();
                g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
                g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
                const m = new THREE.Mesh(g, mat || shadedM); m.frustumCulled = false; return m;
            }
            return { part, mesh };
        }
        const box = (c, w, h, d, hex, x, y, z, o) => c.part(new THREE.BoxGeometry(w, h, d), hex, Object.assign({ p: [x, y, z] }, o || {}));
        const bar = (c, a, b, w, h, hex, o) => {          // box stretched between two points
            const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length(), q = new THREE.Quaternion().setFromUnitVectors(Zax, d.normalize());
            c.part(new THREE.BoxGeometry(w, h, len), hex, Object.assign({ p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], q }, o || {}));
        };

        /* palette */
        const PALE = 0xdcdcde, PALE2 = 0xc4c5c8, SEAT = 0xe9eaec, DASH_T = 0x25262b, DASH_F = 0x1b1c20, DARK = 0x17181b, TRIMC = 0x0e0f11, CONS = 0x212226, FLOOR = 0x121316, RED = 0xd2343c;
        const PW = { amb: .64, dif: .4 };                // pale surfaces: softer contrast

        const K = collector(shadedM), R = collector(glowM);

        /* ---- dashboard: extruded side profile (shape x = -z) ---- */
        {
            const s = new THREE.Shape();
            s.moveTo(1.42, .875); s.lineTo(1.05, .925); s.lineTo(.78, .962); s.quadraticCurveTo(.60, .99, .548, .975);
            s.lineTo(.532, .90); s.lineTo(.55, .70); s.lineTo(.64, .50); s.lineTo(1.4, .45); s.closePath();
            const dg = new THREE.ExtrudeGeometry(s, { depth: 1.66, bevelEnabled: true, bevelThickness: .016, bevelSize: .013, bevelSegments: 2, curveSegments: 8 });
            dg.translate(0, 0, -.83);
            K.part(dg, DASH_T, { r: [0, Math.PI / 2, 0], amb: .78, dif: .45 });
        }
        box(K, 1.5, .1, .1, 0x0c0d0e, 0, .885, -1.42);                          // cowl / wiper trough
        box(K, 1.44, .036, .022, 0xe2e2e4, 0, .905, -.543, { amb: .85, dif: .15 }); // pale vent / trim strip across the dash face
        box(K, 1.44, .05, .016, 0x0a0b0c, 0, .86, -.543);                          // dark gap under it
        box(K, 1.66, .13, .03, DASH_F, 0, .765, -.555);                           // lower dash face
        for (const sx of [-1, 1]) box(K, .13, .03, .03, 0x0a0b0c, sx * .76, .905, -.548);   // end vents
        box(R, 1.64, .006, .006, RED, 0, .978, -.532, { amb: 1, dif: 0 });          // red ambient line along dash
        box(K, .17, .09, .09, DARK, 0, 1.0, -.82);                                  // screen mount

        /* ---- hood sliver beyond the dash (painted) ---- */
        {
            const NZ = 8, NX = 14, pos = [], idx = [];
            for (let i = 0; i <= NZ; i++) { const z = -1.43 - 0.72 * i / NZ, hw = planHW(z) * .96; for (let j = 0; j <= NX; j++) { const x = -hw + 2 * hw * j / NX; pos.push(x, surfY(z, x) - .004, z); } }
            for (let i = 0; i < NZ; i++) for (let j = 0; j < NX; j++) { const a = i * (NX + 1) + j, b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
            const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hg.setIndex(idx);
            K.part(hg, PAINT_HEX, { amb: .7, dif: .35, fn: (x, y, z) => .8 + .55 * Math.exp(-x * x / .2) });
        }

        /* ---- door cards, belt trim, ambient lines, pulls ---- */
        for (const sx of [-1, 1]) {
            for (const d of [[-.58, .40], [.46, 1.56]]) {
                const zc = (d[0] + d[1]) / 2, L = d[1] - d[0];
                box(K, .05, .27, L, PALE, sx * .83, .835, zc, PW);              // pale upper card
                box(K, .05, .30, L, DARK, sx * .83, .55, zc);                   // dark lower card
                box(K, .075, .06, L, TRIMC, sx * .822, .995, zc);               // black beltline
                box(R, .006, .007, L - .04, RED, sx * .803, .958, zc, { amb: 1, dif: 0 }); // red ambient line
                box(K, .055, .075, .5, 0x26272b, sx * .81, .66, zc + .05);      // armrest / map pocket
            }
            box(K, .05, .05, .42, TRIMC, sx * .805, .875, .12);                 // door pull (horizontal)
            box(K, .05, .20, .05, TRIMC, sx * .805, .935, -.09);                // door pull (vertical)
            box(K, .05, .06, .20, 0x2a2b30, sx * .805, .74, -.34);              // window switch pod
            bar(K, [sx * .735, .97, -1.22], [sx * .785, 1.5, -.55], .08, .06, PALE2, PW);   // A-pillar
            box(K, .075, .58, .09, PALE2, sx * .80, 1.27, .43, PW);              // B-pillar
            box(K, .065, .05, 2.25, PALE2, sx * .79, 1.53, .62, PW);             // roof rail
            box(K, .07, .5, .11, PALE2, sx * .76, 1.28, 1.62, PW);               // C-pillar
        }

        /* ---- front header, overhead pods, roof ---- */
        box(K, 1.58, .1, .30, PALE2, 0, 1.55, -.45, PW);
        for (const sx of [-1, 1]) K.part(new THREE.SphereGeometry(1, 18, 8), 0xd6d7d9, { p: [sx * .36, 1.495, -.40], s: [.2, .02, .075], amb: .8, dif: .2 });
        box(K, .12, .06, .05, DARK, 0, 1.47, -.48);                              // rear-view mirror stalk
        box(K, .27, .075, .032, 0x0e0f11, .0, 1.425, -.50, { r: [0, -.35, 0] });  // rear-view mirror
        box(K, .245, .055, .006, 0x4a525d, -.006, 1.425, -.482, { r: [0, -.35, 0], amb: .9, dif: .1 });
        box(K, 1.58, .05, .5, 0x1a1b1e, 0, 1.585, -.1, PW);                       // front roof edge

        /* ---- floor, console ---- */
        box(K, 1.62, .02, 2.5, FLOOR, 0, .25, .55, { amb: .8, dif: .2 });
        box(K, .29, .34, 1.15, CONS, 0, .42, .1);
        box(K, .31, .33, .07, 0x0f1012, 0, .72, -.50);                            // glossy waterfall panel
        box(K, .22, .012, .42, 0x0b0c0e, 0, .595, -.12);                          // cup-holder / phone tray
        box(K, .29, .09, .38, 0x2a2b30, 0, .625, .52);                            // armrest lid
        box(K, .14, .006, .14, 0x34363c, 0, .606, -.30);                          // wireless pad

        /* ---- seats (driver at x=-.38, passenger x=+.38) + rear bench ---- */
        for (const sx of [-.38, .38]) {
            box(K, .52, .13, .58, SEAT, sx, .47, .52, PW);                         // cushion
            box(K, .07, .1, .5, 0xd2d3d6, sx - .27, .52, .5, PW); box(K, .07, .1, .5, 0xd2d3d6, sx + .27, .52, .5, PW);
            box(K, .52, .68, .12, SEAT, sx, .88, .78, Object.assign({ r: [.2, 0, 0] }, PW));            // backrest
            box(K, .07, .5, .14, 0xd2d3d6, sx - .27, .86, .76, Object.assign({ r: [.2, 0, 0] }, PW)); box(K, .07, .5, .14, 0xd2d3d6, sx + .27, .86, .76, Object.assign({ r: [.2, 0, 0] }, PW));
            box(K, .27, .2, .1, SEAT, sx, 1.31, .93, Object.assign({ r: [.16, 0, 0] }, PW));            // headrest
            box(K, .04, .1, .05, 0x2a2b30, sx, 1.15, .93);                            // headrest post
        }
        box(K, 1.4, .14, .55, SEAT, 0, .49, 1.3, PW);
        box(K, 1.4, .56, .11, SEAT, 0, .86, 1.62, Object.assign({ r: [.14, 0, 0] }, PW));
        for (const x of [-.46, 0, .46]) box(K, .26, .17, .08, SEAT, x, 1.28, 1.7, Object.assign({ r: [.12, 0, 0] }, PW));

        /* ---- steering column (static) ---- */
        {
            const n = new THREE.Vector3(0, Math.sin(.35), Math.cos(.35)), q = new THREE.Quaternion().setFromUnitVectors(Yax, n);
            K.part(new THREE.CylinderGeometry(.05, .055, .3, 16), 0x131417, { p: [-.38, .879, -.591], q });
            K.part(new THREE.CylinderGeometry(.075, .075, .08, 18), 0x16171a, { p: [-.38, .84, -.55], q });
        }

        /* ---- side mirrors as seen from inside (housing back + mirror glass) ---- */
        for (const sx of [-1, 1]) {
            K.part(new THREE.SphereGeometry(1, 16, 10), PAINT_HEX, { p: [sx * 1.0, 1.02, -.78], s: [.05, .065, .12], amb: .7, dif: .4 });
            K.part(new THREE.SphereGeometry(1, 16, 10), 0x58616d, { p: [sx * 1.0, 1.02, -.665], s: [.043, .056, .014], amb: .9, dif: .1 });
            box(K, .16, .02, .04, 0x0b0c0e, sx * .905, .99, -.78);
        }
        group.add(K.mesh(), R.mesh());

        /* ---- glass roof (tinted, translucent) ---- */
        const roofM = new THREE.MeshBasicMaterial({ color: 0x2a313c, transparent: true, opacity: .5, side: THREE.DoubleSide, depthWrite: false });
        const roof = new THREE.Mesh(new THREE.PlaneGeometry(1.52, 2.1), roofM); roof.rotation.x = Math.PI / 2; roof.position.set(0, 1.605, .78); roof.frustumCulled = false; group.add(roof);

        /* ---- steering wheel (animated by P.si like the game's own wheel) ---- */
        const wheelG = new THREE.Group(); wheelG.position.set(-.38, .93, -.45); wheelG.rotation.x = -.35; group.add(wheelG);
        const wi = new THREE.Group(); wheelG.add(wi);
        const W = collector(shadedM), WP = { amb: .75, dif: .4 };
        W.part(new THREE.TorusGeometry(.185, .024, 12, 48), 0x1c1d20, WP);
        W.part(new THREE.CylinderGeometry(.072, .078, .04, 28), 0x17181b, { r: [Math.PI / 2, 0, 0], amb: .75, dif: .4 });
        for (const sx of [-1, 1]) {
            box(W, .15, .058, .03, 0x1a1b1e, sx * .12, 0, 0, WP);                  // horizontal arm
            box(W, .074, .06, .012, 0x2c2d33, sx * .125, 0, .02, WP);               // button pad
            W.part(new THREE.CylinderGeometry(.013, .013, .008, 12), 0x9a9da4, { p: [sx * .125, 0, .028], r: [Math.PI / 2, 0, 0], amb: .9, dif: .1 });
            box(W, .03, .005, .004, 0xcfd2d8, sx * .125, .021, .027, { amb: 1, dif: 0 });
        }
        box(W, .05, .15, .028, 0x9a9da3, 0, -.105, 0, { amb: .8, dif: .3 });       // silver lower spoke
        wi.add(W.mesh());
        const logoM = new THREE.MeshBasicMaterial({ color: 0xffffff });
        if (typeof document !== 'undefined') {
            const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'); x.fillStyle = '#17181b'; x.fillRect(0, 0, 128, 128); x.fillStyle = '#dfe2e7';
            x.beginPath(); x.moveTo(18, 48); x.quadraticCurveTo(64, 20, 110, 48); x.lineTo(103, 60); x.quadraticCurveTo(64, 40, 25, 60); x.closePath(); x.fill();
            x.beginPath(); x.moveTo(57, 50); x.lineTo(71, 50); x.lineTo(68, 108); x.lineTo(60, 108); x.closePath(); x.fill();
            logoM.map = new THREE.CanvasTexture(cv);
        } else logoM.color.setHex(0x17181b);
        const logo = new THREE.Mesh(new THREE.CircleGeometry(.07, 32), logoM); logo.position.z = .022; wi.add(logo);

        let lastN = null;
        function update(P, night) {
            wi.rotation.z = (P.si || 0) * 1.5;
            night = !!night;
            if (night !== lastN) {
                lastN = night;
                shadedM.color.setRGB(night ? .22 : 1, night ? .25 : 1, night ? .33 : 1);
                logoM.color.setRGB(night ? .3 : 1, night ? .32 : 1, night ? .38 : 1);
                roofM.color.setHex(night ? 0x06080b : 0x2a313c);
            }
        }
        return { group, update };
    }

    /* =================================================================== BUILD */
    function buildPlayerCar(env) {
        const glow = env && env.glow ? env.glow : () => null;
        const g = new THREE.Group(), body = new THREE.Group(); g.add(body);

        const paintM = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, metalness: .55, roughness: .28, clearcoat: 1, clearcoatRoughness: .05 });
        const mirrorM = new THREE.MeshPhysicalMaterial({ color: PAINT_HEX, metalness: .55, roughness: .28, clearcoat: 1, clearcoatRoughness: .05 });
        const glassM = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, metalness: .2, roughness: .04, clearcoat: 1, clearcoatRoughness: 0 });
        const blackM = new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: .25, metalness: .4 });
        const headM = new THREE.MeshBasicMaterial({ color: 0xf2f7ff });
        const rear = new THREE.MeshBasicMaterial({ color: 0xcc0808 });
        const archM = new THREE.MeshBasicMaterial({ color: 0x040405, side: THREE.DoubleSide });

        /* body + glass house */
        const bm = new THREE.Mesh(loft(stations(-L2, L2, 100), bodyRing, bodyCol), paintM);
        const gm = new THREE.Mesh(loft(stations(-1.5, 2.36, 72), glassRing, glassCol), glassM);
        bm.castShadow = gm.castShadow = true; body.add(bm, gm);

        /* trims */
        body.add(panelLines());
        const fl = lightStrip(-1, headM, blackM), rl = lightStrip(1, rear, blackM);
        body.add(fl, rl);
        const fa = fl.userData.anchor, ra = rl.userData.anchor;
        let nightProbe = null;                                   // glow sprites are visible only at night -> used to dim the cabin
        for (const sx of [-1, 1]) {
            const gs = glow(0xdfeaff, 1.5, .7, sx * Math.abs(fa.x), fa.y, fa.z - .1, body); if (!nightProbe) nightProbe = gs;
            const A = new THREE.Mesh(archGeo(-WZ), archM), B = new THREE.Mesh(archGeo(WZ), archM);
            A.scale.x = B.scale.x = sx; body.add(A, B);
        }
        glow(0xff2020, 1.8, .7, ra.x, ra.y, ra.z + .1, body); glow(0xff2020, 1.8, .7, -ra.x, ra.y, ra.z + .1, body);
        glow(0xff2020, 3.0, .6, 0, ra.y, L2 + .1, body);

        /* side mirrors */
        const mg = new THREE.SphereGeometry(1, 18, 12), sg = new THREE.BoxGeometry(.14, .02, .035);
        for (const sx of [-1, 1]) {
            const m = new THREE.Mesh(mg, mirrorM); m.scale.set(.05, .065, .12); m.position.set(sx * 1.01, 1.02, -.80); m.castShadow = true; body.add(m);
            const s = new THREE.Mesh(sg, blackM); s.position.set(sx * .95, .995, -.78); body.add(s);
        }

        /* wheels */
        const tireProf = [[.25, -.1275], [.335, -.1275], [.362, -.115], [.37, -.08], [.37, .08], [.362, .115], [.335, .1275], [.25, .1275]].map(p => new THREE.Vector2(p[0], p[1]));
        const geos = { tire: new THREE.LatheGeometry(tireProf, 36), face: new THREE.CylinderGeometry(.305, .305, .03, 40), hub: new THREE.CylinderGeometry(.045, .045, .03, 20), blade: new THREE.BoxGeometry(.014, .235, .05) };
        const mats = { tire: new THREE.MeshStandardMaterial({ color: 0x111214, roughness: .92 }), face: new THREE.MeshStandardMaterial({ color: 0x2b2e34, metalness: .75, roughness: .45 }), blade: new THREE.MeshStandardMaterial({ color: 0x8b9098, metalness: .9, roughness: .3 }) };
        const wheels = [], front = [];
        for (const sx of [-1, 1]) for (const z of [-WZ, WZ]) {
            const w = makeWheel(sx, mats, geos); w.position.set(sx * WX, WR, z); body.add(w); wheels.push(w); if (z < 0) front.push(w);
        }

        /* interior cabin (shown only in the Interior camera) */
        const ext = new Set(body.children), cab = buildInterior(); cab.group.visible = false; g.add(cab.group);
        let hooked = false;
        function hookGame() {                                     // adopt the game's cockpit: hide its boxes + wheel, keep & move its live screen
            const ck = body.children.find(c => !ext.has(c) && c.isGroup); if (!ck) return;
            for (const c of ck.children) {
                if (c.isMesh) { c.visible = false; continue; }
                const isScreen = c.children.some(m => m.geometry && m.geometry.type === 'PlaneGeometry');
                if (isScreen) { c.position.set(0, 1.175, -.80); c.rotation.set(.07, -.3, 0); c.scale.setScalar(.88); } else c.visible = false;
            }
            hooked = true;
        }

        /* per-frame update: wheel spin + steering, body pitch/roll, brake lights, cabin */
        function update(P, dt) {
            const spin = P.v * dt / WR;
            for (const w of wheels) w.rotation.x -= spin;
            for (const w of front) w.rotation.y = P.steer;
            body.rotation.set(P.pitch, 0, P.roll);
            if (P.br) rear.color.setRGB(1.8, .12, .12); else rear.color.setRGB(.8, .02, .03);
            const inCab = !bm.visible; cab.group.visible = inCab;
            if (inCab) { cab.group.rotation.set(P.pitch || 0, 0, P.roll || 0); if (!hooked) hookGame(); cab.update(P, nightProbe && nightProbe.visible); }
        }
        update({ v: 0, steer: 0, pitch: 0, roll: 0, br: 0 }, 0);

        return { g, body, wheels, rear, update, dims: { length: 2 * L2, width: 1.95, height: 1.63, wheelR: WR, wheelbase: 2 * WZ } };
    }

    window.buildPlayerCar = buildPlayerCar;
})();