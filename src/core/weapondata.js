// One weapon data table. The gameplay numbers every view shares (damage, fire rate, magazine, reload, pellets, range, spread) live here;
// the third-person guns (guns.js) and the first-person shooter (weapons.js) each add only what is view-specific (viewmodel pose, recoil, impulse).
// rps = shots per second. The shooter's two sci-fi blasters (Blaster, Repeater) are mini-game weapons and are not in this table.
export const WEAPON_STATS = {
  pistol:  { name: 'Pistol',  dmg: 20, rps: 3.8,  mag: 12, reserve: 48,  reload: 1.0, auto: false, pellets: 1, range: 120, spread: 0.004 },
  rifle:   { name: 'Rifle',   dmg: 14, rps: 9,    mag: 30, reserve: 120, reload: 1.8, auto: true,  pellets: 1, range: 200, spread: 0.01 },
  shotgun: { name: 'Shotgun', dmg: 10, rps: 1.2,  mag: 6,  reserve: 30,  reload: 2.0, auto: false, pellets: 8, range: 50,  spread: 0.05 },
};
