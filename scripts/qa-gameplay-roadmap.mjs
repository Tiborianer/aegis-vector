import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const {chromium} = createRequire(import.meta.url)('playwright');
const origin = process.env.AEGIS_LOCAL_ORIGIN || 'http://127.0.0.1:4213';
assert(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
const out=path.resolve(process.argv[2] || 'outputs/gameplay-roadmap');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows']});
const errors=[];
async function flight(mission, extra='', reduced=false) {
  const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:reduced?'reduce':'no-preference'});
  page.on('pageerror', e=>errors.push(e.message));
  await page.goto(origin+'/?lab=1&mission='+mission+'&loadout=starter&god=1&quality=high'+extra);
  await page.waitForFunction(()=>window.__AEGIS_DEBUG__?.getState().mode==='playing',null,{timeout:60000});
  await page.evaluate(async()=>{
    // Use the development scene already running inside the product. Freeze the
    // render clock so identical keyboard input produces comparable pictures.
    const url=performance.getEntriesByType('resource').filter(e=>e.name.includes('/scenes/BattleScene.ts')).at(-1).name;
    const {BattleScene}=await import(url);
    const snapshot=BattleScene.prototype.teamSnapshot;
    BattleScene.prototype.teamSnapshot=function(){window.flight=this;return snapshot.call(this);};
    try {window.__AEGIS_DEBUG__.getState();} finally {BattleScene.prototype.teamSnapshot=snapshot;}
    const s=window.flight;
    s.game.loop.sleep();
    let clock=s.game.loop.now;
    window.step=(n=1)=>{for(let i=0;i<n;i++){clock+=1000/60;s.game.step(clock,1000/60);}};
    // Restart the selected mission with a constant encounter seed and seeded
    // Phaser randomness, irrespective of how long artwork took to load.
    const other=performance.getEntriesByType('resource').find(e=>e.name.includes('/node_modules/.vite/deps/phaser'));
    if(other){const {default:Phaser}=await import(other.name);Phaser.Math.RND.sow(['coastal-review']);}
    let seed=18265;
    Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const config=s.model.mission;
    const start=s.startMission.bind(s);
    const prior=window.__AEGIS_CAMPAIGN__;
    if(!config||!prior) throw new Error('Mission did not enter flight');
    const missionStart=await import('/src/game/simulation/CampaignModel.ts');
    const campaign=new missionStart.CampaignModel({...prior,campaignSeed:18265});
    start(campaign.beginMission());
    document.querySelector('.graphics-preview-tools')?.remove();
    document.querySelector('#debug-hud')?.setAttribute('hidden','');
    window.evidence={shots:[],hits:[],weak:[]};
    const oldShot=s.spawnPlayerBullet.bind(s);
    s.spawnPlayerBullet=(...a)=>{if(a[6]==='spread')window.evidence.shots.push([s.model.stageElapsedMs,a[9]||0,a[4]]);return oldShot(...a);};
    const oldHit=s.hitEnemy.bind(s);
    s.hitEnemy=(bolt,zone)=>{const enemy=zone.getData('enemy');if(bolt.active&&enemy.active&&!bolt.getData('hitTargets').has(enemy.getData('entityId')))
      window.evidence.hits.push([enemy.getData('kind'),bolt.getData('charge'),zone.getData('role')]);return oldHit(bolt,zone);};
    window.step(1);
  });
  return page;
}
async function capture(page,name){await page.screenshot({path:path.join(out,name+'.jpg'),quality:86});}
const report={};
try {
  for(const strategy of ['held','timed']) {
    const p=await flight('coastal','&encounter=charge-pass');
    const shots=[];
    const frames=path.join(out,'frames');
    if(strategy==='timed')await mkdir(frames,{recursive:true});
    // The same milestone as the sixth Coastal flight. Fly laterally across the
    // pass, then align with the Bomber's exposed pod and press the normal key.
    for(let frame=0;frame<90;frame++){
      const input=await p.evaluate(({strategy,frame})=>{
        const s=window.flight;
        const bomber=s.enemies.getChildren().find(e=>e.active&&e.getData('kind')==='bomber');
        const target=bomber?bomber.x+bomber.displayWidth*.24:620;
        const dx=target-s.lead.player.x;
        const align=Math.abs(dx)>5?Math.sign(dx):0;
        return {left:frame>=18&&frame<30 || frame>=30&&align<0,
          right:frame>=30&&align>0,fire:strategy==='held'||frame<10 || frame>=43&&frame<=47 || frame>=66&&frame<=70};
      },{strategy,frame});
      for(const [key,on] of [['ArrowLeft',input.left],['ArrowRight',input.right],['Space',input.fire]])
        if(!!shots[key]!==!!on){await p.keyboard[on?'down':'up'](key);shots[key]=on;}
      await p.evaluate(()=>window.step(4));
      if(strategy==='timed'){
        const b64=await p.screenshot({type:'jpeg',quality:76});
        await writeFile(path.join(frames,String(frame).padStart(3,'0')+'.jpg'),b64);
      }
    }
    report[strategy]=await p.evaluate(()=>({shots:window.evidence.shots,hits:window.evidence.hits,elapsed:window.flight.model.stageElapsedMs}));
    await capture(p,'coastal-'+strategy);
    await p.close();console.log(strategy,JSON.stringify(report[strategy].hits));
  }
  assert(report.held.shots.length>report.timed.shots.length);
  assert(report.timed.hits.some(([kind,charge])=>kind==='bomber'&&charge===2),'Banked shot must reach the Bomber in gameplay.');
  for(const mode of ['off','edge','cloud','reduced']){
    const p=await flight('fortress','&fortressDepth='+mode,mode==='reduced');
    report['fortress-'+mode]=await p.evaluate(()=>{
      const s=window.flight;
      s.isolatedCraftPreview=true;
      const env=s.dimensionalEnvironment;env.setMission('fortress');
      for(let i=0;i<16;i++)s.spawnEnemyBullet(120+i*68,140+(i%4)*60,Math.PI/2+(i%3-1)*.09,i%3===0);
      window.step(60);
      return {background:env.snapshot(),time:s.model.stageElapsedMs,bullets:s.enemyBullets.countActive(true)};
    });
    await capture(p,'fortress-'+mode);await p.close();
  }
  const off=report['fortress-off'],edge=report['fortress-edge'],cloud=report['fortress-cloud'],reduced=report['fortress-reduced'];
  assert.equal(off.bullets,edge.bullets);assert.equal(edge.bullets,cloud.bullets);
  assert.equal(off.background.structure.visible,false);assert.equal(edge.background.structure.visible,true);
  assert.equal(cloud.background.cloudShadow.visible,true);assert.equal(cloud.background.structure.visible,false);
  assert(Math.abs(edge.background.surface.offset / reduced.background.surface.offset - 1.15)<.002);
  const p=await flight('coastal');
  report.shields=await p.evaluate(()=>{
    const s=window.flight;s.isolatedCraftPreview=true;
    const pilot=s.lead;pilot.model.shield=2;pilot.model.shieldMax=2;pilot.model.invulnerableUntil=0;
    const hit=(dx)=>{pilot.model.invulnerableUntil=0;s.damagePlayer(true,'projectile',pilot,{x:pilot.player.x+dx,y:pilot.player.y});};
    window.strike=hit;window.step(3);hit(34);window.step(2);
    return {first:pilot.model.shield};
  });
  await capture(p,'shield-starboard-hit');
  await p.evaluate(()=>{window.step(110);window.strike(-32);window.step(5);});
  await capture(p,'shield-last-cell');
  report.shields.final=await p.evaluate(()=>window.flight.lead.model.shield);
  await p.evaluate(()=>{window.step(38);window.flight.lead.model.shield=1;window.step(12);});
  await capture(p,'shield-recharge');
  await p.close();
  assert.deepEqual(report.shields,{first:1,final:0});
  assert.deepEqual(errors,[]);
  console.log('Verified charge, hit-side feedback and matched Fortress volleys.');
} finally {
  report.browserErrors=errors;
  await writeFile(path.join(out,'flight-tests.json'),JSON.stringify(report,null,2)+'\n');
  await browser.close();
}
