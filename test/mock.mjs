// Runs src/mg_trenchwarfare.js against a stand-in cs_script API: players (humans + bots) spawning, deploying, mortar crews
// plotting / loading / firing, shells landing and hurting players, kills and respawns, chat. Fails on any thrown error,
// unknown HUD panel, or a CSS class the stylesheet lacks.
// usage: node test/mock.mjs [players=24] [seconds=180]
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const N = +(process.argv[2] || 24), SECONDS = +(process.argv[3] || 180);
let seed = 7; Math.random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const ents = JSON.parse(fs.readFileSync(path.join(root, 'out/entities.json'), 'utf8'));
const xml = fs.readFileSync(path.join(root, 'out/addon/panorama/layout/custom_game/mg_trenchwarfare.xml'), 'utf8');
const css = fs.readFileSync(path.join(root, 'out/addon/panorama/styles/custom_game/mg_trenchwarfare.css'), 'utf8');
const ids = new Set([...xml.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
let time = 0; const stats = { hud: 0, vars: 0, fires: {}, dmg: 0, kills: 0, teleports: 0, impacts: 0, msgs: [] };
const hooks = {};
class Ent {
  constructor(name, cls, pos, ang) { this.name = name; this.cls = cls; this.pos = { ...pos }; this.ang = ang || { pitch: 0, yaw: 0, roll: 0 }; this.valid = true; }
  IsValid() { return this.valid; } GetAbsOrigin() { return { ...this.pos }; } GetAbsAngles() { return { ...this.ang }; }
  GetClassName() { return this.cls; } GetEntityName() { return this.name; }
  Teleport(o) { if (o.position) this.pos = { ...o.position }; if (o.angles) this.ang = { ...o.angles }; stats.teleports++; }
}
const world = new Map();
for (const e of ents) if (e.name) world.set(e.name, new Ent(e.name, e.cls, { x: e.origin[0], y: e.origin[1], z: e.origin[2] }, { pitch: e.angles[0], yaw: e.angles[1], roll: e.angles[2] }));
class Hud extends Ent {
  SetHasClassForPlayer(slot, panel, cls, on) { stats.hud++; if (!ids.has(panel)) throw new Error('unknown panel ' + panel); if (!css.includes('.' + cls)) throw new Error('no css for class ' + cls); }
  SetDialogVariableStringForPlayer(slot, panel, n, v) { stats.vars++; if (!ids.has(panel)) throw new Error('unknown panel ' + panel); if (typeof v !== 'string') throw new Error('bad var'); }
  ResetForPlayer() {}
}
world.set('tw_hud', new Hud('tw_hud', 'custom_hud_layout', { x: 0, y: 0, z: 0 }));
const lobby = ents.filter(e => e.cls.startsWith('info_player'));
const IN = { FORWARD: 1, BACK: 2, LEFT: 4, RIGHT: 8, WALK: 16, DUCK: 32, JUMP: 64, USE: 128, ATTACK: 256, ATTACK2: 512, RELOAD: 1024 };
class Weapon { constructor(n) { this.n = n; this.clip = n === 'weapon_ssg08' ? 10 : 13; this.res = 90; }
  GetClassName() { return this.n; } GetClipAmmo() { return this.clip; } SetClipAmmo(v) { this.clip = v; } GetReserveAmmo() { return this.res; } SetReserveAmmo(v) { this.res = v; } IsValid() { return true; } }
class Pawn extends Ent {
  constructor(ctl) { super('', 'player', { x: 0, y: 0, z: 0 }); this.ctl = ctl; this.hp = 100; this.armor = 0; this.helmet = false; this.weapons = []; this.keys = 0; this.mt = 2; }
  GetPlayerController() { return this.ctl; } GetTeamNumber() { return this.ctl.team; } IsAlive() { return this.hp > 0; }
  GetHealth() { return this.hp; } SetHealth(v) { if (!Number.isInteger(v)) throw new Error('SetHealth non-integer ' + v); this.hp = v; }
  GetArmor() { return this.armor; } SetArmor(v) { if (!Number.isInteger(v)) throw new Error('SetArmor non-integer ' + v); this.armor = v; } HasHelmet() { return this.helmet; } SetHasHelmet(v) { this.helmet = v; }
  IsInputPressed(b) { return (this.keys & b) !== 0; } SetEyeAngles() {} SetMoveType(m) { this.mt = m; }
  DestroyWeapons() { this.weapons = []; } DestroyWeapon(w) { this.weapons = this.weapons.filter(x => x !== w); }
  GiveNamedItem(n) { if (this.weapons.find(w => w.n === n)) throw new Error('duplicate weapon ' + n); this.weapons.push(new Weapon(n)); }
  FindWeapon(n) { return this.weapons.find(w => w.n === n); }
  TakeDamage(d) { if (!(d.damage > 0)) throw new Error('bad damage'); stats.dmg++; this.hp -= Math.round(d.damage); if (this.hp <= 0) { this.hp = 0; die(this, d.attacker); } return d.damage; }
}
class Ctl extends Ent {
  constructor(slot, team, bot) { super('', 'cs_player_controller', { x: 0, y: 0, z: 0 }); this.slot = slot; this.team = team; this.bot = bot; this.pawn = new Pawn(this); }
  GetPlayerSlot() { return this.slot; } GetPlayerPawn() { return this.pawn; } IsBot() { return this.bot; } GetPlayerName() { return 'p' + this.slot; }
}
const ctls = [];
function spawn(c) {
  const sp = lobby.filter(e => (e.cls.endsWith('terrorist') && !e.cls.includes('counter')) === (c.team === 2));
  const e = sp[c.slot % sp.length];
  c.pawn = new Pawn(c); c.pawn.pos = { x: e.origin[0], y: e.origin[1], z: e.origin[2] };
  hooks.reset && hooks.reset({ player: c.pawn });
}
function die(pawn, attacker) {
  stats.kills++;
  hooks.kill && hooks.kill({ player: pawn, attacker });
  const c = pawn.ctl; setTimeout0(2, () => spawn(c));
}
const later = [];
function setTimeout0(dt, fn) { later.push({ at: time + dt, fn }); }
const Instance = {
  Msg: (m) => stats.msgs.push(String(m)), GetGameTime: () => time, SetThink: (f) => { Instance._think = f; }, SetNextThink: (t) => { Instance._next = t; },
  OnActivate: (f) => hooks.activate = f, OnRoundStart: (f) => hooks.round = f, OnPlayerReset: (f) => hooks.reset = f, OnPlayerDisconnect: (f) => hooks.disc = f,
  OnPlayerKill: (f) => hooks.kill = f, OnPlayerChat: (f) => hooks.chat = f,
  FindEntityByName: (n) => world.get(n), GetPlayerController: (s) => ctls[s],
  EntFireAtName: (o) => { stats.fires[o.input] = (stats.fires[o.input] || 0) + 1; if (!world.has(o.name) && !o.name.startsWith('mortar_')) throw new Error('EntFire at missing entity ' + o.name); },
  ServerCommand: () => {}, TraceLine: (o) => ({ didHit: true, fraction: o.start.z > 1000 ? 0.5 : 1.0, end: { x: o.end.x, y: o.end.y, z: 0 } }),
};
// ESM loader shim
const src = fs.readFileSync(path.join(root, 'src/mg_trenchwarfare.js'), 'utf8')
  .replace(/import \{([^}]*)\} from "cs_script\/point_script";/, 'const {$1} = globalThis.__cs;');
globalThis.__cs = { Instance, CSInputs: IN, CSMoveType: { NONE: 0, WALK: 2 }, CSDamageTypes: { BLAST: 64 } };
const tmp = path.join(root, 'test/_run.mjs'); fs.writeFileSync(tmp, src);
await import(tmp);
for (let s = 0; s < N; s++) ctls.push(new Ctl(s, s % 2 ? 3 : 2, s % 3 === 2));
hooks.activate(); hooks.round && hooks.round();
for (const c of ctls) spawn(c);
const DT = 1 / 64;
let fired = 0;
for (let step = 0; step < SECONDS * 64; step++) {
  time += DT;
  for (let i = later.length - 1; i >= 0; i--) if (later[i].at <= time) { const f = later[i].fn; later.splice(i, 1); f(); }
  // drive mortar crews: walk to stations and press keys like a player would
  for (const c of ctls) {
    const p = c.pawn; p.keys = 0;
    if (c.bot || p.hp <= 0) continue;
    const t = c.team === 2 ? 't' : 'ct';
    const near = (n) => world.get(n);
    for (let k = 1; k <= 5; k++) {
      const a = near(`mortarcrew_${t}_${k}_a`).pos, b = near(`mortarcrew_${t}_${k}_b`).pos, pit = near(`mortarpit_${t}_${k}`).pos;
      const d = (q) => Math.hypot(p.pos.x - q.x, p.pos.y - q.y);
      if (d(a) < 60 || d(b) < 60 || d(pit) < 80) {
        const ph = Math.floor(time * 2) % 8;
        if (ph === 0 && p.mt === 0) { p.keys = IN.USE; }
        else if (ph === 0) { p.pos = { ...b }; }
        else if (ph === 1 && d(b) < 60) { p.keys = IN.USE; }
        else if (ph === 2) { p.pos = { ...pit }; }
        else if (ph === 3 && d(pit) < 80) { p.keys = IN.USE; }
        else if (ph === 4) { p.pos = { ...a }; }
        else if (ph === 5 && d(a) < 60) { p.keys = IN.USE; }
        else if (ph === 6 && p.mt === 0) { p.keys = IN.FORWARD | IN.ATTACK; }
        else if (ph === 7 && p.mt === 0) { p.keys = IN.JUMP; fired++; }
        break;
      }
    }
  }
  if (step % 640 === 0) hooks.chat({ player: ctls[1], text: '!mortar', team: 3 });
  // random rifle kills between infantry
  if (step % 97 === 0) {
    const a = ctls[Math.floor(Math.random() * N)], v = ctls[Math.floor(Math.random() * N)];
    if (a.team !== v.team && v.pawn.hp > 0 && a.pawn.hp > 0) v.pawn.TakeDamage({ damage: 150, attacker: a.pawn });
  }
  if (Instance._next !== undefined && Instance._next <= time) { Instance._next = undefined; Instance._think(); }
}
fs.unlinkSync(tmp);
const D = globalThis.__twDebug; const rc = {}; for (const p of D.players.values()) rc[p.team + ':' + p.role] = (rc[p.team + ':' + p.role] || 0) + 1;
console.log('roles', JSON.stringify(rc), 'crews', JSON.stringify(D.crews[3].map(c => [c.a, c.b, c.loaded, !!c.target, c.impacts.length])));
const roles = {}; // count from HUD would need introspection; report activity instead
console.log(JSON.stringify({ hud: stats.hud, vars: stats.vars, fires: stats.fires, dmg: stats.dmg, kills: stats.kills, teleports: stats.teleports, mortarFireAttempts: fired, msgs: stats.msgs.slice(0, 3) }));
