// mg_trenchwarfare.js - Western Front role manager (cs_script, no plugins)
// AI-generated (Claude) for skink52's mg_trenchwarfare addon.
//
// Roles: INFANTRY (fire trench, respawn, bolt rifle + P250 + knife, kill streak -> AWP / auto rifle, dressing stations heal),
//        MORTAR (5 crews x 2 per side: plot at the map table, fetch a bomb, load, fire; simulated shells with spread),
//        AIR (biplanes, not built yet - CONFIG.AIR_ENABLED; lives, then back to the ground).
// Bots are always infantry. Everyone spawns in the briefing room and is sent to their post after a short delay.
//
// Map entities this script uses (all made by tools/make_map.py):
//   trench_<t|ct>_N (point_teleport)            infantry posts, facing the enemy
//   mortarpit_<t|ct>_K (info_target)            mortar tube position of crew K (1..5); place your mortar prefab there
//   mortarcrew_<t|ct>_K_a / _b (point_teleport) crew seats: a = plotting table, b = ammunition box
//   heal_<t|ct>_N (info_target)                 dressing stations
//   plane_<t|ct>_N (point_teleport)             biplane spawns (for later)
//   tw_hud (custom_hud_layout), tw_boom_fx_N / tw_dirt_fx_N / tw_boom_snd_N / tw_whistle_snd_N / tw_shake_N (effect pools),
//   tw_launch_snd_<tag>_K / tw_launch_fx_<tag>_K (per mortar pit)

import { Instance, CSInputs, CSMoveType, CSDamageTypes, CustomCameraMode } from "cs_script/point_script";

// ------------------------------------------------------------------ settings
const CONFIG = {
  HUD: "tw_hud",
  LOBBY_FIRST: 4.0,          // seconds in the briefing room on first spawn
  LOBBY_RESPAWN: 1.5,        // ... and after every respawn
  MORTAR_CHANCE: 0.4,        // chance a new player is put on a mortar crew (if a seat is free)
  ROTATE_CHANCE: 0.12,       // on respawn, chance to be moved to the other ground role ("a taste of everything")
  CREWS: 5,
  // WW1 weapons come from the addon's weapons.vdata (models, magazines): T Gewehr 98 = weapon_awp, Luger = weapon_glock;
  // CT Lee-Enfield = weapon_ssg08, Colt M1911 = weapon_hkp2000. Streak upgrade: T Mondragon = weapon_g3sg1, CT Lewis gun = weapon_scar20.
  INF_RIFLE: { 2: "weapon_awp", 3: "weapon_ssg08" },
  INF_PISTOL: { 2: "weapon_glock", 3: "weapon_hkp2000" },
  STREAK_UPGRADE: 3,                   // kills without dying -> upgrade
  UPGRADE: { 2: "weapon_g3sg1", 3: "weapon_scar20" },
  RIFLE_NAME: { 2: "Gewehr 98", 3: "Lee-Enfield" }, UPGRADE_NAME: { 2: "Mondragon self-loader", 3: "Lewis gun" },
  INF_ARMOR: 50,
  HEAL_RADIUS: 120, HEAL_HP_PER_S: 12, HEAL_ARMOR_PER_S: 25,
  STATION_RADIUS: 72,
  TARGET_EXT: 3600,                    // targeting map covers x, y in [-EXT, EXT]
  TARGET_STEPS: 192,
  SIGHT_SPEED: 60, SIGHT_FINE: 14,     // steps per second
  SHELL_RADIUS: 330, SHELL_DAMAGE: 170, TRENCH_COVER: 0.35,
  SPREAD_BASE: 70, SPREAD_PER_UNIT: 0.035,
  FLIGHT_BASE: 2.2, FLIGHT_PER_UNIT: 1 / 1500,
  RELOAD_COOLDOWN: 2.0,
  MORTAR_FIRE_ANIM: "fire",
  FRIENDLY_SPLASH: false,
  POOL: 12,
  AMBIENT_MIN: 4, AMBIENT_MAX: 13, AMBIENT_CLEAR: 550,   // cosmetic no man's land bursts (seconds between, min distance to any player)
  AIR_ENABLED: true, AIR_SLOTS: 5, AIR_LIVES: 2, AIR_CHECK: 30,
  // arcade flight (mouse aim: the plane turns toward where the pilot looks; W/S throttle, LMB guns, RMB bomb, E bail-out view reset)
  AIR: {
    SPAWN_ALT: 1100, V_STALL: 420, V_MIN: 520, V_CRUISE: 1150, V_MAX: 1650, ACCEL: 0.6, DIVE_GAIN: 520,
    TURN: 62, TURN_SLOW: 0.45, BANK_MAX: 65, ROLL_SIGN: -1, MODEL_YAW: 180,     // models' noses point at -x
    ROLL_RATE: 160, ROLL_MAX: 85, BANK_YAW: 55, BANK_BOOST: 0.9,              // A/D roll; banked into the turn = faster turn
    GUN_AMMO: 500, GUN_RELOAD: 6,
    COCKPIT: { back: 26, up: 74 }, VIEW_DEFAULT: "chase",                     // "cockpit" also supported (camera at the pilot's head)
    BOX_X: 6500, BOX_Y: 5500, ALT_MAX: 5000, ALT_MIN: 120,
    GUN_INTERVAL: 0.09, GUN_DAMAGE: 16, GUN_RANGE: 5200, GUN_SPREAD: 0.014, GUN_FROM: 150,
    BOMBS: 2, BOMB_REARM: 18, BOMB_RADIUS: 420, BOMB_DAMAGE: 240, GRAVITY: 800,
    HIT_SCALE: 0.4, HIT_MIN: 12,                 // rifle bullets on a plane: weapon damage x scale (at least HIT_MIN) to the pilot
    CRASH_CREDIT: 10,                            // seconds a hit keeps kill credit for a crash
    CAM_FOLLOW: { x: 0, y: 0, z: 70 }, CAM_OFFSET: { x: -380, y: 0, z: 70 },
    PILOT: { back: 26, up: -34 },                // pilot pawn relative to the plane origin: sunk in the fuselage, head at the cockpit rim
  },
  CVARS: ["mp_respawn_on_death_t 1", "mp_respawn_on_death_ct 1", "mp_respawn_immunitytime 0", "mp_freezetime 0",
          "mp_roundtime 60", "mp_buy_anywhere 0", "mp_buytime 0", "mp_death_drop_gun 0", "mp_weapons_allow_map_placed 1",
          "mp_free_armor 0", "mp_solid_teammates 1", "bot_quota_mode normal"],
};
const T = 2, CT = 3;
const tagOf = (team) => (team === T ? "t" : "ct");
const ROLE_NAME = { infantry: "INFANTRY", mortar: "TRENCH MORTAR CREW", air: "AIRCREW" };

