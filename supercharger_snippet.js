/* =====================================================================================
   SUPERCHARGER STATIONS  (Tesla V3 look) - a SEPARATE station BESIDE the road, like a petrol pump
   - station = concrete apron on the LEFT of the road with its own entry / exit taper; the road barrier
     (small wall) is removed only in front of the station, so traffic is never blocked
   - a station every SC_MI miles (only the next one exists at a time)
   - turn left off the road into the apron, stop beside a stall (charger on your left), then DRAG the
     charging handle (mouse / finger) onto the glowing charge port at the rear-left of the car.
     Click the plugged handle to unplug.
   - car is held in Park while plugged. Charge power tapers like a real Tesla (250 kW peak).
   - UI card sits on the left above the key help; "next charger in miles" appears only at 30 % battery or less
   ===================================================================================== */
const SC_MI = 5, SC_FIRST = 1, SC_V4 = false, SC_KW = 250, SC_X = 30;   /* miles between stations | first station (mi) | V4 look | peak kW | charge time-lapse */
const SC_M = 1609.344, SC_X0 = -22.3, SC_CX = SC_X0 + 3.57, SC_N = 28, SC_L = 5, SC_SEG = SC_L / (SC_N - 1), SC_BEND = SC_SEG * 1.88, SC_REACH = 4.4, HEND = .38, SC_Z = [-9, -3, 3, 9];
const SC_GAPH = 44, SC_OUT = 14.5, SC_TAPER = .5;   /* half length of the opening in the wall | how far left the apron reaches | entry/exit slope */
const SW = SC_V4 ? .74 : .62, SH = SC_V4 ? 2.55 : 2.3, SD = SC_V4 ? .36 : .44, FR = SD / 2 + .02;
const scM = {
    white: new THREE.MeshPhysicalMaterial({ color: 0xf2f3f5, roughness: .3, metalness: .05, clearcoat: 1, clearcoatRoughness: .12 }),
    red: new THREE.MeshStandardMaterial({ color: 0xb5121b, roughness: .45, emissive: 0x240000 }), slot: new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: .6 }),
    blk: new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: .35, metalness: .3 }), chrome: new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: .25, metalness: .9 }),
    cable: new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: .55, side: THREE.DoubleSide }),
    pad: new THREE.MeshStandardMaterial({ color: 0xcfd2d7, roughness: .95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
};
const scTex = (w, h, f) => { const k = document.createElement('canvas'); k.width = w; k.height = h; f(k.getContext('2d'), w, h); const t = new THREE.CanvasTexture(k); t.anisotropy = 4; return t };
const scLogo = (x, cx, cy, s, col) => { x.save(); x.translate(cx - 64 * s, cy - 64 * s); x.scale(s, s); x.fillStyle = col; x.beginPath(); x.moveTo(18, 48); x.quadraticCurveTo(64, 20, 110, 48); x.lineTo(103, 60); x.quadraticCurveTo(64, 40, 25, 60); x.closePath(); x.fill(); x.beginPath(); x.moveTo(57, 50); x.lineTo(71, 50); x.lineTo(68, 108); x.lineTo(60, 108); x.closePath(); x.fill(); x.restore() };
const scWord = (x, str, cx, y, gap, font, col) => { x.font = font; x.fillStyle = col; x.textAlign = 'center'; x.textBaseline = 'middle'; const n = str.length, x0 = cx - gap * (n - 1) / 2; for (let i = 0; i < n; i++)x.fillText(str[i], x0 + i * gap, y) };
const scTxTesla = scTex(256, 48, (x, w, h) => scWord(x, 'TESLA', w / 2, h / 2, 46, '700 30px Arial, sans-serif', '#e31b23'));
const scTxSign = scTex(256, 1024, (x, w, h) => {
    x.fillStyle = '#f5f6f8'; x.fillRect(0, 0, w, h); x.fillStyle = '#e31b23'; x.fillRect(0, 0, w, 26); x.fillRect(0, h - 26, w, 26);
    scLogo(x, 128, 170, 1.5, '#e31b23'); scWord(x, 'TESLA', 128, 330, 46, '700 40px Arial, sans-serif', '#e31b23');
    x.textAlign = 'center'; x.fillStyle = '#2a2c31'; x.font = '600 25px Arial, sans-serif'; x.fillText('SUPERCHARGER', 128, 410);
    x.font = '500 20px Arial, sans-serif'; x.fillStyle = '#6b6f77'; x.fillText(SC_V4 ? 'V4 · up to 500 kW' : 'V3 · up to 250 kW', 128, 450); x.fillText('Open 24/7', 128, 480)
});
const scTxBay = scTex(128, 512, (x, w, h) => {
    x.fillStyle = 'rgba(62,130,255,.16)'; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 5; x.strokeRect(5, 5, w - 10, h - 10);
    x.lineWidth = 4; x.strokeStyle = 'rgba(62,130,255,.55)'; for (let y = 40; y < h - 30; y += 46) { x.beginPath(); x.moveTo(14, y + 20); x.lineTo(w / 2, y); x.lineTo(w - 14, y + 20); x.stroke() }
});
function scRR(w, h, rt, rb) { const s = new THREE.Shape(), a = w / 2; s.moveTo(-a + rb, 0); s.lineTo(a - rb, 0); s.quadraticCurveTo(a, 0, a, rb); s.lineTo(a, h - rt); s.quadraticCurveTo(a, h, a - rt, h); s.lineTo(-a + rt, h); s.quadraticCurveTo(-a, h, -a, h - rt); s.lineTo(-a, rb); s.quadraticCurveTo(-a, 0, -a + rb, 0); return s }
const scBodyG = (() => { const g = new THREE.ExtrudeGeometry(scRR(SW, SH, SC_V4 ? .12 : .3, .03), { depth: SD, bevelEnabled: true, bevelSize: .02, bevelThickness: .02, bevelSegments: 3, curveSegments: 14 }); g.translate(0, 0, -SD / 2); g.rotateY(Math.PI / 2); return g })();
const scSlot = (w, h, cy, mat, dx) => { const g = new THREE.ShapeGeometry(scRR(w, h, w / 2, w / 2), 16); g.translate(0, cy - h / 2, 0); g.rotateY(Math.PI / 2); const m = new THREE.Mesh(g, mat); m.position.x = FR + dx; return m };
function scHandle() {   /* origin = nozzle tip, handle body + cable extend along local +Z */
    const g = new THREE.Group(), add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o };
    add(new THREE.CylinderGeometry(.024, .026, .07, 14).rotateX(Math.PI / 2), scM.chrome, 0, 0, .035); add(new THREE.CylinderGeometry(.036, .036, .03, 16).rotateX(Math.PI / 2), scM.blk, 0, 0, .085);
    add(new THREE.BoxGeometry(.075, .085, .2), scM.blk, 0, 0, .2); add(new THREE.BoxGeometry(.05, .016, .08), scM.chrome, 0, .047, .16); add(new THREE.CylinderGeometry(.03, .036, .08, 12).rotateX(Math.PI / 2), scM.blk, 0, 0, .34);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(.24, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); hit.position.z = .18; g.add(hit); return { g, hit }
}
const scSpr = (col, sc) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: gtx, color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })); s.scale.set(sc, sc, 1); s.renderOrder = 6; s.visible = false; return s };
function scCableMesh() {
    const pos = new Float32Array(SC_N * 8 * 3), idx = [];
    for (let i = 0; i < SC_N - 1; i++)for (let j = 0; j < 8; j++) { const a = i * 8 + j, b = i * 8 + (j + 1) % 8, c = (i + 1) * 8 + j, d = (i + 1) * 8 + (j + 1) % 8; idx.push(a, c, b, b, c, d) }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); const m = new THREE.Mesh(g, scM.cable); m.frustumCulled = false; m.castShadow = true; return m
}
const ZN = new V3(0, 0, -1), DOCKDIR = new V3(.5, -.87, 0).normalize(), scT = new V3(), scU = new V3(), scNn = new V3(), scBb = new V3(), scV1 = new V3(), scV2 = new V3(), scG = new V3(), scD = new V3();
const pW = new V3(), nW = new V3(), portL = new V3(), nL = new V3(), SC_PN = new V3(-.7, 0, .71).normalize();

