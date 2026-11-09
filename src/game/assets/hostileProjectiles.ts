/** All hostile shots point down in texture space. Their collision cores are unchanged. */
export const HOSTILE_PROJECTILE_ART = {
  ion: { key: 'hostile-ion-lance', width: 20, height: 44, radius: 5, edge: 0x4ee6d0, shade: 0x174d51, core: 0xeefff7 },
  standard: { key: 'hostile-plasma-dart', width: 24, height: 40, radius: 5, edge: 0xff7050, shade: 0x59252b, core: 0xfff2d9 },
  heavy: { key: 'hostile-reactor-shell', width: 28, height: 48, radius: 8, edge: 0xffba58, shade: 0x663825, core: 0xfff8df },
} as const;
