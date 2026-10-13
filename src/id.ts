/** getRandomValues also works on plain HTTP LAN origins, where randomUUID is unavailable. */
export function randomId(){return Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');}