/* ---- station group (origin x = SC_X0, z = station centre) ---- */
const ST = { g: new THREE.Group(), n: -1, z: 0, stalls: [], hits: [], act: null, plug: null, off: new V3(), tgt: new V3(), added: 0, kw: 0, full: false, hum: 0, lock: null, hov: false, nt: null };
ST.g.position.x = SC_X0; scene.add(ST.g);
{
    /* concrete apron: widest in the middle, tapering back to the road at both ends (entry / exit driveway) */
    const ap = new THREE.Shape(), xe = -(10 + SC_OUT + 1.5) - SC_X0, dz = SC_GAPH - SC_OUT / SC_TAPER, xr = -12.2 - SC_X0;
    ap.moveTo(xr, -SC_GAPH); ap.lineTo(xe, -dz); ap.lineTo(xe, dz); ap.lineTo(xr, SC_GAPH); ap.closePath();
    const pad = new THREE.Mesh(new THREE.ShapeGeometry(ap).rotateX(-Math.PI / 2), scM.pad); pad.position.y = .014; pad.receiveShadow = true; ST.g.add(pad);
    const bay = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 32), new THREE.MeshBasicMaterial({ map: scTxBay, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); bay.rotation.x = -Math.PI / 2; bay.position.set(SC_CX - SC_X0, .02, 0); bay.renderOrder = 1; ST.g.add(bay);
    ST.pool = new THREE.Mesh(new THREE.PlaneGeometry(16, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: gtx, color: 0xbfd4ff, transparent: true, opacity: .45, blending: THREE.AdditiveBlending, depthWrite: false })); ST.pool.position.set(2, .08, 2); ST.pool.visible = false; ST.pool.renderOrder = 1; ST.g.add(ST.pool);
    ST.sm = new THREE.MeshBasicMaterial({ map: scTxSign }); const pm = new THREE.MeshStandardMaterial({ color: 0xe9eaed, roughness: .4 });
    const pyl = new THREE.Mesh(new THREE.BoxGeometry(1.5, 6, .3), [pm, pm, pm, pm, ST.sm, ST.sm]); pyl.position.set(4.3, 3, 36); pyl.castShadow = true; ST.g.add(pyl); glow(0xff5a5a, 7, 7, 4.3, 5.2, 36.3, ST.g);
}
SC_Z.forEach((z, i) => {
    const g = new THREE.Group(); g.position.z = z; ST.g.add(g);
    const body = new THREE.Mesh(scBodyG, scM.white); body.castShadow = true; g.add(body);
    if (SC_V4) { const bs = new THREE.Mesh(new THREE.BoxGeometry(SD + .06, .22, SW + .06), scM.blk); bs.position.y = .11; g.add(bs) } else g.add(scSlot(.44, 1.14, 1.4, scM.red, .002), scSlot(.35, 1.05, 1.4, scM.slot, .004));
    const tx = new THREE.Mesh(new THREE.PlaneGeometry(.5, .094).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ map: scTxTesla, transparent: true })); tx.position.set(FR + .003, SH - .2, 0); g.add(tx);
    const led = new THREE.MeshBasicMaterial({ color: 0xdfe6ee }), lm = new THREE.Mesh(new THREE.BoxGeometry(.012, .03, SW * .5), led); lm.position.set(FR + .004, SC_V4 ? .5 : .7, 0); g.add(lm);
    const hd = scHandle(); ST.g.add(hd.g); const spr = scSpr(0x3ddc84, .7); spr.position.z = .2; hd.g.add(spr);
    const s = { i, z, A: SC_V4 ? new V3(0, 2.0, z + SW / 2 + .06) : new V3(FR + .03, .86, z), D: SC_V4 ? new V3(FR + .1, 1.5, z + .22) : new V3(FR + .08, 1.5, z), tip: new V3(), end: new V3(), q2: new THREE.Quaternion(), h: hd.g, spr, led, state: 'dock', p: [], q: [], cable: scCableMesh() };
    hd.hit.userData.s = s; ST.hits.push(hd.hit); ST.g.add(s.cable); ST.stalls.push(s);
    s.tip.copy(s.D); s.h.quaternion.setFromUnitVectors(ZN, DOCKDIR); s.h.position.copy(s.tip); s.end.set(0, 0, HEND).applyQuaternion(s.h.quaternion).add(s.tip);
    for (let k = 0; k < SC_N; k++) { const t = k / (SC_N - 1), v = new V3().lerpVectors(s.A, s.end, t), w = Math.sin(t * Math.PI); v.y -= w * .5; v.x += w * .5; s.p.push(v); s.q.push(v.clone()) }
    for (let k = 0; k < 160; k++)scRope(s, 1 / 60); scFill(s)
});

