/** Metres at 100%. Camera rotation and gameplay FOV are deliberately untouched. */
export const CAMERA_FEEDBACK={
 defaultIntensity:35,
 maxOffset:.04,
 burst:{duration:.14,strength:.022},
 land:{duration:.18,strength:.028},
 upgrade:{duration:.3,strength:.018},
 impact:{duration:.28,strength:.032,range:22},
 death:{duration:.18,strength:.025},
} as const;
export function feedbackIntensity(value:unknown,fallback:number=CAMERA_FEEDBACK.defaultIntensity):number{
 return typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(100,value)):fallback;
}
