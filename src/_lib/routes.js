// URL of every page per language. Work pages live below the work route: /werk/<id>/ and /en/work/<id>/.
export const LANGS = ['nl', 'en'];

export const routes = {
  home: { nl: '/', en: '/en/' },
  work: { nl: '/werk/', en: '/en/work/' },
  exhibitions: { nl: '/tentoonstellingen/', en: '/en/exhibitions/' },
  about: { nl: '/over/', en: '/en/about/' },
  contact: { nl: '/contact/', en: '/en/contact/' },
};
