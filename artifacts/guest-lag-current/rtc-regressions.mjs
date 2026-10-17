import {chromium} from '@playwright/test';
const launch=chromium.launch.bind(chromium);chromium.launch=options=>launch({...options,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:[...(options?.args??[]),'--disable-features=WebRtcHideLocalIpsWithMdns']});
await import('../../tests/multiplayer-shooting-browser.mjs');
await import('../../tests/multiplayer-moving-target-browser.mjs');
await import('../../tests/multiplayer-soak-browser.mjs');
await import('../../tests/multiplayer-large-state-browser.mjs');
