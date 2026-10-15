import {idleInput,type Input} from './simulation';
export type InputCommand={seq:number;input:Input};
export const MAX_PENDING_INPUTS=240;
/** Numbered fixed-duration commands retain holds and edges through jitter.
 * The sender retransmits outstanding commands; duplicates/reordering are safe. */
export class CommandBuffer{
 acknowledged=0;private commands=new Map<number,InputCommand>();
 push(command:InputCommand){if(!Number.isSafeInteger(command.seq)||command.seq<=this.acknowledged||command.seq>this.acknowledged+MAX_PENDING_INPUTS||this.commands.has(command.seq))return false;this.commands.set(command.seq,command);return true;}
 next():InputCommand|null{const command=this.commands.get(this.acknowledged+1);if(!command)return null;this.commands.delete(command.seq);this.acknowledged=command.seq;return command;}
 discardThrough(seq:number){if(!Number.isSafeInteger(seq)||seq<this.acknowledged||seq>this.acknowledged+MAX_PENDING_INPUTS)return false;this.acknowledged=seq;for(const id of this.commands.keys())if(id<=seq)this.commands.delete(id);return true;}
 get size(){return this.commands.size;}
}
export class InputHistory{
 private sequence=0;commands:InputCommand[]=[];
 record(input:Input):InputCommand|null{if(this.commands.length>=MAX_PENDING_INPUTS)return null;const command={seq:++this.sequence,input:{...input}};this.commands.push(command);return command;}
 acknowledge(seq:number){if(!Number.isSafeInteger(seq)||seq<0||seq>this.sequence)return;this.commands=this.commands.filter(c=>c.seq>seq);}
 reset(){this.sequence=0;this.commands=[];}
 get lastSequence(){return this.sequence;}
 get stalled(){return this.commands.length>=MAX_PENDING_INPUTS;}
}

export type InputRun=[seq:number,ticks:number,forward:number,strafe:number,yaw:number,pitch:number,flags:number];
/** Compress unchanged samples on the wire only. The host still consumes one
 * command per tick, so a held stream never turns into a tap during recovery. */
export function inputRuns(commands:InputCommand[]):InputRun[]{
 const runs:InputRun[]=[];
 for(const {seq,input}of commands){const flags=(input.jump?1:0)|(input.fire?2:0)|(input.homing?4:0)|(input.leftArm?8:0)|(input.rightArm?16:0),last=runs.at(-1);
  if(last&&last[0]+last[1]===seq&&last[2]===input.forward&&last[3]===input.strafe&&last[4]===input.yaw&&last[5]===input.pitch&&last[6]===flags)last[1]++;
  else runs.push([seq,1,input.forward,input.strafe,input.yaw,input.pitch,flags]);
 }
 return runs;
}

/** Drain excess host queue without dropping button edges or granting extra
 * authoritative movement ticks. Normal network batching keeps full rate. */
export class InputPacer {
 private credit=0;private buttons=false;queued=0;
 update(queued:number){this.queued=Number.isInteger(queued)?Math.max(0,Math.min(MAX_PENDING_INPUTS,queued)):0;if(this.queued<=6)this.credit=0;}
 next(input:Input=idleInput()){
  const buttons=input.fire||input.homing||input.jump||!!input.leftArm||!!input.rightArm,priority=buttons||this.buttons;this.buttons=buttons;
  // Weapon holds, their releases, and jump edges always retain 120 Hz timing.
  if(priority){this.credit=0;return true;}if(this.queued<=6)return true;this.credit+=this.queued>60?.5:.75;if(this.credit<1)return false;this.credit-=1;return true;}
 reset(){this.credit=0;this.buttons=false;this.queued=0;}
}
