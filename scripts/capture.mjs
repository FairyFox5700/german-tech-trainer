import {chromium} from 'file:///C:/Users/tysch/AppData/Local/hermes/skills/creative/linkedin-one-pager/scripts/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:980}});
const page=await context.newPage();
await page.goto('http://127.0.0.1:4173/#/learn',{waitUntil:'networkidle'});
await page.screenshot({path:'artifacts/desktop-learn.png',fullPage:true});
await page.setViewportSize({width:390,height:844});
await page.evaluate(()=>{
  const state=JSON.parse(localStorage.getItem('werkwort.state.v1'));
  state.currentSession={type:'daily',ids:['term-cloud-mandantenfaehigkeit'],index:0,startedAt:new Date().toISOString()};
  localStorage.setItem('werkwort.state.v1',JSON.stringify(state));
});
await page.reload({waitUntil:'networkidle'});
await page.locator('[data-action="reveal"]').click();
console.log(await page.evaluate(()=>({nav:document.querySelector('.bottom-nav').getBoundingClientRect().toJSON(),ratings:document.querySelector('.rating-grid').getBoundingClientRect().toJSON(),card:document.querySelector('.session-card').getBoundingClientRect().toJSON(),scrollHeight:document.documentElement.scrollHeight,viewport:innerHeight})));
await page.screenshot({path:'artifacts/mobile-long-term.png',fullPage:true});
await page.locator('[data-save-id]').click();
await page.evaluate(()=>{
  const state=JSON.parse(localStorage.getItem('werkwort.state.v1'));
  state.currentSession=null;
  localStorage.setItem('werkwort.state.v1',JSON.stringify(state));
});
await page.reload({waitUntil:'networkidle'});
await page.setViewportSize({width:1440,height:980});
await page.screenshot({path:'artifacts/desktop-saved-dashboard.png',fullPage:true});
await browser.close();
console.log('saved desktop, mobile, and saved-dashboard screenshots');
