export type ControlScheme='qwerty'|'azerty'|'controller'|'mobile';
export function keyboardMovement(keys:ReadonlySet<string>,scheme:ControlScheme){
 const forward=scheme==='azerty'?'z':'w',left=scheme==='azerty'?'q':'a';
 return {forward:Number(keys.has(forward))-Number(keys.has('s')),strafe:Number(keys.has('d'))-Number(keys.has(left)),jump:keys.has('Space')};
}
// Rescale radially so diagonals retain direction and small stick drift stays idle.
export function stick(x:number,y:number,deadzone:number):[number,number]{
 deadzone=Number.isFinite(deadzone)?Math.max(0,Math.min(.95,deadzone)):.15;
 x=Number.isFinite(x)?x:0;y=Number.isFinite(y)?y:0;
 const length=Math.hypot(x,y);if(length<=deadzone)return [0,0];
 const scale=(Math.min(1,length)-deadzone)/(1-deadzone)/length;
 return [x*scale,y*scale];
}
export function controllerState(pad:Pick<Gamepad,'axes'|'buttons'>,deadzone:number){
 const held=(i:number)=>!!pad.buttons[i]&&(pad.buttons[i].pressed||pad.buttons[i].value>.5);
 const [strafe,vertical]=stick(pad.axes[0]??0,pad.axes[1]??0,deadzone);
 const [lookX,lookY]=stick(pad.axes[2]??0,pad.axes[3]??0,deadzone);
 return {forward:-vertical,strafe,lookX,lookY,jump:held(0),action:held(2),fire:held(7),homing:held(6),leftShoulder:held(4),rightShoulder:held(5),pause:held(9),back:held(1),up:held(12),down:held(13),left:held(14),right:held(15),descend:held(4),fast:held(10)};
}

/** Hold either arm independently; physical key codes are deliberately avoided
 * because AZERTY and QWERTY expose different printed letters. */
export function courtyardEmotes(keys:ReadonlySet<string>,scheme:ControlScheme,leftShoulder=false,rightShoulder=false){
 return {leftArm:scheme==='controller'?leftShoulder:scheme==='azerty'?keys.has('a'):scheme==='qwerty'&&keys.has('q'),rightArm:scheme==='controller'?rightShoulder:(scheme==='azerty'||scheme==='qwerty')&&keys.has('e')};
}
