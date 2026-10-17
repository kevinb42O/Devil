/** Each hand has a separately authored bank. Pitch is reserved for tiny take
 * variations; later hands never borrow a previous hand's recording. */
export const weaponTier=(level:number)=>Math.max(1,Math.min(7,Math.round(level)));
export const weaponShots=(level:number)=>{const tier=weaponTier(level);return [`shot${tier}`,...Array.from({length:tier===4?5:4},(_,i)=>`shot${tier}alt${i+1}`)];};
export const weaponBank=(level:number)=>{const tier=weaponTier(level);return [`rapid${tier}`,`seekrapid${tier}`,...weaponShots(tier),`weapon${tier}-start`,`weapon${tier}-stop`,`weapon${tier}-homing`];};
export const WEAPON_SOUNDS=Array.from({length:7},(_,i)=>weaponBank(i+1)).flat();
