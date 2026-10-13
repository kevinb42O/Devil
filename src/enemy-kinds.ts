export const ENEMY_KINDS = ['skull','skull2','skull3','skull4','transmuted1','transmuted2','transmuted3','transmuted4','squid','squid2','squid3','spider','spider2','egg','egg2','spiderling','centipede','gigapede','ghostpede','leviathan','orb','thorn'] as const;
export type EnemyKind = typeof ENEMY_KINDS[number];
export const isSquid=(k:EnemyKind)=>k.startsWith('squid');
export const isSpider=(k:EnemyKind)=>k==='spider'||k==='spider2';
export const isEgg=(k:EnemyKind)=>k==='egg'||k==='egg2';
export const isPede=(k:EnemyKind)=>k==='centipede'||k==='gigapede'||k==='ghostpede';
export const isSkull=(k:EnemyKind)=>k.startsWith('skull')||k.startsWith('transmuted');
export const skullTier=(k:EnemyKind)=>k==='skull'?1:Number(k.slice(-1));
export const ENEMY_STATS:Record<EnemyKind,{hp:number;gems:number;radius:number;death:string}>={
 skull:{hp:1,gems:0,radius:.65,death:'SWARMED'},skull2:{hp:5,gems:1,radius:.8,death:'IMPALED'},skull3:{hp:10,gems:1,radius:.7,death:'GORED'},skull4:{hp:100,gems:0,radius:1.3,death:'OPENED'},
 transmuted1:{hp:10,gems:0,radius:.65,death:'SWARMED'},transmuted2:{hp:20,gems:1,radius:.8,death:'IMPALED'},transmuted3:{hp:100,gems:1,radius:.7,death:'GORED'},transmuted4:{hp:300,gems:0,radius:1.3,death:'OPENED'},
 squid:{hp:10,gems:1,radius:1.3,death:'PURGED'},squid2:{hp:20,gems:2,radius:1.7,death:'DESECRATED'},squid3:{hp:90,gems:3,radius:2,death:'SACRIFICED'},
 spider:{hp:25,gems:1,radius:1.4,death:'INTOXICATED'},spider2:{hp:200,gems:1,radius:2.8,death:'ENVENOMATED'},egg:{hp:3,gems:0,radius:.6,death:'INTOXICATED'},egg2:{hp:3,gems:0,radius:.7,death:'ENVENOMATED'},spiderling:{hp:3,gems:0,radius:.4,death:'INFESTED'},
 centipede:{hp:75,gems:25,radius:1,death:'EVISCERATED'},gigapede:{hp:250,gems:50,radius:1.5,death:'ANNIHILATED'},ghostpede:{hp:500,gems:10,radius:1.6,death:'HAUNTED'},leviathan:{hp:1500,gems:6,radius:4,death:'INCARNATED'},orb:{hp:2400,gems:0,radius:2.4,death:'DISCARNATED'},thorn:{hp:120,gems:0,radius:1.5,death:'ENTANGLED'}
};