// ------------------------------------------------------------------ helpers
const now = () => Instance.GetGameTime();
function live(e) { try { return e && e.IsValid() ? e : undefined; } catch (err) { return undefined; } }
function v3(x, y, z) { return { x, y, z }; }
function dist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
function dist3(a, b) { const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
function gauss() { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function toPawn(ent) {
  if (!ent) return undefined;
  try { if (typeof ent.GetPlayerPawn === "function") return live(ent.GetPlayerPawn()); } catch (e) {}
  try { if (typeof ent.GetPlayerController === "function") return live(ent); } catch (e) {}
  return undefined;
}
function pawnOf(slot) { const c = Instance.GetPlayerController(slot); return c ? live(c.GetPlayerPawn()) : undefined; }
function nameOf(slot) { const c = Instance.GetPlayerController(slot); return c ? c.GetPlayerName() : "?"; }
function slotOfPawn(pawn) { try { const c = pawn.GetPlayerController(); return c ? c.GetPlayerSlot() : -1; } catch (e) { return -1; } }
function fire(name, input, value, delay) { Instance.EntFireAtName({ name, input, value, delay: delay || 0 }); }
function say(text) { Instance.ServerCommand("say " + text); }

// named map points (cached per round, map entities are re-created every round)
let points = null;
function findList(prefix, max) {
  const out = [];
  for (let i = 1; i <= max; i++) { const e = live(Instance.FindEntityByName(prefix + i)); if (e) out.push(e); }
  return out;
}
function loadPoints() {
  points = { trench: {}, heal: {}, plane: {}, pit: {}, seatA: {}, seatB: {}, aircraft: {} };
  for (const team of [T, CT]) {
    const tg = tagOf(team);
    points.trench[team] = findList("trench_" + tg + "_", 64).map(e => ({ pos: e.GetAbsOrigin(), ang: e.GetAbsAngles(), used: 0 }));
    points.heal[team] = findList("heal_" + tg + "_", 16).map(e => e.GetAbsOrigin());
    points.plane[team] = findList("plane_" + tg + "_", 16).map(e => ({ pos: e.GetAbsOrigin(), ang: e.GetAbsAngles() }));
    points.aircraft[team] = findList("tw_plane_" + tg + "_", 16).map(e => ({ ent: e, park: e.GetAbsOrigin(), parkAng: e.GetAbsAngles(), pilot: -1 }));
    points.pit[team] = []; points.seatA[team] = []; points.seatB[team] = [];
    for (let k = 1; k <= CONFIG.CREWS; k++) {
      const pit = live(Instance.FindEntityByName("mortarpit_" + tg + "_" + k)) || live(Instance.FindEntityByName("mortar_" + tg + "_" + k));
      const a = live(Instance.FindEntityByName("mortarcrew_" + tg + "_" + k + "_a"));
      const b = live(Instance.FindEntityByName("mortarcrew_" + tg + "_" + k + "_b"));
      points.pit[team].push(pit ? pit.GetAbsOrigin() : undefined);
      points.seatA[team].push(a ? { pos: a.GetAbsOrigin(), ang: a.GetAbsAngles() } : undefined);
      points.seatB[team].push(b ? { pos: b.GetAbsOrigin(), ang: b.GetAbsAngles() } : undefined);
    }
  }
  const n = (o) => o[T].length + "/" + o[CT].length;
  Instance.Msg("[tw] points: trench " + n(points.trench) + ", heal " + n(points.heal) + ", plane spawns " + n(points.plane) + ", aircraft " + n(points.aircraft));
}

// ------------------------------------------------------------------ state
const players = new Map();   // slot -> P
function P(slot) {
  let p = players.get(slot);
  if (!p) {
    p = { slot, role: null, team: 0, crew: -1, seat: "", deployAt: 0, deployed: false, first: true, streak: 0, kills: 0, upgraded: false,
          pref: "", carrying: false, inSight: false, u: 0.5, v: 0.3, prevKeys: 0, lives: 0, merit: 0, flown: 0, toastUntil: 0, bannerUntil: 0,
          healing: false, mortarKills: 0, hud: new Map() };
    players.set(slot, p);
  }
  return p;
}
const crews = { [T]: [], [CT]: [] };
function resetCrews() {
  for (const team of [T, CT]) {
    crews[team] = [];
    for (let k = 0; k < CONFIG.CREWS; k++) crews[team].push({ a: -1, b: -1, loaded: false, target: null, cooldown: 0, impacts: [] });
  }
}
resetCrews();
const shells = [];           // in flight
try { globalThis.__twDebug = { players, crews, shells }; } catch (e) {}
let poolIdx = 0;

// ------------------------------------------------------------------ HUD (per-player cache, only changes are sent)
let hudEnt;
function hud() {
  if (live(hudEnt)) return hudEnt;
  hudEnt = live(Instance.FindEntityByName(CONFIG.HUD));
  return hudEnt;
}
function hText(p, id, text) {
  text = String(text === undefined || text === null ? "" : text);
  const k = id + "$";
  if (p.hud.get(k) === text) return;
  const h = hud(); if (!h) return;
  h.SetDialogVariableStringForPlayer(p.slot, id, "v", text);
  p.hud.set(k, text);
}
function hClass(p, id, cls, on) {
  const k = id + "#" + cls;
  if (p.hud.get(k) === on) return;
  const h = hud(); if (!h) return;
  h.SetHasClassForPlayer(p.slot, id, cls, on);
  p.hud.set(k, on);
}
function hSwap(p, id, group, cls) {   // one class per group (marker positions, map picture)
  const k = id + "@" + group;
  const old = p.hud.get(k);
  if (old === cls) return;
  const h = hud(); if (!h) return;
  if (old) h.SetHasClassForPlayer(p.slot, id, old, false);
  if (cls) h.SetHasClassForPlayer(p.slot, id, cls, true);
  p.hud.set(k, cls);
}
function hudReset(p) { const h = hud(); if (h) { try { h.ResetForPlayer(p.slot); } catch (e) {} } p.hud.clear(); }
function toast(p, text, secs) { hText(p, "tw_toast_text", text); p.toastUntil = now() + (secs || 3); }
function banner(p, title, sub, secs) { hText(p, "tw_banner_title", title); hText(p, "tw_banner_sub", sub); p.bannerUntil = now() + (secs || 5); }

// ------------------------------------------------------------------ roles
function seatFree(team) {
  for (const c of crews[team]) if (c.a < 0 || c.b < 0) return true;
  return false;
}
function takeSeat(p, team) {
  // fill half-empty crews first so pairs form, then a random empty one
  const list = crews[team];
  let pick = -1;
  for (let k = 0; k < list.length; k++) if ((list[k].a < 0) !== (list[k].b < 0)) { pick = k; break; }
  if (pick < 0) {
    const empty = []; for (let k = 0; k < list.length; k++) if (list[k].a < 0 && list[k].b < 0) empty.push(k);
    if (empty.length) pick = empty[Math.floor(Math.random() * empty.length)];
  }
  if (pick < 0) return false;
  const c = list[pick];
  if (c.a < 0) { c.a = p.slot; p.seat = "a"; } else { c.b = p.slot; p.seat = "b"; }
  p.crew = pick;
  return true;
}
function leaveSeat(p) {
  if (p.crew >= 0 && p.team) {
    const c = crews[p.team] && crews[p.team][p.crew];
    if (c) { if (c.a === p.slot) c.a = -1; if (c.b === p.slot) c.b = -1; }
  }
  p.crew = -1; p.seat = ""; p.carrying = false;
}
function setRole(p, role, team) {
  if (p.role === "mortar" && role !== "mortar") leaveSeat(p);
  if (role === "mortar" && (p.role !== "mortar" || p.crew < 0)) { if (!takeSeat(p, team)) role = "infantry"; }
  p.role = role;
  if (role === "air") { p.lives = CONFIG.AIR_LIVES; p.flown++; }
}
function chooseRole(p, pawn, team) {
  const isBot = (() => { try { return pawn.GetPlayerController().IsBot(); } catch (e) { return false; } })();
  if (isBot) { if (p.role !== "infantry") setRole(p, "infantry", team); return; }
  if (p.role === "air" && p.lives > 0) return;
  if (p.role === "air") { setRole(p, Math.random() < 0.5 && seatFree(team) ? "mortar" : "infantry", team); return; }
  if (!p.role) {
    if (p.pref === "mortar" && seatFree(team)) setRole(p, "mortar", team);
    else if (p.pref === "infantry") setRole(p, "infantry", team);
    else setRole(p, Math.random() < CONFIG.MORTAR_CHANCE && seatFree(team) ? "mortar" : "infantry", team);
    return;
  }
  if (p.pref && p.pref !== p.role && (p.pref !== "mortar" || seatFree(team))) { setRole(p, p.pref, team); return; }
  if (!p.pref && Math.random() < CONFIG.ROTATE_CHANCE) {
    if (p.role === "infantry" && seatFree(team)) setRole(p, "mortar", team);
    else if (p.role === "mortar") setRole(p, "infantry", team);
  }
}

// aircraft (biplanes, later): weighted draw from ground players every AIR_CHECK seconds
let nextAirCheck = 0;
function airCheck() {
  if (!CONFIG.AIR_ENABLED || now() < nextAirCheck) return;
  nextAirCheck = now() + CONFIG.AIR_CHECK;
  for (const team of [T, CT]) {
    let inAir = 0; const cand = [];
    for (const p of players.values()) {
      if (p.team !== team) continue;
      if (p.role === "air") { inAir++; continue; }
      const c = Instance.GetPlayerController(p.slot);
      if (!c || c.IsBot()) continue;
      cand.push({ p, w: 1 + p.merit + (p.pref === "air" ? 3 : 0) + (p.flown === 0 ? 2 : 0) });
    }
    for (let k = inAir; k < CONFIG.AIR_SLOTS && cand.length; k++) {
      let tot = 0; for (const c of cand) tot += c.w;
      let r = Math.random() * tot, i = 0;
      for (; i < cand.length - 1; i++) { r -= cand[i].w; if (r <= 0) break; }
      const pick = cand.splice(i, 1)[0].p;
      setRole(pick, "air", team); pick.merit = 0;
      const pawn = pawnOf(pick.slot);
      if (pawn && pawn.IsAlive()) deploy(pick, pawn);
      toast(pick, "Posted to the aerodrome!", 4);
    }
  }
}

// ------------------------------------------------------------------ deploy: loadout + teleport
function equip(p, pawn) {
  try { pawn.DestroyWeapons(); } catch (e) {}
  pawn.GiveNamedItem("weapon_knife", false);
  const team = pawn.GetTeamNumber();
  if (p.role !== "air") pawn.GiveNamedItem(CONFIG.INF_PISTOL[team] || "weapon_p250", false);
  if (p.role === "infantry") {
    pawn.GiveNamedItem(CONFIG.INF_RIFLE[team] || "weapon_ssg08", true);
    pawn.SetArmor(CONFIG.INF_ARMOR); pawn.SetHasHelmet(false);
  } else {
    pawn.SetArmor(100); pawn.SetHasHelmet(true);
  }
  p.upgraded = false;
}
function pickTrench(team, pawn) {
  const list = points.trench[team];
  if (!list || !list.length) return undefined;
  let best, bestScore = -1e9;
  for (const s of list) {
    let crowd = 0;
    for (const q of players.values()) {
      if (q.team !== team || q.role !== "infantry" || !q.deployed) continue;
      const qp = pawnOf(q.slot);
      if (!qp || !qp.IsAlive() || qp === pawn) continue;
      const d = dist2(qp.GetAbsOrigin(), s.pos); if (d < 300) crowd += (300 - d);
    }
    const score = -crowd - s.used * 40 + Math.random() * 60;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  best.used++;
  return best;
}
function deploy(p, pawn) {
  const team = pawn.GetTeamNumber();
  equip(p, pawn);
  let dest;
  if (p.role === "mortar") {
    // don't man a tube alone while another crew is also one short: join them
    const mine = crews[team][p.crew];
    if (mine && (mine.a < 0 || mine.b < 0)) {
      for (let k = 0; k < crews[team].length; k++) {
        const c = crews[team][k];
        if (k === p.crew || !((c.a < 0) !== (c.b < 0))) continue;
        leaveSeat(p);
        if (c.a < 0) { c.a = p.slot; p.seat = "a"; } else { c.b = p.slot; p.seat = "b"; }
        p.crew = k; break;
      }
    }
    dest = (p.seat === "a" ? points.seatA : points.seatB)[team][p.crew];
  }
  else if (p.role === "air") { const l = points.plane[team]; dest = l.length ? l[Math.floor(Math.random() * l.length)] : undefined; }
  if (!dest) dest = pickTrench(team, pawn);
  if (dest) {
    pawn.Teleport({ position: v3(dest.pos.x, dest.pos.y, dest.pos.z + 4), angles: dest.ang, velocity: v3(0, 0, 0) });
    try { pawn.SetEyeAngles(dest.ang); } catch (e) {}
  }
  p.deployed = true;
  if (p.role === "air" && !startFlight(p, pawn, dest)) { setRole(p, "infantry", team); deploy(p, pawn); return; }
  const sub = p.role === "infantry" ? "Hold the fire trench. Dressing stations heal you." :
              p.role === "mortar" ? "Crew " + (p.crew + 1) + ": plot at the table, fetch bombs, load and fire." :
              "Mouse aim, A/D roll, W/S throttle, LMB guns, RMB bomb, E view. " + p.lives + " lives.";
  banner(p, ROLE_NAME[p.role], sub, 5);
}

// ------------------------------------------------------------------ aircraft (arcade, mouse aim)
const bombs = [];
function vadd(a, b, k) { return v3(a.x + b.x * k, a.y + b.y * k, a.z + b.z * k); }
function vlen(a) { return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z); }
function vnorm(a) { const l = vlen(a) || 1; return v3(a.x / l, a.y / l, a.z / l); }
function vdot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function dirOf(ang) {
  const p = ang.pitch * Math.PI / 180, y = ang.yaw * Math.PI / 180;
  return v3(Math.cos(p) * Math.cos(y), Math.cos(p) * Math.sin(y), -Math.sin(p));
}
function turnToward(f, d, maxRad) {
  // heading and climb steered separately (no flips through the vertical); climb limited to +-75 degrees
  const yaw = Math.atan2(f.y, f.x), pit = Math.asin(Math.max(-1, Math.min(1, f.z)));
  const yd = Math.atan2(d.y, d.x), pd = Math.max(-1.31, Math.min(1.31, Math.asin(Math.max(-1, Math.min(1, d.z)))));
  let dy = yd - yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  const ny = yaw + Math.max(-maxRad, Math.min(maxRad, dy));
  const np = pit + Math.max(-maxRad * 0.8, Math.min(maxRad * 0.8, pd - pit));
  return v3(Math.cos(np) * Math.cos(ny), Math.cos(np) * Math.sin(ny), Math.sin(np));
}
function planeOfEntity(e) {
  if (!e || !points) return undefined;
  let nm = ""; try { nm = e.GetEntityName(); } catch (err) { return undefined; }
  if (!nm.startsWith("tw_plane_")) return undefined;
  for (const team of [T, CT]) for (const a of points.aircraft[team] || []) if (a.ent === e || a.ent.GetEntityName() === nm) return a;
  return undefined;
}
function startFlight(p, pawn, dest) {
  const team = pawn.GetTeamNumber();
  const list = (points.aircraft[team] || []).filter(a => live(a.ent));
  const ac = list.find(a => a.pilot === p.slot) || list.find(a => a.pilot < 0);
  if (!ac) { toast(p, "No aircraft free - back to the trenches", 4); return false; }
  ac.pilot = p.slot;
  const A = CONFIG.AIR;
  const base = dest ? dest.pos : ac.park;
  const f = v3(team === CT ? -1 : 1, 0, 0);
  p.air = { ac, pos: v3(base.x, base.y, base.z + A.SPAWN_ALT), f, speed: A.V_CRUISE * 0.9, throttle: 0.7, bank: 0, yawRate: 0,
            nextGun: 0, bombs: A.BOMBS, rearmAt: 0, lastHitBy: -1, lastHitAt: -99, warned: 0, ammo: A.GUN_AMMO, reloadAt: 0,
            view: A.VIEW_DEFAULT, cam: undefined, camParent: undefined };
  try { pawn.DestroyWeapons(); pawn.GiveNamedItem("weapon_knife", false); } catch (e) {}
  try { pawn.SetMoveType(CSMoveType.NONE); } catch (e) {}
  try { pawn.SetEyeAngles({ pitch: 0, yaw: team === CT ? 180 : 0, roll: 0 }); } catch (e) {}
  placePlane(p, pawn, true);
  setView(p, pawn);
  const nm = ac.ent.GetEntityName(), tg = nm.slice("tw_plane_".length);
  for (const k of ["eng", "gun"]) fire("tw_plane_" + k + "_" + tg, "SetSourceEntity", nm);
  fire("tw_plane_eng_" + tg, "StartSound", undefined, 0.05);
  return true;
}
function endFlight(p, pawn, crashed) {
  const a = p.air; if (!a) return;
  p.air = undefined;
  if (crashed) impact({ team: p.team, k: -1, firerSlot: a.lastHitBy >= 0 && now() - a.lastHitAt < CONFIG.AIR.CRASH_CREDIT ? a.lastHitBy : p.slot,
                        x: a.pos.x, y: a.pos.y, z: a.pos.z, radius: 260, damage: 60 });
  if (live(a.ac.ent)) {
    fire("tw_plane_eng_" + a.ac.ent.GetEntityName().slice("tw_plane_".length), "StopSound");
    a.ac.ent.Teleport({ position: a.ac.park, angles: a.ac.parkAng, velocity: v3(0, 0, 0) });
  }
  a.ac.pilot = -1;
  hClass(p, "tw_fly", "show", false);
  if (pawn && live(pawn)) {
    try { const cam = pawn.GetCustomCamera(); if (cam) { cam.SetMode(CustomCameraMode.DISABLED); if (a.camParent) cam.SetParent(a.camParent); } } catch (e) {}
    try { if (pawn.IsAlive()) pawn.SetMoveType(CSMoveType.WALK); } catch (e) {}
  }
}
function placePlane(p, pawn, snap) {
  const a = p.air, A = CONFIG.AIR, f = a.f;
  const yaw = Math.atan2(f.y, f.x) * 180 / Math.PI, pitch = Math.asin(Math.max(-1, Math.min(1, f.z))) * 180 / Math.PI;
  const ang = { pitch: pitch, yaw: yaw + A.MODEL_YAW, roll: A.ROLL_SIGN * a.bank };
  const vel = v3(f.x * a.speed, f.y * a.speed, f.z * a.speed);
  if (snap) a.ac.ent.Teleport({ position: a.pos, angles: ang, velocity: vel });
  else a.ac.ent.Move({ position: a.pos, angles: ang, velocity: vel });
  const B = planeBasis(a);
  const hp = vadd(vadd(a.pos, f, -A.PILOT.back), B.u, A.PILOT.up);
  if (snap) pawn.Teleport({ position: hp, velocity: vel }); else pawn.Move({ position: hp, velocity: vel });
}
function crashPilot(p, pawn) {
  const a = p.air;
  const killer = a.lastHitBy >= 0 && now() - a.lastHitAt < CONFIG.AIR.CRASH_CREDIT ? pawnOf(a.lastHitBy) : undefined;
  endFlight(p, pawn, true);
  try { pawn.TakeDamage({ damage: 1000, damageTypes: CSDamageTypes.BLAST, attacker: killer || pawn, inflictor: killer || pawn }); } catch (e) {}
}
function hitPilot(ac, damage, attackerPawn) {
  if (!ac || ac.pilot < 0) return;
  const vp = pawnOf(ac.pilot); const p = players.get(ac.pilot);
  if (!vp || !vp.IsAlive() || !p || !p.air) return;
  if (attackerPawn && attackerPawn.GetTeamNumber() === vp.GetTeamNumber()) return;
  const as = attackerPawn ? slotOfPawn(attackerPawn) : -1;
  if (as >= 0) { p.air.lastHitBy = as; p.air.lastHitAt = now(); }
  try { vp.TakeDamage({ damage, attacker: attackerPawn, inflictor: attackerPawn }); } catch (e) {}
}
function tickAir(p, pawn, dt, pressed, held) {
  const a = p.air, A = CONFIG.AIR, t = now();
  if (!live(a.ac.ent)) { endFlight(p, pawn, false); return ""; }
  if (held & CSInputs.FORWARD) a.throttle = Math.min(1, a.throttle + A.ACCEL * dt);
  if (held & CSInputs.BACK) a.throttle = Math.max(0, a.throttle - A.ACCEL * dt);
  // desired direction: where the pilot looks, pulled back toward the front when leaving the box
  let d = dirOf(pawn.GetEyeAngles());
  let prompt = "";
  const out = Math.max(Math.abs(a.pos.x) - A.BOX_X, Math.abs(a.pos.y) - A.BOX_Y, 0);
  if (out > 0) {
    const c = vnorm(v3(-a.pos.x, -a.pos.y, 0)), h = vnorm(vadd(v3(d.x, d.y, 0), c, 2 + out / 200));
    const pz = Math.max(-0.17, Math.min(0.34, d.z)), ph = Math.sqrt(1 - pz * pz);
    d = v3(h.x * ph, h.y * ph, pz); prompt = "Leaving the front - turning back";
  }
  if (a.pos.z > A.ALT_MAX) { d = vnorm(v3(d.x, d.y, Math.min(d.z, -0.2))); prompt = "Too high - engine starving"; }
  if (a.speed < A.V_STALL) { d = vnorm(v3(d.x, d.y, Math.min(d.z, -0.5))); prompt = "STALL - nose down"; }
  const gz = groundZ(a.pos.x, a.pos.y);
  if (a.pos.z - gz < 260 && d.z < 0.15) { d = vnorm(v3(d.x, d.y, 0.15)); if (!prompt) prompt = "PULL UP"; }
  // roll: A/D bank the wings (left = negative); banking into the mouse turn tightens it, a held bank turns on its own
  const rollIn = out > 0 ? 0 : ((held & CSInputs.RIGHT) ? 1 : 0) - ((held & CSInputs.LEFT) ? 1 : 0);
  const k = Math.max(A.TURN_SLOW, Math.min(1.15, a.speed / A.V_CRUISE));
  const hd = Math.atan2(d.y, d.x) - Math.atan2(a.f.y, a.f.x);
  const want = Math.atan2(Math.sin(hd), Math.cos(hd));                        // + = target to the left
  const sb = Math.sin(a.bank * Math.PI / 180);
  const into = Math.max(0, -Math.sign(want) * sb);                            // right bank (+) helps right turns (want < 0)
  const f0 = a.f;
  a.f = turnToward(a.f, d, A.TURN * k * (1 + A.BANK_BOOST * into + (out > 0 ? 1 : 0)) * Math.PI / 180 * dt);
  if (out <= 0 && (rollIn !== 0 || Math.abs(a.bank) > 30)) {
    const yr = -A.BANK_YAW * k * sb * Math.PI / 180 * dt;                       // coordinated turn from the bank alone
    const c = Math.cos(yr), sn = Math.sin(yr);
    a.f = vnorm(v3(a.f.x * c - a.f.y * sn, a.f.x * sn + a.f.y * c, a.f.z));
  }
  const yaw0 = Math.atan2(f0.y, f0.x), yaw1 = Math.atan2(a.f.y, a.f.x);
  let dy = yaw1 - yaw0; if (dy > Math.PI) dy -= 2 * Math.PI; if (dy < -Math.PI) dy += 2 * Math.PI;
  a.yawRate = a.yawRate * 0.85 + (dy / Math.max(dt, 1e-3)) * 0.15;
  if (rollIn !== 0) a.bank = Math.max(-A.ROLL_MAX, Math.min(A.ROLL_MAX, a.bank + rollIn * A.ROLL_RATE * dt));
  else {
    const bankT = Math.max(-A.BANK_MAX, Math.min(A.BANK_MAX, -a.yawRate * 180 / Math.PI * 0.9));
    a.bank += (bankT - a.bank) * Math.min(1, dt * 2.5);
  }
  // speed: throttle target, gravity along the flight path
  const target = A.V_MIN + (A.V_MAX - A.V_MIN) * a.throttle;
  a.speed += (target - a.speed) * Math.min(1, dt * 0.6) - A.DIVE_GAIN * a.f.z * dt;
  a.speed = Math.max(A.V_STALL * 0.7, Math.min(A.V_MAX * 1.25, a.speed));
  // ground avoidance: below the floor height the nose is lifted directly
  if (a.pos.z - gz < 200 && a.f.z < 0.12) a.f = vnorm(v3(a.f.x, a.f.y, Math.min(0.12, a.f.z + 2.5 * dt)));
  const np = vadd(a.pos, a.f, a.speed * dt);
  np.x = Math.max(-A.BOX_X - 600, Math.min(A.BOX_X + 600, np.x)); np.y = Math.max(-A.BOX_Y - 600, Math.min(A.BOX_Y + 600, np.y));
  // collision with the world along the step, or the ground
  const tr = Instance.TraceLine({ start: a.pos, end: np, ignoreEntity: [a.ac.ent, pawn], ignorePlayers: true });
  if ((tr && tr.didHit && !tr.startedInSolid) || np.z < gz + A.ALT_MIN * 0.25) { crashPilot(p, pawn); return ""; }
  a.pos = np;
  placePlane(p, pawn, false);
  if (a.view === "cockpit") { const cam = a.cam; if (cam && live(cam)) { try { cam.Move({ position: cockpitPos(a) }); } catch (e) {} } }
  // guns (belt; a short re-arm when empty)
  if (a.ammo <= 0 && t >= a.reloadAt) { a.ammo = A.GUN_AMMO; }
  if ((held & CSInputs.ATTACK) && t >= a.nextGun && a.ammo > 0) {
    a.nextGun = t + A.GUN_INTERVAL;
    if (--a.ammo <= 0) { a.reloadAt = t + A.GUN_RELOAD; toast(p, "Belt empty - re-arming", 2); }
    if ((a.ammo % 3) === 0) fire("tw_plane_gun_" + a.ac.ent.GetEntityName().slice("tw_plane_".length), "StartSound");
    const s = v3(a.pos.x + a.f.x * A.GUN_FROM, a.pos.y + a.f.y * A.GUN_FROM, a.pos.z + 40 + a.f.z * A.GUN_FROM);
    const dir = vnorm(v3(a.f.x + gauss() * A.GUN_SPREAD, a.f.y + gauss() * A.GUN_SPREAD, a.f.z + gauss() * A.GUN_SPREAD));
    const g = Instance.TraceLine({ start: s, end: vadd(s, dir, A.GUN_RANGE), ignoreEntity: [a.ac.ent, pawn], traceHitboxes: true });
    if (g && g.didHit && g.hitEntity) {
      const he = g.hitEntity;
      const ac = planeOfEntity(he);
      if (ac) hitPilot(ac, A.GUN_DAMAGE * 1.5, pawn);
      else {
        const hp = toPawn(he);
        if (hp && hp.IsAlive() && hp.GetTeamNumber() !== pawn.GetTeamNumber()) { try { hp.TakeDamage({ damage: A.GUN_DAMAGE, attacker: pawn, inflictor: pawn }); } catch (e) {} }
      }
    }
  }
  // bombs
  if (a.bombs < A.BOMBS && t >= a.rearmAt) { a.bombs++; a.rearmAt = t + A.BOMB_REARM; }
  if ((pressed & CSInputs.ATTACK2) && a.bombs > 0) {
    a.bombs--; if (a.rearmAt < t) a.rearmAt = t + A.BOMB_REARM;
    bombs.push({ pos: v3(a.pos.x, a.pos.y, a.pos.z - 20), vel: v3(a.f.x * a.speed, a.f.y * a.speed, a.f.z * a.speed), team: pawn.GetTeamNumber(), slot: p.slot });
    toast(p, "Bomb away!", 1.5);
  }
  drawFlight(p, a, gz);
  return prompt;
}
function planeBasis(a) {
  const f = a.f;
  let r = v3(f.y, -f.x, 0); const rl = vlen(r);
  r = rl < 1e-3 ? v3(0, -1, 0) : v3(r.x / rl, r.y / rl, 0);
  const u = v3(r.y * f.z - r.z * f.y, r.z * f.x - r.x * f.z, r.x * f.y - r.y * f.x);
  const b = a.bank * Math.PI / 180, c = Math.cos(b), s = Math.sin(b);
  return { f, r: vadd(v3(r.x * c, r.y * c, r.z * c), u, -s), u: vadd(v3(u.x * c, u.y * c, u.z * c), r, s) };
}
function cockpitPos(a) {
  const B = planeBasis(a), C = CONFIG.AIR.COCKPIT;
  return vadd(vadd(a.pos, B.f, -C.back), B.u, C.up);
}
function setView(p, pawn) {
  const a = p.air, A = CONFIG.AIR;
  let cam; try { cam = pawn.GetCustomCamera(); } catch (e) {}
  if (!cam) return;
  a.cam = cam;
  try {
    if (a.view === "cockpit") {
      if (a.camParent === undefined) { try { a.camParent = cam.GetParent() || null; cam.SetParent(undefined); } catch (e) { a.camParent = null; } }
      cam.Teleport({ position: cockpitPos(a) });
      cam.SetMode(CustomCameraMode.CONTROLLED_POSITION);
    } else {
      cam.SetFollowConfig({ followEntity: a.ac.ent, followOffset: A.CAM_FOLLOW, cameraOffset: A.CAM_OFFSET, clipCameraOffset: true, cameraOffsetReturnStrength: 0.2 });
      cam.SetMode(CustomCameraMode.FOLLOW_POSITION);
    }
  } catch (e) {}
}
const NEEDLE = (deg) => "a" + (((Math.round(deg / 5) % 72) + 72) % 72);
function drawFlight(p, a, gz) {
  const A = CONFIG.AIR, t = now();
  const kmh = a.speed * 0.0254 * 3.6, altm = Math.max(0, (a.pos.z - gz) * 0.0254);
  const hdg = ((Math.atan2(a.f.x, a.f.y) * 180 / Math.PI) + 360) % 360;   // north = +y
  hClass(p, "tw_fly", "show", true);
  hClass(p, "tw_status", "show", false);
  hSwap(p, "tw_n_asi", "rot", NEEDLE(-150 + 300 * Math.min(1, kmh / 300)));
  hSwap(p, "tw_n_alt", "rot", NEEDLE((altm % 1000) / 1000 * 360));
  hSwap(p, "tw_n_rpm", "rot", NEEDLE(-150 + 300 * (0.25 + 0.75 * a.throttle)));
  hSwap(p, "tw_card", "rot", NEEDLE(-hdg));
  hSwap(p, "tw_n_bank", "rot", NEEDLE(a.bank));
  hText(p, "tw_alt_drum", String(Math.floor(altm / 1000)) + " " + String(Math.floor(altm % 1000 / 100)));
  hText(p, "tw_hdg_txt", ("00" + Math.round(hdg) % 360).slice(-3));
  hText(p, "tw_ammo_txt", ("000" + Math.max(0, a.ammo)).slice(-4));
  hClass(p, "tw_bomb1", "on", a.bombs >= 1); hClass(p, "tw_bomb2", "on", a.bombs >= 2);
  hText(p, "tw_fly_info", "LIVES " + p.lives + "   KILLS " + p.kills + (a.ammo <= 0 ? "   RE-ARMING " + Math.max(0, a.reloadAt - t).toFixed(0) : "") +
        (a.bombs < A.BOMBS ? "   BOMB " + Math.max(0, a.rearmAt - t).toFixed(0) + "s" : ""));
}
// upgraded infantry can swap between the streak weapon and their scoped rifle (WALK + USE, or !swap); ammo carries over
function swapRifle(p, pawn) {
  if (!p.upgraded || p.role !== "infantry" || now() < (p.swapAt || 0)) return;
  const team = pawn.GetTeamNumber(), base = CONFIG.INF_RIFLE[team], up = CONFIG.UPGRADE[team];
  const have = pawn.FindWeapon(up) ? up : pawn.FindWeapon(base) ? base : undefined;
  if (!have) return;
  const other = have === up ? base : up;
  const w = pawn.FindWeapon(have);
  p.ammo = p.ammo || {};
  try { p.ammo[have] = [w.GetClipAmmo(), w.GetReserveAmmo()]; } catch (e) {}
  try { pawn.DestroyWeapon(w); } catch (e) {}
  if (!pawn.FindWeapon(other)) pawn.GiveNamedItem(other, true);
  const nw = pawn.FindWeapon(other), saved = p.ammo[other];
  if (nw && saved) { try { nw.SetClipAmmo(saved[0]); nw.SetReserveAmmo(saved[1]); } catch (e) {} }
  p.swapAt = now() + 1.5;
  toast(p, (other === up ? CONFIG.UPGRADE_NAME[team] : CONFIG.RIFLE_NAME[team]) + " in hand", 2);
}
// cosmetic shell bursts and dirt showers in no man's land, never near a player
let nextAmbient = 0;
function tickAmbient() {
  const t = now(); if (t < nextAmbient) return;
  nextAmbient = t + CONFIG.AMBIENT_MIN + Math.random() * (CONFIG.AMBIENT_MAX - CONFIG.AMBIENT_MIN);
  for (let tries = 0; tries < 6; tries++) {
    const x = (Math.random() * 2 - 1) * 1250, y = (Math.random() * 2 - 1) * 3200;
    let near = false;
    for (let s = 0; s < 64 && !near; s++) { const pw = pawnOf(s); if (pw && pw.IsAlive() && dist2(pw.GetAbsOrigin(), { x, y }) < CONFIG.AMBIENT_CLEAR) near = true; }
    if (near) continue;
    effects(v3(x, y, groundZ(x, y) + 8), true);
    return;
  }
}
function tickBombs(dt) {
  const A = CONFIG.AIR;
  for (let i = bombs.length - 1; i >= 0; i--) {
    const b = bombs[i];
    b.vel.z -= A.GRAVITY * dt;
    const np = vadd(b.pos, b.vel, dt);
    const tr = Instance.TraceLine({ start: b.pos, end: np, ignorePlayers: true });
    if (tr && tr.didHit) {
      bombs.splice(i, 1);
      impact({ team: b.team, k: -1, firerSlot: b.slot, x: tr.end.x, y: tr.end.y, z: tr.end.z, radius: A.BOMB_RADIUS, damage: A.BOMB_DAMAGE });
    } else if (np.z < -2000) bombs.splice(i, 1);
    else b.pos = np;
  }
}

// ------------------------------------------------------------------ mortars
function pitPos(team, k) { return points.pit[team][k] || (points.seatA[team][k] && points.seatA[team][k].pos); }
function sightToWorld(team, u, v) {
  const E = CONFIG.TARGET_EXT;
  if (team === CT) return { x: v * 2 * E - E, y: u * 2 * E - E };       // enemy (-x) at the top
  return { x: E - v * 2 * E, y: E - u * 2 * E };                        // enemy (+x) at the top
}
function worldToSight(team, x, y) {
  const E = CONFIG.TARGET_EXT;
  if (team === CT) return { u: (y + E) / (2 * E), v: (x + E) / (2 * E) };
  return { u: (E - y) / (2 * E), v: (E - x) / (2 * E) };
}
function stepOf(t) { return Math.max(0, Math.min(CONFIG.TARGET_STEPS - 1, Math.floor(t * CONFIG.TARGET_STEPS))); }
function groundZ(x, y) {
  const tr = Instance.TraceLine({ start: v3(x, y, 3000), end: v3(x, y, -600), ignorePlayers: true });
  return tr && tr.didHit ? tr.end.z : 0;
}
function fireMortar(team, k, firerSlot) {
  const c = crews[team][k];
  if (!c.loaded || !c.target || now() < c.cooldown) return false;
  const pit = pitPos(team, k); if (!pit) return false;
  c.loaded = false; c.cooldown = now() + CONFIG.RELOAD_COOLDOWN;
  const tg = tagOf(team) + "_" + (k + 1);
  fire("tw_launch_snd_" + tg, "StartSound");
  fire("mortar_" + tg, "SetAnimation", CONFIG.MORTAR_FIRE_ANIM);       // your mortar prop_dynamic, if it has a fire animation
  fire("tw_launch_fx_" + tg, "Stop"); fire("tw_launch_fx_" + tg, "Start", undefined, 0.02);
  const d = dist2(pit, c.target);
  const sig = CONFIG.SPREAD_BASE + d * CONFIG.SPREAD_PER_UNIT;
  const x = c.target.x + gauss() * sig, y = c.target.y + gauss() * sig;
  const t = now() + CONFIG.FLIGHT_BASE + d * CONFIG.FLIGHT_PER_UNIT;
  shells.push({ team, k, firerSlot, x, y, t, whistled: false });
  for (const s of [c.a, c.b]) if (s >= 0) toast(P(s), "Shot out! Splash in " + (t - now()).toFixed(1) + "s", 2.5);
  return true;
}
function effects(pos, quiet) {
  const i = (poolIdx++ % CONFIG.POOL) + 1;
  for (const nm of ["tw_boom_fx_", "tw_dirt_fx_", "tw_boom_snd_", "tw_shake_"]) {
    const e = live(Instance.FindEntityByName(nm + i)); if (e) e.Teleport({ position: pos });
  }
  fire("tw_boom_fx_" + i, "Stop"); fire("tw_boom_fx_" + i, "Start", undefined, 0.02);
  fire("tw_dirt_fx_" + i, "Stop"); fire("tw_dirt_fx_" + i, "Start", undefined, 0.02);
  fire("tw_boom_snd_" + i, "StartSound", undefined, 0.02);
  if (!quiet) fire("tw_shake_" + i, "StartShake", undefined, 0.02);
}
function impact(sh) {
  const z = sh.z !== undefined ? sh.z : groundZ(sh.x, sh.y);
  const pos = v3(sh.x, sh.y, z + 8);
  effects(pos, false);
  if (sh.k >= 0) { const c = crews[sh.team][sh.k]; c.impacts.unshift({ x: sh.x, y: sh.y }); if (c.impacts.length > 3) c.impacts.length = 3; }
  const R = sh.radius || CONFIG.SHELL_RADIUS, DMG = sh.damage || CONFIG.SHELL_DAMAGE;
  // damage: credited to whoever fired
  const firer = pawnOf(sh.firerSlot);
  for (let s = 0; s < 64; s++) {
    const pawn = pawnOf(s);
    if (!pawn || !pawn.IsAlive()) continue;
    const team = pawn.GetTeamNumber();
    if (team !== T && team !== CT) continue;
    if (team === sh.team && !CONFIG.FRIENDLY_SPLASH) continue;
    const o = pawn.GetAbsOrigin(); const chest = v3(o.x, o.y, o.z + 40);
    const d = dist3(chest, pos);
    if (d > R) continue;
    let k = Math.pow(1 - d / R, 1.2);
    const tr = Instance.TraceLine({ start: v3(pos.x, pos.y, pos.z + 16), end: chest, ignorePlayers: true });
    if (tr && tr.didHit && tr.fraction < 0.98) k *= CONFIG.TRENCH_COVER;
    const dmg = DMG * k;
    if (dmg < 1) continue;
    try { pawn.TakeDamage({ damage: dmg, damageTypes: CSDamageTypes.BLAST, attacker: firer, inflictor: firer }); } catch (e) {}
  }
}
function tickShells() {
  const t = now();
  for (let i = shells.length - 1; i >= 0; i--) {
    const sh = shells[i];
    if (!sh.whistled && t >= sh.t - 2.0) {
      sh.whistled = true;
      const w = (poolIdx % CONFIG.POOL) + 1;
      const e = live(Instance.FindEntityByName("tw_whistle_snd_" + w));
      if (e) { e.Teleport({ position: v3(sh.x, sh.y, groundZ(sh.x, sh.y) + 300) }); fire("tw_whistle_snd_" + w, "StartSound"); }
    }
    if (t >= sh.t) { shells.splice(i, 1); impact(sh); }
  }
}

function keys(pawn) {
  let k = 0;
  for (const b of [CSInputs.FORWARD, CSInputs.BACK, CSInputs.LEFT, CSInputs.RIGHT, CSInputs.WALK, CSInputs.USE, CSInputs.ATTACK, CSInputs.ATTACK2, CSInputs.JUMP]) {
    try { if (pawn.IsInputPressed(b)) k |= b; } catch (e) {}
  }
  return k;
}
function enterSight(p, pawn) {
  p.inSight = true;
  try { pawn.SetMoveType(CSMoveType.NONE); } catch (e) {}
  pawn.Teleport({ velocity: v3(0, 0, 0) });
  const c = crews[p.team][p.crew];
  if (c.target) { const s = worldToSight(p.team, c.target.x, c.target.y); p.u = s.u; p.v = s.v; }
  hSwap(p, "tw_tmap", "pic", p.team === CT ? "mct" : "mt");
}
function leaveSight(p, pawn) {
  p.inSight = false;
  if (pawn) { try { pawn.SetMoveType(CSMoveType.WALK); } catch (e) {} }
}
function placeMarker(p, id, u, v, on) {
  hClass(p, id, "on", on);
  if (!on) return;
  hSwap(p, id, "x", "x" + stepOf(u));
  hSwap(p, id + "y", "y", "y" + stepOf(v));
}
function gridRef(u, v) { return String.fromCharCode(65 + Math.min(15, Math.floor(u * 16))) + (1 + Math.min(15, Math.floor(v * 16))); }

function tickMortar(p, pawn, dt, pressed, held) {
  const team = p.team, c = crews[team][p.crew];
  if (!c) return "";
  const pos = pawn.GetAbsOrigin();
  const pit = pitPos(team, p.crew);
  const sA = points.seatA[team][p.crew], sB = points.seatB[team][p.crew];
  if (p.inSight) {
    const sp = (held & CSInputs.WALK) ? CONFIG.SIGHT_FINE : CONFIG.SIGHT_SPEED;
    const st = sp * dt / CONFIG.TARGET_STEPS;
    if (held & CSInputs.FORWARD) p.v -= st;
    if (held & CSInputs.BACK) p.v += st;
    if (held & CSInputs.LEFT) p.u -= st;
    if (held & CSInputs.RIGHT) p.u += st;
    p.u = Math.max(0, Math.min(0.9999, p.u)); p.v = Math.max(0, Math.min(0.9999, p.v));
    if (pressed & CSInputs.ATTACK) {
      c.target = sightToWorld(team, p.u, p.v);
      for (const s of [c.a, c.b]) if (s >= 0) toast(P(s), "Target locked: " + gridRef(p.u, p.v), 2);
    }
    if (pressed & CSInputs.JUMP) {
      if (!fireMortar(team, p.crew, p.slot)) toast(p, c.loaded ? (c.target ? "Wait..." : "Lock a target first (MOUSE 1)") : "Tube is empty - fetch a bomb", 2);
    }
    if (pressed & (CSInputs.USE | CSInputs.ATTACK2)) leaveSight(p, pawn);
    return "";
  }
  // the nearest station within reach wins
  const cand = [];
  if (sA) cand.push({ n: "table", d: dist2(pos, sA.pos), r: CONFIG.STATION_RADIUS });
  if (sB) cand.push({ n: "ammo", d: dist2(pos, sB.pos), r: CONFIG.STATION_RADIUS });
  if (pit) cand.push({ n: "tube", d: dist2(pos, pit) - 15, r: 90 });
  let at = ""; let best = 1e9;
  for (const c2 of cand) if (c2.d < c2.r && c2.d < best) { best = c2.d; at = c2.n; }
  if (at === "table") {
    if (pressed & CSInputs.USE) { enterSight(p, pawn); return ""; }
    return "[E] Use the mortar sight";
  }
  if (at === "ammo") {
    if (c.loaded) return "The mortar is already loaded";
    if (p.carrying) return "Carrying a bomb - load it at the mortar";
    if (pressed & CSInputs.USE) { p.carrying = true; toast(p, "Bomb in hand", 1.5); return ""; }
    return "[E] Take a mortar bomb";
  }
  if (at === "tube") {
    if (p.carrying && !c.loaded) {
      if (pressed & CSInputs.USE) { p.carrying = false; c.loaded = true; for (const s of [c.a, c.b]) if (s >= 0) toast(P(s), "Mortar loaded", 2); return ""; }
      return "[E] Load the bomb";
    }
    if (c.loaded && c.target) {
      if (pressed & CSInputs.USE) { fireMortar(team, p.crew, p.slot); return ""; }
      return now() < c.cooldown ? "Clearing the tube..." : "[E] FIRE";
    }
    if (c.loaded) return "Loaded - plot a target at the table";
    return "Tube empty - fetch a bomb from the ammunition box";
  }
  return p.carrying ? "Carrying a bomb" : "";
}

function drawSight(p) {
  const c = crews[p.team][p.crew];
  hClass(p, "tw_target", "show", true);
  placeMarker(p, "tw_ret", p.u, p.v, true);
  if (c.target) { const s = worldToSight(p.team, c.target.x, c.target.y); placeMarker(p, "tw_lock", s.u, s.v, true); }
  else placeMarker(p, "tw_lock", 0, 0, false);
  for (let i = 0; i < 3; i++) {
    const im = c.impacts[i];
    if (im) { const s = worldToSight(p.team, im.x, im.y); placeMarker(p, "tw_imp" + i, s.u, s.v, true); }
    else placeMarker(p, "tw_imp" + i, 0, 0, false);
  }
  const pit = pitPos(p.team, p.crew);
  if (pit) { const s = worldToSight(p.team, pit.x, pit.y); placeMarker(p, "tw_pit", s.u, s.v, true); }
  const w = sightToWorld(p.team, p.u, p.v);
  const range = pit ? dist2(pit, w) : 0;
  hText(p, "tw_t_range", "RANGE  " + Math.round(range * 0.0254) + " m");
  hText(p, "tw_t_grid", "GRID  " + gridRef(p.u, p.v) + (c.target ? "   LOCKED" : ""));
  hText(p, "tw_t_tube", "TUBE  " + (c.loaded ? "LOADED" : "EMPTY") + (now() < c.cooldown ? " (clearing)" : ""));
  hText(p, "tw_t_state", c.loaded && c.target ? "READY - JUMP TO FIRE" : (!c.target ? "PLOT A TARGET" : "AWAITING BOMB"));
}

// ------------------------------------------------------------------ per tick
let lastTick = 0;
function think() {
  const t = now(); const dt = Math.min(0.1, Math.max(0, t - lastTick)); lastTick = t;
  if (!points) loadPoints();
  tickShells();
  tickBombs(dt);
  tickAmbient();
  airCheck();
  for (let s = 0; s < 64; s++) {
    const ctl = Instance.GetPlayerController(s);
    if (!ctl) continue;
    const pawn = live(ctl.GetPlayerPawn());
    const p = P(s);
    if (!pawn || !pawn.IsAlive()) { if (p.air) endFlight(p, pawn, true); if (p.inSight) leaveSight(p, pawn); hClass(p, "tw_target", "show", false); hClass(p, "tw_prompt", "show", false); continue; }
    const team = pawn.GetTeamNumber();
    if (team !== T && team !== CT) continue;
    if (p.team !== team) { leaveSeat(p); p.role = null; p.team = team; p.deployed = false; p.deployAt = t + CONFIG.LOBBY_FIRST; }
    const held = keys(pawn); const pressed = held & ~p.prevKeys; p.prevKeys = held;
    let prompt = "";
    if (!p.deployed) {
      if (!p.role) chooseRole(p, pawn, team);
      hClass(p, "tw_brief", "show", true);
      hText(p, "tw_brief_role", ROLE_NAME[p.role] || "");
      const lines = p.role === "mortar" ? ["Crew " + (p.crew + 1) + " of " + CONFIG.CREWS + ". Plot targets at the map table,", "fetch bombs from the ammunition box,", "load and fire the mortar. Swap jobs freely."]
        : p.role === "air" ? ["Report to the aerodrome.", "Limited lives - then back to the trenches.", ""]
        : ["Hold the fire trench. " + CONFIG.RIFLE_NAME[team] + ", pistol, knife.", CONFIG.STREAK_UPGRADE + " kills without dying earns a " + CONFIG.UPGRADE_NAME[team] + ".", "Dressing stations in the support trench heal you."];
      hText(p, "tw_brief_l1", lines[0]); hText(p, "tw_brief_l2", lines[1]); hText(p, "tw_brief_l3", lines[2]);
      hText(p, "tw_brief_count", "Moving up in " + Math.max(0, p.deployAt - t).toFixed(0) + "s   (chat: !mortar  !infantry  !roles)");
      if (t >= p.deployAt) { hClass(p, "tw_brief", "show", false); p.first = false; deploy(p, pawn); }
      continue;
    }
    if (p.air) {
      const pr = tickAir(p, pawn, dt, pressed, held);
      hText(p, "tw_prompt_text", pr); hClass(p, "tw_prompt", "show", !!pr);
      hClass(p, "tw_toast", "show", t < p.toastUntil); hClass(p, "tw_banner", "show", t < p.bannerUntil);
      continue;
    }
    if (p.role === "infantry" && p.upgraded && (pressed & CSInputs.USE) && (held & CSInputs.WALK)) swapRifle(p, pawn);
    p.healing = false;
    const hp = points.heal[team] || [];
    const o = pawn.GetAbsOrigin();
    for (const h of hp) {
      if (dist2(o, h) < CONFIG.HEAL_RADIUS && Math.abs(o.z - h.z) < 120) {
        p.healing = true;
        const H = pawn.GetHealth();
        p.hacc = (p.hacc || 0) + CONFIG.HEAL_HP_PER_S * dt;
        if (H < 100 && p.hacc >= 1) { const add = Math.floor(p.hacc); p.hacc -= add; pawn.SetHealth(Math.min(100, H + add)); }
        const A = pawn.GetArmor();
        p.aacc = (p.aacc || 0) + CONFIG.HEAL_ARMOR_PER_S * dt;
        if (A < 100 && p.aacc >= 1) { const add = Math.floor(p.aacc); p.aacc -= add; pawn.SetArmor(Math.min(100, A + add)); }
        if (!pawn.HasHelmet()) pawn.SetHasHelmet(true);
        prompt = (H < 100 || A < 100) ? "Dressing station - patching you up" : "Dressing station - fit for duty";
        break;
      }
    }
    if (p.role === "mortar" && p.crew >= 0) {
      const pr = tickMortar(p, pawn, dt, pressed, held);
      if (pr) prompt = pr;
      if (p.inSight) drawSight(p); else hClass(p, "tw_target", "show", false);
    } else {
      if (p.inSight) leaveSight(p, pawn);
      hClass(p, "tw_target", "show", false);
    }
    // HUD: prompt, status, toast, banner
    hText(p, "tw_prompt_text", prompt); hClass(p, "tw_prompt", "show", !!prompt);
    hClass(p, "tw_status", "show", true);
    hText(p, "tw_st_role", ROLE_NAME[p.role] || "");
    if (p.role === "infantry") {
      hText(p, "tw_st_l1", "Rifle: " + (p.upgraded ? CONFIG.UPGRADE_NAME[team] : CONFIG.RIFLE_NAME[team]));
      hText(p, "tw_st_l2", p.upgraded ? "Marksman: upgrade issued" : "Streak " + p.streak + " / " + CONFIG.STREAK_UPGRADE + " for an upgrade");
      hText(p, "tw_st_l3", "Kills: " + p.kills);
    } else if (p.role === "mortar") {
      const c = crews[team][p.crew];
      const mate = c ? (p.seat === "a" ? c.b : c.a) : -1;
      const mn = mate >= 0 ? nameOf(mate) : "none";
      hText(p, "tw_st_l1", "Crew " + (p.crew + 1) + "  -  mate: " + mn);
      hText(p, "tw_st_l2", "Tube: " + (c && c.loaded ? "LOADED" : "empty") + "   Target: " + (c && c.target ? "set" : "none"));
      hText(p, "tw_st_l3", "Mortar kills: " + p.mortarKills + (p.carrying ? "   (bomb in hand)" : ""));
    } else {
      hText(p, "tw_st_l1", "Lives: " + p.lives); hText(p, "tw_st_l2", ""); hText(p, "tw_st_l3", "");
    }
    hClass(p, "tw_toast", "show", t < p.toastUntil);
    hClass(p, "tw_banner", "show", t < p.bannerUntil);
  }
  Instance.SetNextThink(t);
}

// ------------------------------------------------------------------ events
Instance.OnActivate(() => {
  for (const c of CONFIG.CVARS) Instance.ServerCommand(c);
  points = null; lastTick = now();
  Instance.SetThink(think);
  Instance.SetNextThink(now());
});
Instance.OnRoundStart(() => {
  points = null; shells.length = 0; bombs.length = 0;
  for (const p of players.values()) p.air = undefined;
  for (const team of [T, CT]) for (const c of crews[team]) { c.loaded = false; c.target = null; c.impacts = []; c.cooldown = 0; }
  for (const p of players.values()) { p.deployed = false; p.deployAt = now() + CONFIG.LOBBY_RESPAWN; p.inSight = false; p.carrying = false; }
  hudEnt = undefined;
  for (const p of players.values()) p.hud.clear();
  Instance.SetThink(think); Instance.SetNextThink(now());
});
Instance.OnPlayerReset(({ player }) => {
  const pawn = live(player); if (!pawn) return;
  const s = slotOfPawn(pawn); if (s < 0) return;
  const p = P(s);
  p.deployed = false; p.inSight = false; p.carrying = false;
  p.deployAt = now() + (p.first ? CONFIG.LOBBY_FIRST : CONFIG.LOBBY_RESPAWN);
  const team = pawn.GetTeamNumber();
  if (team === T || team === CT) {
    if (p.team !== team) { leaveSeat(p); p.role = null; p.team = team; }
    chooseRole(p, pawn, team);
  }
});
Instance.OnPlayerDisconnect(({ playerSlot }) => {
  const p = players.get(playerSlot);
  if (p) { leaveSeat(p); players.delete(playerSlot); }
});
Instance.OnPlayerKill(({ player, attacker }) => {
  const victim = live(player); if (!victim) return;
  const vs = slotOfPawn(victim); const vp = vs >= 0 ? P(vs) : undefined;
  if (vp) {
    vp.streak = 0; vp.upgraded = false; vp.carrying = false; vp.ammo = {};
    if (vp.inSight) leaveSight(vp, victim);
    if (vp.role === "air") { vp.lives--; if (vp.lives <= 0) toast(vp, "Shot down - back to the ground war", 4); }
  }
  const ap = toPawn(attacker); if (!ap || ap === victim) return;
  const as = slotOfPawn(ap); if (as < 0) return;
  const a = P(as);
  if (ap.GetTeamNumber() === victim.GetTeamNumber()) return;
  a.kills++; a.streak++; a.merit++;
  if (a.role === "mortar") { a.mortarKills++; toast(a, "Direct hit!", 2); }
  if (a.role === "infantry" && !a.upgraded && a.streak >= CONFIG.STREAK_UPGRADE && ap.IsAlive()) {
    const team = ap.GetTeamNumber();
    const w = CONFIG.UPGRADE[team];
    const old = ap.FindWeapon(CONFIG.INF_RIFLE[team]); if (old) { try { ap.DestroyWeapon(old); } catch (e) {} }
    if (w && !ap.FindWeapon(w)) ap.GiveNamedItem(w, true);
    a.upgraded = true; a.ammo = {};
    toast(a, CONFIG.UPGRADE_NAME[team] + " issued for your streak!  (SHIFT+E or !swap: back to the " + CONFIG.RIFLE_NAME[team] + ")", 5);
  }
});
Instance.OnBulletImpact(({ weapon, hitEntity }) => {
  const ac = planeOfEntity(hitEntity); if (!ac) return;
  let owner; try { owner = toPawn(weapon.GetOwner()); } catch (e) {}
  let dmg = 30; try { const d = weapon.GetData(); if (d) dmg = d.GetDamage() || 30; } catch (e) {}
  hitPilot(ac, Math.max(CONFIG.AIR.HIT_MIN, dmg * CONFIG.AIR.HIT_SCALE), owner);
});
Instance.OnPlayerChat(({ player, text }) => {
  if (!player) return;
  const s = player.GetPlayerSlot(); const p = P(s);
  const t = String(text || "").trim().toLowerCase();
  if (t === "!mortar" || t === "!artillery") { p.pref = "mortar"; toast(p, "You'll join a mortar crew when you next deploy (if a seat is free)", 4); }
  else if (t === "!infantry" || t === "!rifle") { p.pref = "infantry"; toast(p, "You'll go to the fire trench when you next deploy", 4); }
  else if (t === "!air" || t === "!pilot") { p.pref = "air"; toast(p, CONFIG.AIR_ENABLED ? "You're more likely to be posted to the aerodrome" : "No aircraft yet - noted for later", 4); }
  else if (t === "!swap") { const pw = toPawn(player); if (pw && pw.IsAlive()) swapRifle(p, pw); }
  else if (t === "!random") { p.pref = ""; toast(p, "Roles will be chosen for you", 3); }
  else if (t === "!roles") {
    const cnt = (team, r) => { let n = 0; for (const q of players.values()) if (q.team === team && q.role === r) n++; return n; };
    toast(p, "Infantry " + cnt(p.team, "infantry") + "  Mortar " + cnt(p.team, "mortar") + "/" + (CONFIG.CREWS * 2) + (CONFIG.AIR_ENABLED ? "  Air " + cnt(p.team, "air") : ""), 4);
  }
});
