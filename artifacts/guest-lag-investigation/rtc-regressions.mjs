// This machine's headless Chrome cannot resolve local mDNS ICE candidates.
// Expose local candidate addresses only in these local automated test browsers.
import {chromium} from '@playwright/test';
const launch=chromium.launch.bind(chromium);
chromium.launch=options=>launch({...options,args:[...(options?.args??[]),'--disable-features=WebRtcHideLocalIpsWithMdns']});
await import('../../tests/multiplayer-soak-browser.mjs');
await import('../../tests/multiplayer-latency-browser.mjs');
await import('../../tests/multiplayer-large-state-browser.mjs');
