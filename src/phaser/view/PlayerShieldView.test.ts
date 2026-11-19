import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
vi.mock('phaser', () => ({default:{BlendModes:{ADD:1}}}));
import {PlayerShieldView} from './PlayerShieldView';

function create(reduced = false) {
  vi.stubGlobal('window', {matchMedia: () => ({matches:reduced})});
  class Surface {
    visible = false;
    lines: number[][] = [];
    style: number[] = [];
    destroy = vi.fn();
    setDepth() {return this;} setBlendMode() {return this;}
    setVisible(on:boolean) {this.visible=on;return this;}
    setPosition() {return this;} setRotation() {return this;}
    clear() {this.lines=[];return this;}
    lineStyle(...style:number[]) {this.style=style;return this;}
    lineBetween(...coords:number[]) {this.lines.push([...this.style,...coords]);return this;}
  }
  const surfaces: Surface[]=[];
  const scene = {add:{graphics:() => { const g=new Surface();surfaces.push(g);return g; }}};
  return {view:new PlayerShieldView(scene as unknown as Phaser.Scene,'hull'), surfaces};
}
afterEach(()=>vi.unstubAllGlobals());
describe('flight shield',()=>{
  it('shows stern cells and a separate forward charge cue, including with zero protection',()=>{
    const {view,surfaces:[hull,nose]}=create();
    view.charge(2);view.update(120,250,0,2,3,1000,true);
    expect(hull.lines.filter(l=>l[1]===0xb3f5ff)).toHaveLength(2);
    expect(nose.lines).toHaveLength(3);
    view.hit(1000,0,true);view.update(120,250,0,0,3,1070,true);
    expect(hull.visible).toBe(true);
    expect(hull.lines.some(l=>l[1]===0xffb783)).toBe(true);
    view.update(120,250,0,0,3,1500,true);
    expect(hull.visible).toBe(false);expect(nose.visible).toBe(true);
    view.update(120,250,0,1,3,1600,true);
    expect(hull.lines.some(l=>l[1]===0xa4ffe6)).toBe(true);
    view.reset();expect(nose.visible).toBe(false);expect(hull.visible).toBe(false);
    view.destroy();expect(hull.destroy).toHaveBeenCalledOnce();expect(nose.destroy).toHaveBeenCalledOnce();
  });
  it('immediately replaces a breaking field when a cell returns',()=>{
    const {view,surfaces:[field]}=create();
    view.update(100,100,0,1,3,990,true);
    view.hit(1000,0,true);
    view.update(100,100,0,0,3,1010,true);
    view.update(100,100,0,1,3,1080,true);
    expect(field.lines.some(line=>line[1]===0xa4ffe6)).toBe(true);
    expect(field.lines.some(line=>line[1]===0xffb783)).toBe(false);
  });
  it('stays hidden off duty and preserves plate geometry through a reduced-motion break',()=>{
    const {view,surfaces:[g]}=create(true);
    view.hit(1000,0,true);
    view.update(100,100,0,0,3,1010,true);const first=g.lines.map(l=>l.slice(3));
    view.update(100,100,0,0,3,1210,true);expect(g.lines.map(l=>l.slice(3))).toEqual(first);
    view.update(100,100,0,2,3,1250,false);expect(g.visible).toBe(false);
  });
});