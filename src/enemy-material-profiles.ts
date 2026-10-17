import type {EnemyKind} from './enemy-kinds';

/** Authored surface palettes in sRGB. Anatomy masks determine where each finish
 * belongs; variation never chooses the creature's markings or material layout. */
export type EnemySurfaceProfile={family:'chitin'|'hide'|'dragon'|'spectral'|'capsule'|'armor'|'rift'|'mineral';shell:number;secondary:number;edge:number;membrane:number;bone:number;metal:number;eye:number;energy:number;roughness:number;metalness:number;scale:number;relief:number;hollow?:boolean;marking?:number;description:string};
const wasp:EnemySurfaceProfile={family:'chitin',shell:0x342b25,secondary:0xac6928,edge:0x987b53,membrane:0x72645a,bone:0xc4ab7a,metal:0x776654,eye:0xff9b39,energy:0xff671d,roughness:.37,metalness:.22,scale:34,relief:.0018,marking:0,description:'Burnt umber cuticle, amber abdominal bands, smoked mica wings with radial veins.'};
const drake:EnemySurfaceProfile={family:'dragon',shell:0x713e35,secondary:0x9a7960,edge:0xaf8261,membrane:0x4e2835,bone:0xd7c5a0,metal:0xa77b3f,eye:0xffb443,energy:0xff762b,roughness:.48,metalness:.10,scale:38,relief:.0025,description:'Overlapping oxblood scales, pale ventral plates, wine membranes and striated ivory horns.'};
const spectral:EnemySurfaceProfile={family:'spectral',shell:0x505973,secondary:0x9b99b4,edge:0xc3b7df,membrane:0x484968,bone:0xd7d9e9,metal:0x8a91b3,eye:0xc8f6ff,energy:0x8f8fff,roughness:.28,metalness:.28,scale:30,relief:.0015,hollow:true,description:'Pearlescent spectral tissue, longitudinal folds and recessed luminous capillaries.'};
const spider:EnemySurfaceProfile={family:'chitin',shell:0x433328,secondary:0x73503b,edge:0xb49b76,membrane:0x49352d,bone:0xb8a47e,metal:0x7e6d53,eye:0xc96332,energy:0xa9ed5b,roughness:.36,metalness:.13,scale:48,relief:.006,marking:1,description:'Chestnut waxed cuticle, overlapping dorsal shields, fine growth striations and recessed copper eyes.'};
const armor:EnemySurfaceProfile={family:'armor',shell:0x3c4b50,secondary:0x454039,edge:0xa3b1ad,membrane:0x424647,bone:0xc5bba2,metal:0x8a8f85,eye:0xffba69,energy:0xff9e41,roughness:.42,metalness:.58,scale:25,relief:.0028,description:'Forged iron armor, directional machining, recessed panel seams and rubbed nickel edges.'};
const capsule:EnemySurfaceProfile={family:'capsule',shell:0x535443,secondary:0x89765b,edge:0xbaa47c,membrane:0x4c4032,bone:0xb6a076,metal:0x887848,eye:0xc4ff84,energy:0x9beb56,roughness:.52,metalness:.05,scale:28,relief:.0026,description:'Leathery olive egg case, longitudinal growth ribs, branching veins and a luminous green seam.'};
export const ENEMY_SURFACE_PROFILES:Partial<Record<EnemyKind,EnemySurfaceProfile>>={
 skull:wasp,
 skull2:{...wasp,shell:0x168e86,secondary:0xf2e5bc,edge:0x9aefe0,membrane:0x8edbe2,bone:0xffefd0,metal:0xd4b45c,eye:0x8affef,energy:0x38e8d3,marking:1,roughness:.30,metalness:.32,scale:29,description:'Turquoise cuticle, ivory abdominal bands and dorsal chevrons, pale cyan wings, gold fittings and luminous mint eyes identify the gem carrier.'},
 skull3:{...drake,family:'hide',shell:0x554355,secondary:0x887185,edge:0xa592a2,membrane:0x56465e,bone:0xc0b4bb,eye:0xe6ad91,roughness:.58,metalness:.06,scale:24,description:'Aubergine dermis, directional tension folds, dry pores and pale scar tissue.'},
 skull4:drake,
 transmuted1:{...wasp,shell:0x767f87,secondary:0xa6a0af,edge:0xd5d9db,membrane:0x839da1,bone:0xd4e2de,eye:0xb6fff1,energy:0x7ee8d7,hollow:true,roughness:.29,description:'Ash pearl cuticle and silver abdominal bands over a cold jade spectral core.'},
 transmuted2:{...wasp,shell:0x525b79,secondary:0x9892ae,edge:0xc6cce0,membrane:0x727ba4,bone:0xd5d9ee,eye:0xddd5ff,energy:0xa0a3ff,hollow:true,metalness:.46,roughness:.27,scale:29,description:'Violet steel scutes, platinum bands, opalescent wing membranes and luminous indigo joints.'},
 transmuted3:spectral,
 transmuted4:{...drake,shell:0x657a7b,secondary:0xa9b7b3,edge:0xd2d9d0,membrane:0x536d79,bone:0xe3e1ce,eye:0xc1fff5,energy:0x80e5da,hollow:true,roughness:.31,metalness:.25,description:'Frosted jade scales, pearl ventral armor, spectral blue membranes and bleached horns.'},
 spider,
 spider2:{...spider,shell:0x253d48,secondary:0x556873,edge:0xb4c3b7,metal:0x819189,eye:0xd98945,roughness:.29,metalness:.42,scale:35,marking:2,description:'Midnight armored carapace, swept ivory horns, reinforced limbs and hooked keratin mandibles.'},
 spiderling:{...spider,shell:0x484834,secondary:0x796548,edge:0xc1ac78,eye:0xb96229,roughness:.43,scale:44,marking:3,description:'Lean olive juvenile cuticle, fine dorsal pigmentation and recessed amber eyes.'},
 egg:capsule,
 egg2:{...capsule,shell:0x334b45,secondary:0x7c8962,edge:0xabb68c,metal:0x7c8e66,roughness:.39,metalness:.23,scale:20,marking:2,description:'Armored malachite egg case, layered scutes, reinforced growth ribs and olive mineral flecks.'},
 centipede:armor,
 gigapede:{...armor,shell:0x655337,secondary:0x5b4b3b,edge:0xc7b37a,metal:0xb59042,bone:0xd4c79a,eye:0xffd18a,roughness:.32,metalness:.75,scale:21,description:'Aged gilded armor, engraved lozenges, dark recesses and worn champagne-gold edges.'},
 ghostpede:{...armor,shell:0x355e5d,secondary:0x557c76,edge:0xb0d2bd,metal:0x729c8e,eye:0xbcffe6,energy:0x65e5be,hollow:true,roughness:.29,metalness:.38,description:'Jade spectral armor, etched silver panels and cold luminous seams along the convoy.'},
 leviathan:{...drake,shell:0x293f50,secondary:0xb4a184,edge:0x9b9c8d,membrane:0x51313d,bone:0xe0ce9d,metal:0xb29354,eye:0xffd27d,scale:54,roughness:.35,metalness:.22,relief:.0023,description:'Blue obsidian scales, broad aged-ivory chest plates, burgundy membranes and old gold fittings.'},
 orb:{...spectral,family:'rift',shell:0x443a65,secondary:0x8a7ea5,edge:0xc4a8d8,metal:0xb2a4ba,eye:0xf3cbff,energy:0xb891ff,scale:24,description:'Amethyst wraith tissue and a polished mineral heart with nested rifts and electrum orbit bands.'},
 thorn:{...armor,family:'mineral',shell:0x343d49,secondary:0x52566a,edge:0xa2a6af,metal:0x7d7164,eye:0xffbe86,energy:0xe89155,roughness:.32,metalness:.35,scale:32,description:'Cleaved volcanic glass, long mineral strata, mica glints and fine ember-colored fracture lines.'},
};
export function enemySurfaceProfile(kind:EnemyKind){const profile=ENEMY_SURFACE_PROFILES[kind];if(!profile)throw Error(`No authored enemy surface for ${kind}`);return profile;}
export const CREATURE_REGIONS={shell:0,secondary:1,wing:2,bone:3,socket:4,eye:5,mouth:6,metal:7} as const;
export function creatureRegion(model:string,label:string){
 if(/Eye_White/i.test(label))return CREATURE_REGIONS.socket;
 if(/Eye_Black/i.test(label)||model==='spider'&&label==='Material.001')return CREATURE_REGIONS.eye;
 if(/Wings/i.test(label))return CREATURE_REGIONS.wing;
 if(/Horn|Teeth/i.test(label))return CREATURE_REGIONS.bone;
 if(/Tongue/i.test(label))return CREATURE_REGIONS.mouth;
 if(/Gold/i.test(label))return CREATURE_REGIONS.metal;
 if(/Secondary/i.test(label))return CREATURE_REGIONS.secondary;
 return CREATURE_REGIONS.shell;
}