/* ---- charge port on the car (rear-left, in the tail light) ---- */
const scPort = new THREE.Object3D(); scPort.position.set(-.74, .88, 2.25); pc.body.add(scPort);
{ const pt = new THREE.Mesh(new THREE.CircleGeometry(.055, 20), new THREE.MeshBasicMaterial({ color: 0x050506, side: THREE.DoubleSide })); pt.quaternion.setFromUnitVectors(new V3(0, 0, 1), SC_PN); pt.position.copy(SC_PN).multiplyScalar(.012); scPort.add(pt) }
const scPS = scSpr(0x3e82ff, .8); scPort.add(scPS);

/* ---- road wall: the left wall is replaced by two pieces with a gap in front of the station ---- */
barL.visible = false;
const scBarA = new THREE.Mesh(bg, barM), scBarB = new THREE.Mesh(bg, barM);
[scBarA, scBarB].forEach(b => { b.position.x = -11.75; b.castShadow = b.receiveShadow = true; scene.add(b) });
function scBar(m, z0, z1) { if (z1 - z0 < .5) { m.visible = false; return } m.visible = true; m.position.z = (z0 + z1) / 2; m.scale.z = (z1 - z0) / 600 }
function scWalls() { const a = P.z - 300, b = P.z + 300; scBar(scBarA, a, Math.min(b, ST.z - SC_GAPH)); scBar(scBarB, Math.max(a, ST.z + SC_GAPH), b) }

