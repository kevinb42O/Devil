import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chromium} from '@playwright/test';
import {connectSettingsShortcut} from './settings-shortcut.mjs';

test('settings shortcut works before game attachment and survives navigation', async () => {
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
    const context=await browser.newContext();
    const page=await context.newPage();
    let opens=0;
    await connectSettingsShortcut(context,()=>opens++);
    await page.keyboard.press('=');
    assert.equal(opens,1);
    await page.keyboard.down('=');
    await page.keyboard.down('=');
    await page.keyboard.up('=');
    assert.equal(opens,2,'holding the key must toggle only once');
    await page.keyboard.press('Control+=');
    assert.equal(opens,2,'browser zoom shortcut must be preserved');
    await page.goto('data:text/html,<title>Game loading</title>');
    await page.keyboard.press('=');
    assert.equal(opens,3,'settings must work after navigation without memory attachment');
    await page.keyboard.press('-');
    assert.equal(opens,3);
  } finally {await browser.close();}
});
