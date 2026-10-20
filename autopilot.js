/* autopilot.js - high-speed Auto Drive (replaces the original autoDrive). Load it LAST in Game.html:
   <script src="autopilot.js"></script>
   - No 45 mph limit: cruises at a SET speed (default 180 mph). Press ] / [ to raise / lower it by 10 mph (50-220).
   - Looks 330 m ahead in all 6 lanes, picks the lane where it can go fastest and changes lanes early.
   - Never goes faster than it can still stop / match the car ahead:  v <= vLead + sqrt(2*b*(gap - margin)).
   - Uses boost power automatically above ~85 mph (locked at 10% battery or below, like manual boost).
   - Driver takes over with S / Space / A / D, W = temporary full throttle, F = off.

   CHARGER RUN ("Auto Drive to nearest Supercharger" button in the 10% battery popup -> apGoCharge()):
   - Goes to the NEAREST station, ahead OR BEHIND (the same station the Supercharger card shows).
   - Station ahead : merges left early at traffic speed (no crawling, so cars behind are not a problem), slows,
                     enters through the wall opening, parks at a stall, switches off.
   - Station behind: moves to a lane where a U-turn fits, brakes hard, U-turns, drives back against the traffic
                     (it scans the oncoming cars and picks the free lane), does a second U-turn on the station apron,
                     and parks facing the right way. Traffic gets V2V-style "right of way" only from the cars' own AI,
                     so it never waits for a gap: it merges / turns assertively.
   - The text pill always says the same thing while the run is active:  "Auto Drive -> Supercharger . x.x mi"
     (+ "turning around" in a turn, "Entering the Supercharger..." at the station). */