/* how far left the player may drive at this z (opens up in front of the station, used by stepPlayer in Game.html) */
function scLimL(z) { const d = Math.abs(z - ST.z); return d >= SC_GAPH ? 10 : 10 + Math.min(SC_OUT, (SC_GAPH - d) * SC_TAPER) }

/* ---- cable: verlet rope (station space) + tube mesh ---- */
function scColl(a, b) {
    if (a.y < .04) { a.y = .04; b.x += (a.x - b.x) * .25; b.z += (a.z - b.z) * .25 }
    if (a.x < FR + .03 && a.y < SH) for (const z of SC_Z) if (Math.abs(a.z - z) < SW / 2 + .04) { a.x = FR + .03; break }
    const cx = P.x - SC_X0, cz = P.z - ST.z;
    if (a.y > .12 && a.y < 1.15 && Math.abs(a.x - cx) < .97 && Math.abs(a.z - cz) < 1.9) a.x = a.x < cx ? cx - 1 : cx + 1
}
function scRope(s, dt) {
    const p = s.p, q = s.q, n = SC_N, g = dt * dt * 9;
    for (let i = 1; i < n - 1; i++) { const a = p[i], b = q[i]; scT.copy(a).sub(b).multiplyScalar(.97); b.copy(a); a.add(scT); a.y -= g }
    for (let it = 0; it < 12; it++) {
        p[0].copy(s.A); p[n - 1].copy(s.end);
        for (let i = 0; i < n - 1; i++) {
            const a = p[i], b = p[i + 1]; scT.copy(b).sub(a); const d = scT.length() || 1e-6, f = (d - SC_SEG) / d;
            if (i === 0) b.addScaledVector(scT, -f); else if (i === n - 2) a.addScaledVector(scT, f); else { a.addScaledVector(scT, f * .5); b.addScaledVector(scT, -f * .5) }
        }
        for (let i = 0; i < n - 2; i++) { const a = p[i], b = p[i + 2]; scT.copy(b).sub(a); const d = scT.length(); if (d < SC_BEND && d > 1e-6) { scT.multiplyScalar((SC_BEND - d) / d * .25); if (i > 0) a.sub(scT); if (i + 2 < n - 1) b.add(scT) } }
        for (let i = 1; i < n - 1; i++)scColl(p[i], q[i])
    }
    p[0].copy(s.A); p[n - 1].copy(s.end)
}
function scFill(s) {
    const p = s.p, pos = s.cable.geometry.attributes.position, arr = pos.array, n = SC_N;
    for (let i = 0; i < n; i++) {
        scU.copy(p[Math.min(i + 1, n - 1)]).sub(p[Math.max(i - 1, 0)]); if (scU.lengthSq() < 1e-10) scU.set(0, 1, 0); scU.normalize();
        if (i === 0) { scNn.set(0, 1, 0); if (Math.abs(scU.y) > .9) scNn.set(1, 0, 0) }
        scNn.addScaledVector(scU, -scNn.dot(scU)).normalize(); scBb.crossVectors(scU, scNn);
        for (let j = 0; j < 8; j++) { const a = j * .7854, c = Math.cos(a) * .028, d = Math.sin(a) * .028, o = (i * 8 + j) * 3; arr[o] = p[i].x + scNn.x * c + scBb.x * d; arr[o + 1] = p[i].y + scNn.y * c + scBb.y * d; arr[o + 2] = p[i].z + scNn.z * c + scBb.z * d }
    }
    pos.needsUpdate = true; s.cable.geometry.computeVertexNormals()
}

