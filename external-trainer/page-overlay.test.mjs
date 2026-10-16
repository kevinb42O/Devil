import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {paintPageOverlay} from './page-overlay.mjs';

const browser=await chromium.launch({headless:true,chromiumSandbox:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
  const page=await browser.newPage();
  await page.setContent('<button style="position:fixed;left:15px;top:15px;width:400px;height:70px" onclick="this.textContent=\'CLICK PASSED\'">Click me</button><input style="position:fixed;top:100px" aria-label="typing">');
  await page.evaluate(paintPageOverlay,{state:{focused:true,candidates:[]},options:{hud_enabled:true},rect:{left:0,top:0,width:1000,height:700}});
  await page.mouse.click(100,40);
  assert.equal(await page.locator('button').textContent(),'CLICK PASSED','click through the painted HUD');
  await page.getByRole('textbox').click();await page.keyboard.type('keyboard works');
  assert.equal(await page.getByRole('textbox').inputValue(),'keyboard works');
  assert.equal(await page.locator('#__abyssTrainerOverlay').evaluate(el=>getComputedStyle(el).pointerEvents),'none');
  console.log('PASS: clicks through painted HUD and normal keyboard input with trainer overlay mounted.');
}finally{await browser.close();}