(() => {
    const MPS = 1 / 2.23694, PI = Math.PI;
    const AP = window.AP = {   /* AGGRESSIVE defaults. To calm it down: lower mph, lower b, raise margin / tg / tb / hy / pen / cdn */
        mph: 180,      /* set speed */
        b: 8.5,        /* planning brake m/s2 (how late it brakes) */
        margin: 12,    /* min gap to the car ahead (m) */
        kv: 2.2,       /* steering gain */
        tg: 1.1, tb: 1.2, /* merge time-gap ahead / behind (s): smaller = squeezes into tighter gaps */
        hy: 1.5,       /* lane-change hysteresis (m/s): smaller = changes lanes more eagerly */
        pen: 1.2,      /* penalty per lane of distance (m/s) */
        cdn: .7,       /* cooldown between lane changes (s) */
        acc: 1.3,      /* acceleration gain */
        seek: true,    /* allow the charger-seeking mode (started only from the 10% popup button) */
        seekOn: false, /* true while the driver has asked Auto Drive to take them to a charger */
        seekMph: 112,  /* charger run: top speed (mph). Boost is locked under 10%, so ~112-119 mph is the most the car can do */
        seekB: 7,      /* charger run: braking m/s2 used for the approach profile (higher = brakes later) */
        seekBoost: false, /* true = boost is allowed on the charger run even under 10% (also needs the 1-line Game.html edit) */
        seekLeft: 900, /* charger run: start moving to the left lane this many metres before the station */
        seekTg: .5, seekTb: .45, /* charger run: merge time-gaps (s). Small = merges into tight gaps instead of waiting */
        funnel: 14,    /* charger run: speed (m/s) through the station entrance */
        uMph: 16,      /* U-turn speed (mph). Lower = tighter circle (about 13 m across at 16 mph) */
        backMph: 100,  /* top speed while driving back against the traffic */
        headOn: 18,    /* min gap (m) to an oncoming car */
        engage: false  /* true = also start the charger run by itself when the battery hits 10% */
    };
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    const limL = () => typeof scLimL === 'function' ? scLimL(P.z) : 10;
    const Rt = v => (typeof WB === 'number' ? WB : 2.9) / Math.tan(.5 / (1 + Math.pow(v / 15, 2)));   /* rear-axle radius at full lock (matches stepPlayer) */
    let planT = 0, scs = [], parkedAt = -1e9;
    /* charger-run state: ph = run (normal) | prep (get into a lane where a U-turn fits, brake) | turn (U-turn in progress) */
    const S = AP.state = { ph: 'run', dir: 0, turned: 0, lastPsi: 0, t0: 0, stuckT: 0, lost: 0 };

    /* energy estimate: kWh per metre measured over the last stretch -> slow down when the battery would not last to the station */
    let eK = P.kwh, eZ = P.z, epm = 0;
    function eco(vT, dist) {
        const dz = Math.abs(P.z - eZ);
        if (dz > 80) { const dE = eK - P.kwh; if (dE > 0) epm = epm ? epm * .6 + dE / dz * .4 : dE / dz; eK = P.kwh; eZ = P.z }
        if (!epm) return vT;
        const f = P.kwh / (epm * dist * 1.12);
        return f >= 1 ? vT : Math.max(Math.min(vT, 17), vT * Math.sqrt(Math.max(f, .15)))
    }

    /* nearest car ahead (along our heading h: +1 = driving -Z, -1 = driving +Z against the traffic) in lane l */
    function scan(l, h) {
        const tx = LX(l); let gap = 1e9, vl = 0, car = null;
        for (const o of traffic) {
            const dz = h * (P.z - o.z); if (dz <= 0) continue;
            if (!(Math.abs(o.x - tx) < 2.5 || (o.lc && Math.abs(LX(o.tl) - tx) < 2.5))) continue;
            const g = dz - 4.7; if (g < gap) { gap = g; vl = h * o.v; car = o }   /* vl = its speed along OUR heading (negative = coming at us) */
        }
        return { gap, v: vl, car }
    }
    /* fastest speed from which we can still stop / match the car ahead in the gap that is left */
    function safeSpeed(sc, vSet) {
        if (!sc.car) return vSet;
        const g = sc.gap - (sc.v < 0 ? AP.headOn : AP.margin);
        if (g <= 0) return Math.max(0, sc.v + g * .6);
        return Math.min(vSet, sc.v >= 0 ? sc.v + Math.sqrt(2 * AP.b * g) : Math.max(0, Math.sqrt(sc.v * sc.v + 2 * AP.b * g) + sc.v))
    }
    const leadCap = vSet => scs.length ? Math.min(safeSpeed(scs[laneOf(P.x)], vSet), safeSpeed(scs[AUTO.lane], vSet)) : vSet;
    /* is it safe to move into lane l now? (time-gap based, scales with closing speed) */
    function mergeSafe(l, h, tg, tb) {
        const tx = LX(l), v = Math.max(P.v, 0);
        for (const o of traffic) {
            if (!(Math.abs(o.x - tx) < 2.7 || (o.lc && Math.abs(LX(o.tl) - tx) < 2.7))) continue;
            const dz = h * (P.z - o.z), ov = h * o.v;   /* dz > 0: o is ahead of us */
            if (dz >= 0 ? dz < 14 + Math.max(0, v - ov) * tg : -dz < 12 + Math.max(0, ov - v) * tb) return false
        }
        return true
    }

    /* ---------- Supercharger seeking: always the station the game currently shows (= the nearest one, ahead or behind) ---------- */
    function seekState() {
        if (!AP.seek || !AP.seekOn || P.kwh <= .05 || typeof ST === 'undefined' || typeof SC_M === 'undefined') return null;
        const n = ST.n >= 0 ? ST.n : Math.max(0, Math.round((-P.z / SC_M - SC_FIRST) / SC_MI));
        const ZS = -(SC_FIRST + n * SC_MI) * SC_M, d = P.z - ZS;                        /* d > 0: station is ahead of a car that drives -Z */
        const po = (typeof pW !== 'undefined' && Math.abs(d) < 650 && Math.cos(P.psi) > .5) ? clamp(pW.z - P.z, -3, 3) : 2.25;   /* where the charge port sits along the car */
        const zStop = ZS + 3 - po;                                                           /* park with the port at a stall */
        return { n, ZS, d, zStop, r: P.z - zStop }
    }
    /* called by the popup button: start / cancel "Auto Drive to the nearest Supercharger" */
    window.apGoCharge = () => {
        if (AP.seekOn && AUTO.on) { AP.seekOn = false; setAuto(false); return }
        if (P.kwh <= .05) return;
        S.ph = 'run'; S.stuckT = S.lost = 0; planT = 0;
        AP.seekOn = true; if (!AUTO.on) setAuto(true);
        AUTO.lane = laneOf(P.x); AUTO.xs = P.x; AUTO.cd = time      /* no start-up cooldown: begin moving at once */
    };

    /* ---------- lane planning (every .06 s) ----------
       force >= 0: go to that lane one safe step at a time (soft = but pick the best lane instead if the forced lane is blocked) */
    function planLane(dt, h, vSet, force, tg, tb, soft) {
        planT -= dt; if (planT > 0) return; planT = .06;
        scs = []; for (let l = 0; l < 6; l++) scs.push(scan(l, h));
        const cur = AUTO.lane, v = Math.max(P.v, 0);
        if (Math.abs(P.x - LX(cur)) >= 1.8 || time <= AUTO.cd) return;
        const sc = l => safeSpeed(scs[l], vSet) - AP.pen * Math.abs(l - cur);
        if (force >= 0 && !(soft && safeSpeed(scs[cur], vSet) < 10 && Math.max(...[0, 1, 2, 3, 4, 5].map(sc)) > sc(cur) + 6)) {
            if (cur !== force) { const nx = cur + Math.sign(force - cur); if (mergeSafe(nx, h, tg, tb)) { AUTO.lane = nx; AUTO.cd = time + AP.cdn } else AUTO.cd = time + .1 }
            return
        }
        const here = scs[cur]; let best = cur; for (let l = 0; l < 6; l++) if (sc(l) > sc(best)) best = l;
        const closing = here.car ? (v - here.v) : 0, ttc = here.car && closing > 1 ? here.gap / closing : 99;
        if (best !== cur && sc(best) > sc(cur) + (ttc < 5 ? .5 : AP.hy)) {
            const nx = cur + Math.sign(best - cur);
            if (mergeSafe(nx, h, tg, tb)) { AUTO.lane = nx; AUTO.cd = time + AP.cdn } else AUTO.cd = time + .1
        } else AUTO.cd = time + .05
    }
    /* steering: smooth lateral target + heading control (works driving either way) */
    function steerLane(dt, h, v, tx) {
        const rate = Math.min(4.6, 2.5 + v * .03);
        AUTO.xs += clamp(tx - AUTO.xs, -rate * dt, rate * dt);
        const e = AUTO.xs - P.x, kv = Math.min(AP.kv, .6 + v * .03), lm = .1 + .25 * Math.max(0, 1 - v / 8), d = clamp(e * kv / Math.max(v, 6), -lm, lm);
        AUTO.steer = clamp(wrap((h > 0 ? -d : PI + d) - P.psi) * 4.5, -1, 1)
    }
    /* throttle / brake / boost for a wanted speed vT */
    function applySpeed(vT, v, sk) {
        const drag = .15 + .0006 * v * v, aNet = (vT - v) * (vT > v ? AP.acc : 2.2);
        AUTO.boost = vT - v > (AUTO.boost ? 1 : 2) && v > 36 && (P.pct > 10 || (sk && AP.seekBoost));
        const cap = AUTO.boost ? 18 * Math.min(1, 45 / Math.max(v, .1)) : 7 * Math.min(1, 14 / Math.max(v, .1));
        if (up()) { AUTO.u = 1; AUTO.b = 0 }                                      /* W = temporary override */
        else if (aNet + drag > .1) { AUTO.u = Math.min(1, (aNet + drag) / cap); AUTO.b = 0 }
        else if (aNet < -(drag + .55) - .3) { AUTO.u = 0; AUTO.b = clamp((-aNet - drag - .55) / 8.5, 0, 1) }
        else { AUTO.u = 0; AUTO.b = 0 }
        if (P.kwh <= .05) { AUTO.u = 0; AUTO.boost = false }
    }

    /* ---------- normal cruise ---------- */
    function cruise(dt) {
        const v = Math.max(P.v, 0), vSet = AP.mph * MPS;
        planLane(dt, 1, vSet, -1, AP.tg, AP.tb, false);
        steerLane(dt, 1, v, LX(AUTO.lane));
        let vT = leadCap(vSet);
        if (P.pct <= 10) vT = Math.min(vT, 50);   /* battery reserve: no boost, so ~112 mph max */
        applySpeed(vT, v, null)
    }

    /* ---------- charger run ---------- */
    const beginTurn = dir => { S.ph = 'turn'; S.dir = dir; S.turned = 0; S.lastPsi = P.psi; S.t0 = time };
    function doTurn(dt, sk, v, vU) {   /* full-lock U-turn: steer until the heading has turned 180 deg, then hand back to the normal driver */
        S.turned += wrap(P.psi - S.lastPsi); S.lastPsi = P.psi;
        const left = S.dir * PI - S.turned;
        if (Math.abs(left) < .14 || time - S.t0 > 9) { S.ph = 'run'; AUTO.lane = laneOf(P.x); AUTO.xs = P.x; AUTO.cd = time; planT = 0; return }
        AUTO.steer = clamp(left * 3, -1, 1); AUTO.xs = P.x;
        applySpeed(vU, v, sk)
    }
    function prep(dt, sk, h, v, vCap, vU, R) {   /* get to a spot where a U-turn fits (sweep sideways = 2R + margin), brake to the turn speed, turn */
        if (time - S.t0 > 25) { S.ph = 'run'; return }
        const lim = limL(), fL = P.x - 2 * R - .9 >= -lim, fR = P.x + 2 * R + .9 <= 10, sx = fL ? -1 : fR ? 1 : 0;   /* sx = world direction the turn sweeps toward */
        planLane(dt, h, vCap, sx ? AUTO.lane : (P.x > 0 ? 4 : 1), AP.seekTg, AP.seekTb, false);
        steerLane(dt, h, v, LX(AUTO.lane));
        let vT = Math.min(sx ? vU : Math.min(vCap, 40), leadCap(vCap));
        if (sx && v <= vU + .9 && Math.abs(wrap(P.psi - (h > 0 ? 0 : PI))) < .3 && Math.abs(AUTO.xs - P.x) < 1.2) beginTurn(-h * sx);
        applySpeed(vT, v, sk)
    }
    /* wrong-way driving: free-space search across the whole road width (cars ahead of us within one car width of x) */
    function scanX(x) {
        let gap = 1e9, vl = 0;
        for (const o of traffic) {
            const dz = o.z - P.z; if (dz <= 0 || Math.abs(o.x - x) > (o.v < 3 ? 2.05 : 2.3)) continue;
            const g = dz - 4.7; if (g < gap) { gap = g; vl = -o.v }
        }
        return { gap, v: vl }
    }
    function safeBack(sc, vSet) {
        const g = sc.gap - (sc.v < -1 ? AP.headOn : 3);
        if (g <= 0) return 0;
        return Math.min(vSet, sc.v >= 0 ? sc.v + Math.sqrt(2 * AP.b * g) : Math.max(0, Math.sqrt(sc.v * sc.v + 2 * AP.b * g) + sc.v))
    }
    let tX = 0, tXt = 0;
    function back(dt, sk, v, vU, rem, xA) {   /* driving +Z against the traffic towards the station; the turn point is 'rem' metres ahead */
        const vB = AP.backMph * MPS, lo = -limL() + 1.3, hi = 8.6;
        planT -= dt;
        if (planT <= 0) {
            planT = .08;
            const sc = x => safeBack(scanX(x), vB) - (rem < 450 ? .12 * Math.abs(x - xA) : 0) - .15 * Math.abs(x - P.x);
            let best = clamp(tX, lo, hi);
            if (rem < 110 && (P.v > 4 || safeBack(scanX(P.x), vB) > 4)) best = clamp(xA, lo, hi);   /* drive straight at the turn point unless something stands in the way */
            else if (time - tXt > .9 || sc(best) < 6) { let bs = sc(best) + 3; for (let x = lo; x <= hi + .01; x += .5) if (sc(x) > bs) { bs = sc(x); best = x } if (best !== tX) tXt = time }
            tX = best
        }
        AUTO.lane = laneOf(tX); steerLane(dt, -1, v, tX);
        const here = Math.min(safeBack(scanX(P.x), vB), safeBack(scanX(AUTO.xs), vB));
        let vT = Math.min(here, vU + Math.sqrt(2 * AP.seekB * Math.max(rem - 2, 0)));
        vT = eco(vT, rem + 90);
        const g0 = Math.min(scanX(P.x).gap, scanX(AUTO.xs).gap);
        if (vT < 2.5 && Math.abs(tX - P.x) > .6 && g0 > 2.5) vT = 2.5;   /* boxed in but there is room to the side: creep and slide over */
        if (P.pct <= 10 && !AP.seekBoost) vT = Math.min(vT, 50);
        if (rem <= .5 && v <= vU + 1.2 && Math.abs(P.x - xA) < 1.6 && Math.abs(wrap(P.psi - PI)) < .3) beginTurn(-1);   /* right turn on the apron -> ends facing -Z at the bay */
        applySpeed(vT, v, sk)
    }
    function go(dt, sk, v, vCap) {   /* station ahead (we drive -Z): merge left early, brake late, funnel into the bay, park */
        const near = sk.d < AP.seekLeft;
        planLane(dt, 1, vCap, near ? 0 : -1, near ? AP.seekTg : AP.tg, near ? AP.seekTb : AP.tb, false);
        if (sk.d < 62) {   /* station funnel: follow the opening in the wall into the bay (pure pursuit) */
            const Ld = Math.max(6, v * 1.1), dL = sk.d - Ld;
            const lim = 10 + (dL >= SC_GAPH ? 0 : Math.min(SC_OUT, Math.max(0, (SC_GAPH - Math.max(dL, 0)) * SC_TAPER)));
            const limNow = 10 + (sk.d >= SC_GAPH ? 0 : Math.min(SC_OUT, (SC_GAPH - Math.max(sk.d, 0)) * SC_TAPER));
            const xT = Math.max(dL > SC_GAPH ? LX(0) : dL < 18 ? SC_CX : -Math.min(Math.abs(SC_CX), Math.max(Math.abs(LX(0)), lim - 1.3)), -(limNow - .6));   /* never aim past the wall edge we are at right now */
            AUTO.xs = P.x;
            AUTO.steer = clamp((-clamp(Math.atan2(xT - P.x, Ld), -.6, .6) - P.psi) * 4.5, -1, 1)
            if (sk.d < 9 && Math.abs(P.x - SC_CX) < 1.2) AUTO.steer = clamp(-P.psi * 4.5, -1, 1)   /* last metres: straighten up in the bay */
        } else steerLane(dt, 1, v, LX(AUTO.lane));
        let vT = leadCap(vCap);
        if (P.pct <= 10 && !AP.seekBoost) vT = Math.min(vT, 50);   /* battery reserve: no boost, so ~112 mph max */
        const r = Math.max(sk.r, 0);
        vT = Math.min(vT, r > 40 ? AP.funnel + Math.sqrt(2 * AP.seekB * (r - 40)) : r < 1 ? 0 : Math.min(AP.funnel, Math.sqrt(2 * AP.seekB * .55 * r) + .4));   /* flat out, brake late, firm stop at the stall */
        vT = Math.max(Math.min(vT, 6), eco(vT, Math.max(sk.d, 0) + 40));
        if (P.x > -8 && sk.d < 300) vT = Math.min(vT, sk.d < 140 ? 17 : 24);    /* still on the right: match the traffic flow (not slower), so the cars behind do not block the merge */
        const inBay = sk.d < 20 && sk.d > -25 && Math.abs(P.x - SC_CX) < 2.2;
        S.stuckT = (inBay && v < 1.5) ? S.stuckT + dt : 0;
        if (inBay && v < .6 && Math.cos(P.psi) > .94 && (sk.r < 1.5 && Math.abs(P.x - SC_CX) < 1.3 || S.stuckT > 2.5)) {   /* parked: hand over to the driver */
            AUTO.u = 0; AUTO.b = 1; AUTO.boost = false; parkedAt = performance.now(); setAuto(false); return
        }
        S.lost = (!inBay && sk.d < 40 && v < .8 && sk.r < 6) ? S.lost + dt : 0;   /* stopped near the station but not in the bay: try again with a U-turn */
        if (S.lost > 2.5) { S.lost = 0; S.ph = 'prep'; S.t0 = time }
        applySpeed(vT, v, sk)
    }
    function seekDrive(dt, sk) {
        const h = Math.cos(P.psi) >= 0 ? 1 : -1, v = Math.max(P.v, 0), vU = AP.uMph * MPS, R = Rt(vU);
        const vCap = (AP.seekBoost ? AP.mph : AP.seekMph) * MPS;
        if (S.ph === 'turn') { doTurn(dt, sk, v, vU); return }
        const xA = SC_CX + 2 * R, rem = sk.zStop + 6 - P.z;                        /* xA: where the turn at the station must start; rem: metres to that point (driving +Z) */
        if (S.ph === 'run') {
            const inZone = Math.abs(P.x - SC_CX) < 3 && Math.abs(sk.d) < 25;
            if (h > 0 ? !(sk.r > -2 || (inZone && sk.r > -14)) : rem <= -4) { S.ph = 'prep'; S.t0 = time }   /* the station is behind us -> turn round */
        }
        if (S.ph === 'prep') { prep(dt, sk, h, v, vCap, vU, R); return }
        if (h > 0) go(dt, sk, v, vCap); else back(dt, sk, v, vU, rem, xA)
    }

    autoDrive = function (dt) {
        if (dn() || K.Space || lf() || rt()) { AUTO.boost = false; setAuto(false); return }    /* driver takes over */
        const sk = seekState();
        if (!sk && Math.cos(P.psi) < .5) { AUTO.u = AUTO.b = AUTO.steer = 0; AUTO.boost = false; return }   /* not facing forward: do nothing */
        if (P.v > -.4 && P.gear !== 'D') P.gear = 'D';
        if (S.ph !== 'turn' && Math.abs(P.x - AUTO.xs) > 5) { AUTO.lane = laneOf(P.x); AUTO.xs = P.x }
        if (sk) seekDrive(dt, sk); else cruise(dt)
    };

    /* ---- UI: speed sign shows the SET speed while Auto Drive is on, [ ] change it ---- */
    const lim = document.getElementById('lim'), small = lim && lim.querySelector('small'), num = lim && lim.querySelector('b');
    const st = document.createElement('style');
    st.textContent = '#apSeek{position:fixed;z-index:7;left:50%;top:calc(18px + env(safe-area-inset-top,0px));transform:translate(-50%,8px);padding:9px 16px;border-radius:999px;background:var(--pill);border:1px solid rgba(62,106,225,.5);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:var(--blue);font-size:13px;font-weight:600;opacity:0;pointer-events:none;transition:opacity .3s,transform .3s,top .35s;white-space:nowrap}#apSeek.on{opacity:1;transform:translate(-50%,0)}';
    document.head.appendChild(st);
    const pill = document.createElement('div'); pill.id = 'apSeek'; document.body.appendChild(pill);
    let lastOn = null, lastMph = 0, epDone = false, pillT = 0, pillTxt = '';
    addEventListener('keydown', e => {
        if (!AUTO.on || e.repeat) return;
        if (e.code === 'BracketRight') AP.mph = Math.min(220, AP.mph + 10); else if (e.code === 'BracketLeft') AP.mph = Math.max(50, AP.mph - 10)
    });
    function showPill(txt) {
        if (txt !== pillTxt) { pillTxt = txt; pill.textContent = txt }
        const bw = document.getElementById('batWarn');   /* sit just under the battery card so the two never overlap */
        pill.style.top = 'calc(' + ((bw && bw.classList.contains('show')) ? bw.offsetHeight + 14 + 12 : 18) + 'px + env(safe-area-inset-top,0px))';
        pill.classList.toggle('on', !!txt)
    }
    (function ui() {
        requestAnimationFrame(ui); if (!num) return;
        if (!AUTO.on && AUTO.boost) AUTO.boost = false;
        if (typeof P !== 'undefined') {
            if (P.pct > 13) epDone = false;
            if (!AUTO.on) AP.seekOn = false;   /* driver took over / parked: seeking ends */
            if (AP.seek && AP.engage && !AUTO.on && !epDone && P.pct <= 10 && P.kwh > .05) { epDone = true; window.apGoCharge() }   /* 10%: Auto Drive takes you to a charger */
            const now = performance.now();
            if (now - pillT > 200) {
                pillT = now; const k = AUTO.on ? seekState() : null;
                if (k) {
                    const mi = (Math.abs(k.d) / SC_M).toFixed(1);   /* same number as the Supercharger card */
                    showPill(S.ph !== 'run' ? 'Auto Drive → Supercharger · ' + mi + ' mi · turning around'
                        : (Math.cos(P.psi) > .5 && k.d < 62 && k.d > -25) ? 'Entering the Supercharger…' : 'Auto Drive → Supercharger · ' + mi + ' mi')
                }
                else if (now - parkedAt < 6000) showPill('Parked at the Supercharger · drag the plug to the glowing port')
                else showPill('')
            }
        }
        if (AUTO.on !== lastOn || AP.mph !== lastMph) {
            lastOn = AUTO.on; lastMph = AP.mph;
            small.innerHTML = AUTO.on ? 'SET<br>SPEED' : 'SPEED<br>LIMIT'; num.textContent = AUTO.on ? AP.mph : 45
        }
    })();
})();