/* ---- station placement: only the NEAREST station exists (so you can turn round and drive back to one you passed) ---- */
const scIdx = () => Math.max(0, Math.round(((-P.z) / SC_M - SC_FIRST) / SC_MI));
function scPlace(n) { ST.n = n; ST.z = -(SC_FIRST + n * SC_MI) * SC_M; ST.g.position.set(SC_X0, 0, ST.z); for (const s of ST.stalls) s.state = 'dock'; ST.added = 0; ST.full = false }
scPlace(scIdx()); scWalls();

/* ---- mouse / touch: drag the handle to the port ---- */
const scRay = new THREE.Raycaster(), scN = new THREE.Vector2(), scPl = new THREE.Plane();
function scAim(e) { const r = cv.getBoundingClientRect(); scN.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); scRay.setFromCamera(scN, cam) }
function scPick(e) { if (!ST.g.visible || camMode === 3 || ST.act) return null; scAim(e); const h = scRay.intersectObjects(ST.hits, false)[0]; if (!h) return null; const s = h.object.userData.s; return (s.state === 'dock' && !ST.plug) || s.state === 'plug' ? s : null }
function scSetTgt(w) { const t = ST.tgt, s = ST.act; t.set(w.x - SC_X0, w.y, w.z - ST.z); scT.copy(t).sub(s.A); if (scT.length() > SC_REACH) t.copy(s.A).addScaledVector(scT.normalize(), SC_REACH); t.y = Math.max(t.y, .15); t.x = Math.max(t.x, FR + .12) }
function scNear(s) {
    if (Math.abs(P.v) > 1 || portL.distanceTo(s.A) > SC_REACH) return false;
    scV1.set(s.tip.x + SC_X0, s.tip.y, s.tip.z + ST.z); if (scV1.distanceTo(pW) < .6) return true;
    scV1.project(cam); scV2.copy(pW).project(cam); return scV1.z < 1 && scV2.z < 1 && Math.hypot((scV1.x - scV2.x) * innerWidth / 2, (scV1.y - scV2.y) * innerHeight / 2) < 45
}
function scPlug(s) { s.state = 'plug'; ST.plug = s; ST.act = null; ST.lock = { x: P.x, z: P.z, psi: P.psi }; ST.added = 0; ST.full = false; ST.kw = 0; if (AUTO.on) setAuto(false); P.v = 0; sfx.click(); tone(180, .12, 'square', .07, 120); sfx.ping(); cv.style.cursor = 'default' }
addEventListener('pointerdown', e => {
    if (e.target !== cv) return; const s = scPick(e); if (!s) return; e.stopPropagation(); e.preventDefault();
    if (s.state === 'plug') { ST.plug = null; tone(150, .12, 'square', .06, 220) } else sfx.click();
    s.state = 'hold'; ST.act = s; cv.style.cursor = 'grabbing'; ST.hov = false;
    scD.set(s.tip.x + SC_X0, s.tip.y, s.tip.z + ST.z); cam.getWorldDirection(scG); scPl.setFromNormalAndCoplanarPoint(scG, scD);
    scAim(e); if (scRay.ray.intersectPlane(scPl, scG)) ST.off.copy(scD).sub(scG); else ST.off.set(0, 0, 0); ST.tgt.copy(s.tip)
}, true);
addEventListener('pointermove', e => {
    const s = ST.act;
    if (s && s.state === 'hold') { scAim(e); if (scRay.ray.intersectPlane(scPl, scG)) scSetTgt(scG.add(ST.off)); return }
    if (e.target !== cv) return; const h = scPick(e);
    if (h && !ST.hov) { ST.hov = true; cv.style.cursor = 'grab' } else if (!h && ST.hov) { ST.hov = false; cv.style.cursor = camMode === 4 ? 'grab' : 'default' }
}, true);
const scUp = () => { const s = ST.act; if (!s || s.state !== 'hold') return; cv.style.cursor = camMode === 4 ? 'grab' : 'default'; if (scNear(s)) scPlug(s); else { s.state = 'ret'; sfx.click() } };
addEventListener('pointerup', scUp, true); addEventListener('pointercancel', scUp, true);

