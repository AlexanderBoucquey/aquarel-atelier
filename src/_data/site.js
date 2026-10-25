import { readFileSync } from 'node:fs';
import { routes } from '../_lib/routes.js';

const config = JSON.parse(readFileSync('site.config.json', 'utf8'));

export default {
  baseUrl: config.baseUrl,
  pathPrefix: config.pathPrefix,
  routes,
  year: new Date().getFullYear(),
  portrait: { width: 750, height: 1000 },
  // Atelier photos on the About page: src/assets/img/<name>-w600.webp and -w1200.webp (3:4). Ordered so Dirk faces
  // inward on both photos.
  atelier: [
    { name: 'atelier-wand', alt: { nl: 'Dirk Vermoesen in zijn atelier', en: 'Dirk Vermoesen in his studio' } },
    { name: 'atelier-schilderen', alt: { nl: 'Dirk Vermoesen schildert een aquarel', en: 'Dirk Vermoesen painting a watercolour' } },
  ],
  contact: {
    street: 'Veldstraat 258',
    postal: '2930',
    city: 'Brasschaat',
    country: { nl: 'België', en: 'Belgium' },
    phone: '+32 489 91 90 14',
    phoneHref: 'tel:+32489919014',
    email: 'dirkvermoesen@hotmail.com',
    routeUrl: 'https://www.google.com/maps/dir/?api=1&destination=Veldstraat+258%2C+2930+Brasschaat',
    // OpenStreetMap (no tracking cookies, so no cookie banner): the area around the pin at Veldstraat 258.
    mapUrl: 'https://www.openstreetmap.org/export/embed.html?bbox=4.4790%2C51.2965%2C4.4876%2C51.3006&layer=mapnik&marker=51.29853%2C4.48326',
    facebook: { handle: 'dirk.vermoesen', url: 'https://www.facebook.com/dirk.vermoesen' },
    instagram: { handle: 'vermoesen.dirk', url: 'https://www.instagram.com/vermoesen.dirk/' },
  },
};
