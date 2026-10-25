/** Native hands use their actual shotgun variant banks. Extra hands keep the
 * requested layered 1+2, 2+3 and 3+4 recordings. */
export const weaponTier=(level:number)=>Math.max(1,Math.min(7,Math.round(level)));
export const weaponShots=(level:number)=>{const tier=weaponTier(level);return tier<=2?[`shot${tier}`]:tier<=4?Array.from({length:tier===4?5:4},(_,i)=>`shot${tier}alt${i+1}`):[`shot${tier}`,...Array.from({length:4},(_,i)=>`shot${tier}alt${i+1}`)];};
export const weaponBank=(level:number)=>{const tier=weaponTier(level);return [`rapid${tier}`,`seekrapid${tier}`,...weaponShots(tier),`weapon${tier}-homing`];};
export const WEAPON_SOUNDS=Array.from({length:7},(_,i)=>weaponBank(i+1)).flat();