/* ---- HUD card (left side, above the key help) - same look as the game HUD ---- */
{
    const st = document.createElement('style');
    st.textContent = '#scHud{position:fixed;z-index:5;left:22px;bottom:150px;width:236px;box-sizing:border-box;padding:12px 15px 13px;border-radius:18px;background:var(--pill);border:1px solid rgba(128,128,128,.3);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);pointer-events:none;color:var(--fg);opacity:0;transform:translateY(8px);transition:opacity .25s,transform .25s}' +
        '#scHud.on{opacity:1;transform:none}' +
        '#scHud .sh{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600}' +
        '#scHud .si{width:22px;height:22px;border-radius:50%;background:var(--blue);display:flex;align-items:center;justify-content:center;flex:none}' +
        '#scHud .si svg{width:10px;height:13px;fill:#fff}' +
        '#scHud .sd{margin-left:auto;color:var(--mut);font-weight:500;font-size:12px;font-variant-numeric:tabular-nums}' +
        '#scHud .sb{font-size:44px;font-weight:300;line-height:1;margin-top:12px;font-variant-numeric:tabular-nums;white-space:nowrap}' +
        '#scHud .sb small{font-size:13px;letter-spacing:.2em;color:var(--mut);margin-left:8px;font-weight:500}#scHud .sb small:empty{display:none}' +
        '#scHud .ss{margin-top:7px;font-size:12px;font-weight:500;color:var(--mut);line-height:1.35}' +
        '#scHud .sp{height:4px;border-radius:2px;margin-top:11px;background:rgba(128,128,128,.3);overflow:hidden}' +
        '#scHud .sp u{display:block;height:100%;border-radius:2px;background:linear-gradient(100deg,#1f6bff 0%,#62adff 35%,#1f6bff 70%);background-size:200% 100%;animation:chgflow 1.1s linear infinite;box-shadow:0 0 8px rgba(62,130,255,.6)}' +
        '#scHud.full .sp u{animation:none;background:#34c759;box-shadow:none}' +
        '#scHud .sr{display:flex;justify-content:space-between;margin-top:7px;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums}' +
        '#scHud.chg .sb{color:#3e82ff}#scHud.full .sb{color:#34c759}#scHud.low .sb{color:#e5484d}';
    document.head.appendChild(st)
}
const scEl = document.createElement('div'); scEl.id = 'scHud';
scEl.innerHTML = '<div class="sh"><span class="si"><svg viewBox="0 0 24 32"><path d="M14 0 2 18h8l-2 14 14-20h-9z"/></svg></span>Supercharger<span class="sd" id="scR"></span></div>' +
    '<div class="sb"><span id="scB"></span><small id="scU"></small></div><div class="ss" id="scS"></div>' +
    '<div class="sp" id="scP"><u id="scPu"></u></div><div class="sr" id="scRw"><span id="scX"></span><span id="scY"></span></div>';
