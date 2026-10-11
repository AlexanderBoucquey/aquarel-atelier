import { readFileSync } from 'node:fs';
import { routes } from '../_lib/routes.js';

const config = JSON.parse(readFileSync('site.config.json', 'utf8'));

export default {
  baseUrl: config.baseUrl,
  pathPrefix: config.pathPrefix,
  routes,
  year: new Date().getFullYear(),
  portrait: { width: 750, height: 1000 },
  contact: {
    street: 'Veldstraat 258',
    postal: '2930',
    city: 'Brasschaat',
    country: { nl: 'België', en: 'Belgium' },
    phone: '+32 489 91 90 14',
    phoneHref: 'tel:+32489919014',
    email: 'dirkvermoesen@hotmail.com',
    routeUrl: 'https://www.google.com/maps/dir/?api=1&destination=Veldstraat+258%2C+2930+Brasschaat',
    facebook: { handle: 'dirk.vermoesen', url: 'https://www.facebook.com/dirk.vermoesen' },
    instagram: { handle: 'vermoesen.dirk', url: 'https://www.instagram.com/vermoesen.dirk/' },
  },
};
