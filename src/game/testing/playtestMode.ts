const campaignOnly = { lab: false, debug: false, graphics: false, ending: false, god: false } as const;

/** Only the development build may interpret playtest flags. A production build
 * stays a normal campaign even on localhost or with an old preview bookmark. */
export function readPlaytestMode(query: string, development = import.meta.env.DEV) {
  if (!development) return campaignOnly;
  const params = new URLSearchParams(query);
  const lab = params.get('lab') === '1';
  const debug = lab || params.get('debug') === '1';
  return {
    lab, debug,
    graphics: lab || (debug && params.get('graphics') === '1'),
    ending: !lab && debug && params.get('ending') === '1',
    god: lab ? params.get('god') !== '0' : debug && params.get('god') === '1',
  };
}