document.body.appendChild(scEl);
const scH = {}; for (const k of ['R', 'B', 'U', 'S', 'P', 'Pu', 'Rw', 'X', 'Y']) scH[k] = $('sc' + k);
const scSet = (e, v) => { if (e._v !== v) { e._v = v; e.textContent = v } };
let scLast = '';
$('help').insertAdjacentHTML('beforeend', '<br><b>Supercharger</b> (left): pull in off the road, stop, drag the handle to the glowing port');
const scPos = () => { scEl.style.bottom = (($('help').offsetHeight || 0) + 30) + 'px' }; scPos(); addEventListener('resize', scPos);
function scHud(dz, inBay, zone) {
    const mi = Math.abs(dz) / SC_M, held = !!ST.act && ST.act.state === 'hold', low = P.pct <= 30, fwd = Math.cos(P.psi) >= 0, ahead = fwd ? dz > 0 : dz < 0;
    let cls = '', big = '', unit = '', sub = '', right = '', bar = -1, r1 = '', r2 = '';
    if (ST.plug) {
        cls = ST.full ? 'on full' : 'on chg'; big = ST.full ? 'Charged' : String(Math.round(ST.kw)); unit = ST.full ? '' : 'kW'; right = ST.full ? 'Complete' : 'Charging';
        sub = 'Click the handle to unplug'; bar = P.pct; r1 = '+' + ST.added.toFixed(1) + ' kWh'; r2 = Math.round(P.pct) + '% · ' + Math.round(P.rng) + ' mi'
    } else if (held) { cls = 'on'; big = 'Plug in'; right = 'Handle'; sub = 'Release it over the glowing port' }
    else if (inBay) { const mv = Math.abs(P.v) > 1, wrong = Math.cos(P.psi) < .5; cls = 'on'; big = wrong ? 'Turn' : mv ? 'Stop' : P.pct > 99.5 ? 'Full' : 'Ready'; right = 'At stall'; sub = wrong ? 'Face along the road, charger on your left' : mv ? 'Stop beside a stall' : P.pct > 99.5 ? 'Battery is full' : 'Drag a handle to the glowing port' }
    else if (zone) { cls = 'on'; big = 'Pull in'; right = 'Station'; sub = 'Park beside a stall, charger on your left' }
    else if (low || mi < 1.2) {   /* card now also shows when a station is within ~1.2 mi, whatever your battery or lane */
        cls = P.pct < 20 ? 'on low' : 'on'; big = mi < 10 ? mi.toFixed(1) : String(Math.round(mi)); unit = 'MI'; right = low ? Math.round(P.pct) + '% battery' : (ahead ? 'Ahead' : 'Behind');
        const side = fwd ? 'left' : 'right';
        sub = !ahead ? 'Behind you · turn around' : mi < .35 ? 'Turn ' + side + ' into the station' : (mi < 1.2 && P.x > -6) ? 'Move to the ' + side + ' side · station on your ' + side : 'Next Supercharger · ' + (fwd ? 'on your left' : 'on your right')
    }
    if (cls !== scLast) { if (cls && !scLast && typeof fxSound === 'function') fxSound('sc'); scLast = cls; scEl.className = cls; scPos() }   /* chime when the card appears */
    if (!cls) return;
    scSet(scH.R, right); scSet(scH.B, big); scSet(scH.U, unit); scSet(scH.S, sub); scSet(scH.X, r1); scSet(scH.Y, r2);
    scH.P.style.display = scH.Rw.style.display = bar >= 0 ? '' : 'none';
    if (bar >= 0) scH.Pu.style.width = Math.max(bar, 3).toFixed(1) + '%'
}

