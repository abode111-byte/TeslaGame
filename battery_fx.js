/* battery_fx.js - battery effects. Load LAST in Game.html:  <script src="battery_fx.js"></script>
   1. Low-battery card (top-middle, same glass style as the Supercharger card) at 20% (amber) and 10% (red).
   2. While Shift (boost) is held the HUD battery grows, shakes, drains in orange and sends out energy rings;
      on release it springs back to its normal size. */
(() => {
    const st = document.createElement('style');
    st.textContent = `
#batWarn{--bw:#ff9f0a;position:fixed;z-index:7;left:50%;top:calc(14px + env(safe-area-inset-top,0px));width:250px;box-sizing:border-box;padding:12px 15px 13px;border-radius:18px;background:var(--pill);border:1px solid rgba(128,128,128,.3);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:var(--fg);pointer-events:none;opacity:0;transform:translate(-50%,-140%) scale(.92);transition:transform .6s cubic-bezier(.2,1.2,.3,1),opacity .35s}
#batWarn.lv10,#batWarn.lv0{--bw:#e5484d}
#batWarn.show{opacity:1;transform:translate(-50%,0) scale(1)}
#batWarn.lv10.show,#batWarn.lv0.show{animation:bwShake .55s 1}
#batWarn::after{content:'';position:absolute;inset:-1px;border-radius:18px;border:2px solid var(--bw);opacity:0;pointer-events:none}
#batWarn.show::after{animation:bwRing 1.6s ease-out infinite}
#batWarn.lv10.show::after,#batWarn.lv0.show::after{animation-duration:.9s}
#batWarn .bh{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600}
#batWarn .bi{position:relative;width:22px;height:22px;border-radius:50%;background:var(--bw);display:flex;align-items:center;justify-content:center;flex:none}
#batWarn .bi svg{width:13px;height:8px}
#batWarn.show .bi{animation:bwPop 1s ease-in-out infinite}
#batWarn.lv10.show .bi,#batWarn.lv0.show .bi{animation-duration:.5s}
#batWarn .bi::after{content:'';position:absolute;inset:0;border-radius:50%;border:2px solid var(--bw);animation:bwRing2 1.2s ease-out infinite}
#batWarn .bd{margin-left:auto;color:var(--mut);font-weight:500;font-size:12px;font-variant-numeric:tabular-nums}
#batWarn .bn{font-size:44px;font-weight:300;line-height:1;margin-top:12px;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--bw);animation:bwBreath 1.4s ease-in-out infinite}
#batWarn.lv10 .bn,#batWarn.lv0 .bn{animation-duration:.7s}
#batWarn .bn small{font-size:13px;letter-spacing:.2em;color:var(--mut);margin-left:8px;font-weight:500;text-shadow:none}
#batWarn .bs{margin-top:7px;font-size:12px;font-weight:500;color:var(--mut);line-height:1.35}
#batWarn .bp{height:4px;border-radius:2px;margin-top:11px;background:rgba(128,128,128,.3);overflow:hidden}
#batWarn .bp u{display:block;height:100%;border-radius:2px;background:repeating-linear-gradient(115deg,var(--bw) 0 7px,rgba(255,255,255,.6) 7px 11px);background-size:200% 100%;animation:bwFlow .7s linear infinite;transition:width .3s}
#batWarn .bgo{display:none;width:100%;margin-top:12px;pointer-events:auto;cursor:pointer;font:600 13px inherit;font-family:inherit;padding:10px;border-radius:999px;border:0;background:var(--blue);color:#fff;box-shadow:0 4px 14px rgba(62,106,225,.4)}
#batWarn.lv10 .bgo{display:block}
#batWarn .bgo.act{background:transparent;color:var(--fg);border:1px solid rgba(128,128,128,.4);box-shadow:none}
#batWarn .bgo:active{transform:scale(.97)}
@keyframes bwRing{0%{opacity:.85;transform:scale(1)}100%{opacity:0;transform:scale(1.12,1.32)}}
@keyframes bwRing2{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(2.1)}}
@keyframes bwPop{50%{transform:scale(1.18)}}
@keyframes bwBreath{50%{text-shadow:0 0 18px var(--bw)}}
@keyframes bwFlow{to{background-position:-40px 0}}
@keyframes bwShake{0%,100%{transform:translate(-50%,0) scale(1)}20%{transform:translate(calc(-50% - 9px),0) scale(1)}40%{transform:translate(calc(-50% + 9px),0) scale(1)}60%{transform:translate(calc(-50% - 5px),0) scale(1)}80%{transform:translate(calc(-50% + 5px),0) scale(1)}}

/* bigger HUD battery, range text and V2V stats */
#bat{font-size:25px;gap:13px}
#bat .ib{width:68px;height:32px;border-width:2.5px;border-radius:10px;padding:2px}
#bat .ib::after{right:-8px;width:4px;height:12px;margin-top:-6px}
#bat .ibf{border-radius:6.5px}
#bat .bolt{width:15px;height:20px;margin:-10px 0 0 -7.5px}
#rng{font-size:18px;margin-top:5px}
#v2v{font-size:15px;line-height:1.75}
/* boost: HUD battery */
#bat{transform-origin:100% 50%;transition:transform .45s cubic-bezier(.3,1.7,.5,1)}
#rng{transition:transform .45s cubic-bezier(.3,1.7,.5,1)}
#bat.boost{transform:scale(1.45);animation:bwJit .09s linear infinite}
#bat.boost ~ #rng{transform:translateY(13px)}
#bat.boost #batT{color:#ff9f0a;animation:bwBreath .5s ease-in-out infinite;--bw:#ff9f0a}
#bat.boost .ib{border-color:#ff9f0a;box-shadow:0 0 14px 2px rgba(255,159,10,.7)}
#bat.boost .ib::before{content:'';position:absolute;inset:-2px;border-radius:12px;border:2px solid #ff9f0a;opacity:0;animation:bwBRing .8s ease-out infinite}
#bat.boost .ibf{background:repeating-linear-gradient(115deg,#ff9f0a 0 6px,#ff5a1f 6px 12px);background-size:200% 100%;animation:bwDrain .45s linear infinite;box-shadow:0 0 9px rgba(255,120,20,.8)}
#bat.boost .bolt{opacity:0}   /* boosting uses power, it is not charging: no bolt */
@keyframes bwBRing{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(1.45,1.9)}}
@keyframes bwDrain{to{background-position:-34px 0}}
@keyframes bwFlick{50%{opacity:.35}}
/* 10% reserve zone on the battery + 'boost locked' chip */
#bwLock{max-height:0;opacity:0;overflow:hidden;margin-top:0;font-size:12px;font-weight:600;color:#e5484d;transition:max-height .4s,opacity .3s,margin .4s}
#bwLock.on{max-height:26px;opacity:1;margin-top:4px}
#bwLock.hit{animation:bwHit .35s 1}
#bwLock svg{width:11px;height:12px;vertical-align:-2px;margin-right:4px;fill:#e5484d}
@keyframes bwHit{25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
/* empty battery (0%) */
#bat.zero #batT{color:#ff453a;animation:bwZeroTxt .9s ease-in-out infinite}
#bat.zero .ib{border-color:#ff453a;box-shadow:0 0 12px 1px rgba(255,69,58,.6);animation:bwEmpty 1.1s ease-in-out infinite}
#bat.zero .ib::before{content:'';position:absolute;inset:-2px;border-radius:12px;border:2px solid #ff453a;opacity:0;animation:bwBRing 1.1s ease-out infinite}
#bat.zero .ibf{opacity:0;box-shadow:none}
#bat.zero .bolt{opacity:1;fill:#ff453a;animation:bwFlick .55s ease-in-out infinite}
#bat.zero ~ #rng{color:#ff453a}
@keyframes bwZeroTxt{50%{opacity:.35}}
@keyframes bwEmpty{50%{box-shadow:0 0 22px 5px rgba(255,69,58,.85)}}
@keyframes bwJit{0%,100%{transform:scale(1.45) translate(0,0)}33%{transform:scale(1.45) translate(-.6px,.4px)}66%{transform:scale(1.45) translate(.6px,-.4px)}}`;
    document.head.appendChild(st);

    const bw = document.createElement('div'); bw.id = 'batWarn';
    bw.innerHTML = '<div class="bh"><span class="bi"><svg viewBox="0 0 34 18"><rect x="1" y="1" width="28" height="16" rx="4" fill="none" stroke="#fff" stroke-width="3"/><rect x="4.5" y="4.5" width="7" height="9" rx="1.5" fill="#fff"/><rect x="30" y="6" width="3" height="6" rx="1" fill="#fff"/></svg></span><span class="bt"></span><span class="bd"></span></div><div class="bn"><span class="bv"></span><small>MI</small></div><div class="bs"></div><div class="bp"><u></u></div><button class="bgo" type="button" tabindex="-1"></button>';
    document.body.appendChild(bw);
    const q = s => bw.querySelector(s), bt = q('.bt'), bd = q('.bd'), bv = q('.bv'), bs = q('.bs'), bu = q('.bp u'), bgo = q('.bgo');
    const bat = document.getElementById('bat'), rng = document.getElementById('rng');
    let chip = null;
    if (rng) { chip = document.createElement('div'); chip.id = 'bwLock'; chip.innerHTML = '<svg viewBox="0 0 12 14"><path d="M3 5V4a3 3 0 016 0v1h1a1 1 0 011 1v6a1 1 0 01-1 1H2a1 1 0 01-1-1V6a1 1 0 011-1zm1.6 0h2.8V4a1.4 1.4 0 00-2.8 0z"/></svg>Boost locked · battery reserve'; rng.insertAdjacentElement('afterend', chip) }
    let f20 = false, f10 = false, hideAt = 0, lv = 20, lastUpd = 0, zero = false, shown = null;

    function goLabel() {
        const on = typeof AP !== 'undefined' && AP.seekOn && typeof AUTO !== 'undefined' && AUTO.on;
        bgo.textContent = on ? 'Auto Drive is taking you there · Cancel' : 'Auto Drive to nearest Supercharger'; bgo.classList.toggle('act', on)
    }
    bgo.onmousedown = e => e.preventDefault();   /* keep keyboard focus on the game (Space must stay the handbrake) */
    bgo.onclick = () => { if (typeof apGoCharge === 'function') apGoCharge(); bgo.blur(); goLabel() };
    function upd() {
        goLabel();
        const mi = rng ? parseFloat(rng.textContent) : NaN;
        bv.textContent = isFinite(mi) ? Math.round(mi) : '--';
        bd.textContent = Math.round(P.pct) + '% left'; bu.style.width = Math.max(3, Math.min(100, P.pct * (lv === 20 ? 5 : 10))) + '%'
    }
    function show(l) {
        lv = l; shown = l; fxSound(l === 0 ? 'b0' : l === 10 ? 'b10' : 'b20'); bt.textContent = l === 0 ? 'Battery empty' : l > 10 ? 'Low battery' : 'Battery critical';
        bs.textContent = l === 0 ? 'No power · get to a Supercharger' : l > 10 ? 'Find a Supercharger soon' : 'Charge now · ease off the speed';
        bw.className = ''; void bw.offsetWidth; upd();   /* restart the animations */
        bw.className = 'lv' + l + ' show'; hideAt = l === 20 ? performance.now() + 7000 : 0   /* 20% hides itself; 10% and 0% stay until you charge */
    }


    /* ---------- sounds (use the game's own audio engine: tone(), so the M key mutes them too) ---------- */
    const snd = {
        sc: () => { tone(784, .22, 'sine', .11); tone(988, .22, 'sine', .1, 0, .09); tone(1319, .5, 'sine', .1, 0, .18); tone(2637, .35, 'sine', .018, 0, .18) },   /* Supercharger card: bright rising chime */
        b20: () => { tone(880, .3, 'triangle', .13); tone(659, .5, 'triangle', .12, 0, .16) },                                                              /* 20%: soft two-note "ding-dong" */
        b10: () => { for (let i = 0; i < 3; i++) { tone(1046, .12, 'triangle', .13, 0, i * .2); tone(784, .12, 'triangle', .1, 0, i * .2 + .1) } },        /* 10%: urgent triple alert */
        b0: () => { tone(440, .35, 'sine', .15, 220); tone(330, .6, 'sine', .14, 110, .3) }                                                                   /* 0%: low falling tone */
    };
    window.fxSound = k => { try { if (typeof tone === 'function' && snd[k]) snd[k]() } catch (e) { } };

    /* ---------- battery-pack upgrade popup (shown when the battery hits 0%) + boost lock below 10% ---------- */
    const UPGRADE_AT = 0, PRICE = '$10';   /* popup at this % (0 = when empty; set 10 to show it at 10%) | placeholder price */
    const st2 = document.createElement('style');
    st2.textContent = `
#upg{position:fixed;inset:0;z-index:9;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.38);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);opacity:0;pointer-events:none;transition:opacity .35s}
#upg.on{opacity:1;pointer-events:auto}
#upg .uc{width:min(330px,88vw);box-sizing:border-box;padding:14px 16px 16px;border-radius:22px;background:var(--pill);border:1px solid rgba(128,128,128,.3);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);color:var(--fg);font-family:inherit;transform:translateY(30px) scale(.92);transition:transform .55s cubic-bezier(.2,1.25,.3,1)}
#upg.on .uc{transform:none}
#upg .uh{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600}
#upg .ui{width:22px;height:22px;border-radius:50%;background:#e5484d;display:flex;align-items:center;justify-content:center;flex:none;animation:bwPop 1s ease-in-out infinite}
#upg .ui svg{width:13px;height:8px}
#upg .ud{margin-left:auto;color:var(--mut);font-weight:500;font-size:12px}
#upg .uv{display:block;margin:6px auto 0;width:150px;height:auto;filter:drop-shadow(0 8px 14px rgba(52,199,89,.25))}
#upg .uv .cell{fill:#34c759;opacity:.3;animation:upWave 1.8s ease-in-out infinite}
#upg .uv .pack{animation:upGlow 1.8s ease-in-out infinite}
#upg .ut{font-size:21px;font-weight:600;margin-top:8px;text-align:center}
#upg .us{font-size:12px;font-weight:500;color:var(--mut);text-align:center;margin-top:4px;line-height:1.4}
#upg .ur{display:flex;gap:8px;margin-top:12px}
#upg .ur div{flex:1;padding:8px 10px;border-radius:12px;background:rgba(128,128,128,.14);text-align:center;font-size:11px;color:var(--mut);font-weight:500}
#upg .ur b{display:block;font-size:17px;font-weight:600;color:var(--fg);margin-top:2px;font-variant-numeric:tabular-nums}
#upg .ur b.g{color:#34c759}
#upg .ub{display:flex;gap:8px;margin-top:14px}
#upg button{flex:1;font:600 14px inherit;font-family:inherit;padding:11px 10px;border-radius:999px;border:1px solid rgba(128,128,128,.3);color:var(--fg);background:var(--pill);cursor:pointer}
#upg button.buy{flex:1.4;background:var(--blue);color:#fff;border-color:transparent;box-shadow:0 4px 16px rgba(62,106,225,.45)}
#upg button:active{transform:scale(.97)}
@keyframes upWave{0%,100%{opacity:.28}50%{opacity:1;filter:drop-shadow(0 0 3px #34c759)}}
@keyframes upGlow{50%{filter:drop-shadow(0 0 7px rgba(52,199,89,.7))}}
#bwToast{position:fixed;z-index:7;left:50%;top:26%;transform:translate(-50%,10px);padding:9px 16px;border-radius:999px;background:var(--pill);border:1px solid rgba(229,72,77,.6);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#e5484d;font-size:13px;font-weight:600;opacity:0;pointer-events:none;transition:opacity .25s,transform .25s;white-space:nowrap}
#bwToast.on{opacity:1;transform:translate(-50%,0)}`;
    document.head.appendChild(st2);

    /* top-down chassis with the battery pack (green cells light up in a wave) */
    let cells = '';
    for (let r = 0; r < 10; r++) for (let c = 0; c < 4; c++) cells += `<rect class="cell" x="${41 + c * 17}" y="${60 + r * 12.2}" width="15" height="10" rx="2.2" style="animation-delay:${((9 - r) * .12 + c * .05).toFixed(2)}s"/>`;
    const wheel = (x, y) => `<rect x="${x}" y="${y}" width="22" height="42" rx="7" fill="#2a2e35"/><rect x="${x + 4}" y="${y + 6}" width="4" height="30" rx="2" fill="rgba(255,255,255,.12)"/>`;
    const chassis = `<svg class="uv" viewBox="0 0 150 232"><g fill="none" stroke="#8b9099" stroke-width="2"><line x1="28" y1="48" x2="122" y2="48"/><line x1="28" y1="184" x2="122" y2="184"/><rect x="30" y="16" width="90" height="200" rx="26" stroke-opacity=".7"/></g>${wheel(4, 26)}${wheel(124, 26)}${wheel(4, 162)}${wheel(124, 162)}<rect x="58" y="34" width="34" height="18" rx="5" fill="#5b6270"/><rect x="58" y="176" width="34" height="18" rx="5" fill="#5b6270"/><g class="pack"><rect x="36" y="54" width="78" height="128" rx="10" fill="#0e2a17" stroke="#34c759" stroke-width="2"/>${cells}</g></svg>`;
    const upg = document.createElement('div'); upg.id = 'upg';
    const kwh = typeof BAT_KWH === 'number' ? BAT_KWH : 75;
    upg.innerHTML = `<div class="uc"><div class="uh"><span class="ui"><svg viewBox="0 0 34 18"><rect x="1" y="1" width="28" height="16" rx="4" fill="none" stroke="#fff" stroke-width="3"/><rect x="30" y="6" width="3" height="6" rx="1" fill="#fff"/></svg></span>Battery empty<span class="ud">Upgrade</span></div>${chassis}<div class="ut">Bigger battery pack</div><div class="us">Go further between Superchargers and never run dry mid-drive.</div><div class="ur"><div>Capacity<b>${kwh} → ${Math.round(kwh * 1.33)} kWh</b></div><div>Range<b class="g">+33%</b></div></div><div class="ub"><button class="later">Later</button><button class="buy">Buy · ${PRICE}</button></div></div>`;
    document.body.appendChild(upg);
    const buyB = upg.querySelector('.buy');
    let upOpen = false, offered = false, upTimer = 0, buyTimer = 0;
    const upShow = on => { upOpen = on; upg.classList.toggle('on', on) };
    upg.querySelector('.later').onclick = () => upShow(false);
    upg.addEventListener('click', e => { if (e.target === upg) upShow(false) });
    buyB.onclick = () => {   /* TODO: real payment goes here. Replace window.buyBatteryPack with your checkout call. */
        if (typeof window.buyBatteryPack === 'function') window.buyBatteryPack();
        buyB.textContent = 'Payment coming soon'; clearTimeout(buyTimer); buyTimer = setTimeout(() => { buyB.textContent = 'Buy · ' + PRICE }, 1800)
    };
    addEventListener('keydown', e => { if (e.code === 'Escape' && upOpen) upShow(false) });

    const toast = document.createElement('div'); toast.id = 'bwToast'; toast.textContent = 'Boost locked · the last 10% is kept as battery reserve'; document.body.appendChild(toast);
    let toastT = 0;
    addEventListener('keydown', e => {
        if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat && typeof P !== 'undefined' && P.pct <= 10) {
            if (chip) { chip.classList.remove('hit'); void chip.offsetWidth; chip.classList.add('hit') }
            toast.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('on'), 1800)
        }
    });

    (function loop() {
        requestAnimationFrame(loop);
        if (typeof P === 'undefined') return;
        const p = P.pct, now = performance.now();
        if (typeof p !== 'number') return;
        const atCharger = Math.abs(P.v) <= 1 && P.chg > .5;   /* parked and charging = real charging, not regen */
        if (!zero && p <= .5 && !atCharger) zero = true; else if (zero && (p > 1.5 || atCharger)) zero = false;
        const locked = p <= 10; if (bat) bat.classList.toggle('lock', locked); if (chip) chip.classList.toggle('on', locked);
        if (bat) { bat.classList.toggle('zero', zero); bat.classList.toggle('boost', !!P.bo && !zero && p > 1) }   /* no boost animation on an empty battery */
        if (p <= 20 && !f20) { f20 = true; if (p > 10) show(20) }
        if (p <= 10) f10 = true;
        if (p > 23) f20 = false;   /* charged back up: warn again next time */
        if (p > 13) f10 = false;
        const trig = UPGRADE_AT <= 0 ? zero : p <= UPGRADE_AT;   /* offer the bigger pack once per empty battery */
        if (trig && !offered && !atCharger) { offered = true; clearTimeout(upTimer); upTimer = setTimeout(() => upShow(true), 900) }
        if (p > Math.max(UPGRADE_AT, 0) + 5) { offered = false; if (upOpen) upShow(false) }
        const want = zero ? 0 : f10 ? 10 : null;
        if (want !== null) { if (shown !== want) show(want) }
        else if (shown === 0 || shown === 10) { bw.classList.remove('show'); shown = null }
        if (hideAt && now > hideAt) { bw.classList.remove('show'); hideAt = 0; shown = null }
        if (shown !== null && now - lastUpd > 250) { lastUpd = now; upd() }
    })();
})();