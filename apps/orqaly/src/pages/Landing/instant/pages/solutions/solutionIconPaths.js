// The drawings behind the Solutions icons, kept apart from the components that render them
// so plain modules (the home page carousel) can use the paths too.
export const PATHS = {
  voice: 'M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v4',
  message: 'M4 5h16v11H9.5L4 20z',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  document: 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  chart: 'M4 4v16h16M8 16v-4M12 16V8M16 16v-6',
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM16 16l4.5 4.5',
  cart: 'M3 4h2.5l2.2 10h9.8l2-7H7M9 19.5a.6.6 0 1 0 1.2 0 .6.6 0 1 0-1.2 0M16 19.5a.6.6 0 1 0 1.2 0 .6.6 0 1 0-1.2 0',
  truck:
    'M2 6h11v10H2zM13 9h4l4 4v3h-8zM6.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  users:
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5a6.5 6.5 0 0 1 3.5 5.5',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3.5 2',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 16.5v4M16.5 18.5h4',
  plug: 'M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4',
  folder: 'M3 6h6l2 2h10v11H3z',
  check: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12.5l2.8 2.8L16 9.5',
  globe:
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18',
  pen: 'M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19zM14.5 6.5l3 3',
  money: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6.5 10.5v3M17.5 10.5v3',
  box: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
  tool: 'M14.5 4.2a5 5 0 0 0-4.1 6.7L4 17.3V20h2.7l6.4-6.4a5 5 0 0 0 6.7-4.1l-3 2.2-2.6-.9-.9-2.6z',
  home: 'M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-6h4v6',
  book: 'M12 6c-2-1.5-5-2-8-2v14c3 0 6 .5 8 2 2-1.5 5-2 8-2V4c-3 0-6 .5-8 2zM12 6v14',
  scale: 'M12 3v18M7 21h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z',
  camera: 'M3 8h4l2-3h6l2 3h4v11H3zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  pulse: 'M2.5 12H7l2-5.5 4 11 2-5.5h6.5',
  cloche: 'M12 6.5V9M5 17a7 7 0 0 1 14 0M3 17h18M2 20h20',
};

// The header menu draws one of the same icons beside each industry.
export const INDUSTRY_ICONS = {
  healthcare: 'pulse',
  'real-estate': 'home',
  ecommerce: 'cart',
  restaurants: 'cloche',
  education: 'book',
  legal: 'scale',
  marketing: 'chart',
  creators: 'camera',
  freelancers: 'pen',
  manufacturing: 'tool',
};

// An industry's icon as separate strokes, for pictures that draw it in line by line.
export function industryPaths(slug) {
  return (PATHS[INDUSTRY_ICONS[slug]] ?? PATHS.spark).split(/(?=M)/);
}