/* ---- per-frame update (called right after stepPlayer in the main loop) ---- */
function updStations(dt) {
    if (!ST.act && !ST.plug) { const n = scIdx(); if (n !== ST.n) scPlace(n) }
    scWalls();
    const dz = P.z - ST.z, vis = Math.abs(dz) < 650; ST.g.visible = vis;
    if (ST.plug) { const L = ST.lock; P.x = L.x; P.z = L.z; P.psi = L.psi; P.v = 0; P.thr = P.brk = 0; P.br = 0; P.gear = 'P'; pg.position.set(P.x, 0, P.z); pg.rotation.y = P.psi }
    const inBay = Math.abs(dz) < 16 && Math.abs(P.x - SC_CX) < 2.4, zone = Math.abs(dz) < SC_GAPH && P.x < -11.9;
    if (ST.plug) {                                                                  /* charging: fast at low %, tapering above 50 % */
        const soc = P.kwh / BAT_KWH;
        if (P.kwh < BAT_KWH - .01) {
            const kw = SC_KW * (soc < .5 ? 1 : Math.max(.12, 1 - (soc - .5) * 1.9)), e = kw * dt / 3600 * SC_X; P.kwh = Math.min(BAT_KWH, P.kwh + e); ST.added += e; ST.kw = kw; P.chg = 1;
            ST.hum -= dt; if (ST.hum <= 0) { ST.hum = 1.3; tone(110 + soc * 90, 1.5, 'sine', .035) }
        } else { ST.kw = 0; if (!ST.full) { ST.full = true; sfx.chime(true) } }
        P.pct = P.kwh / BAT_KWH * 100; P.rng = P.kwh * 1000 / P.wh
    }
    if (vis) {
        if (ST.nt !== night) { ST.nt = night; scM.pad.color.setHex(night ? 0x2c2f35 : 0xcfd2d7); ST.sm.color.setHex(night ? 0xbfc4d0 : 0xffffff); ST.pool.visible = night }
        scPort.updateWorldMatrix(true, false); scPort.getWorldPosition(pW); nW.copy(SC_PN).transformDirection(scPort.matrixWorld);
        portL.set(pW.x - SC_X0, pW.y, pW.z - ST.z); nL.copy(nW);
        const ready = inBay && Math.abs(P.v) < 1 && !ST.act && !ST.plug && P.pct < 99.5, pu = .5 + .4 * Math.sin(time * 6); let near = false;
        for (const s of ST.stalls) {
            let dir;
            if (s.state === 'dock') { s.tip.copy(s.D); dir = DOCKDIR }
            else if (s.state === 'ret') { s.tip.lerp(s.D, 1 - Math.exp(-14 * dt)); dir = DOCKDIR; if (s.tip.distanceTo(s.D) < .04) { s.state = 'dock'; if (ST.act === s) ST.act = null } }
            else if (s.state === 'hold') { s.tip.lerp(ST.tgt, 1 - Math.exp(-22 * dt)); near = scNear(s); dir = near ? scT.copy(nL).negate() : scT.copy(s.tip).sub(s.A).normalize() }
            else { s.tip.lerp(portL, 1 - Math.exp(-24 * dt)); dir = scT.copy(nL).negate() }
            s.q2.setFromUnitVectors(ZN, dir); s.h.quaternion.slerp(s.q2, 1 - Math.exp(-12 * dt)); s.h.position.copy(s.tip); s.end.set(0, 0, HEND).applyQuaternion(s.h.quaternion).add(s.tip);
            scRope(s, dt); scFill(s);
            s.led.color.setHex(s === ST.plug ? (ST.full ? 0x34c759 : 0x3e82ff) : 0xdfe6ee); s.spr.visible = ready && s.state === 'dock'; s.spr.material.opacity = pu
        }
        scPS.visible = !!ST.act && ST.act.state === 'hold'; scPS.material.opacity = near ? 1 : pu; scPS.scale.setScalar(near ? 1.1 : .8)
    }
    scHud(dz, inBay, zone)
}

/* ---- hook into the game loop (so Game.html needs no other edit besides the two small ones in the notes) ---- */
{ const sp0 = stepPlayer; stepPlayer = function (dt) { sp0(dt); updStations(dt) } }