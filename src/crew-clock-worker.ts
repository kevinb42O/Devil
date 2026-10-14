// Worker wake-ups continue when requestAnimationFrame is suspended. Only one
// wake-up may be in flight, so a busy main thread never accumulates timer work.
let pending=false;
globalThis.onmessage=()=>{pending=false;};
setInterval(()=>{if(!pending){pending=true;postMessage(null);}},8);
