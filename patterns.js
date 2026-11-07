// The traditional marbling patterns, for the history and examples section (roadmap F21) and Carra
// Jean's FAQ. Plain data, checked against sources in research/2026-11-07-f21-names-and-images.md:
// status says how well each definition is supported ('verified', 'partly', 'unverifiable'), and
// nothing marked otherwise should be shown as settled fact. Images are only ones we may reuse.
//
// Sources, by key:
//   RE    Roberts & Etherington, Bookbinding and the Conservation of Books: A Dictionary of
//         Descriptive Terminology (1982), online at CoOL
//   WOOL  C. W. Woolnough, The Whole Art of Marbling (1881), with bound-in specimens; public domain
//         (Wellcome copy: https://archive.org/details/wholeartofmarbli00wool)
//   UW    University of Washington Libraries, marbled paper pattern guide (cites Wolfe 1990 plates
//         and Miura; plate numbers still to be checked against Wolfe)
//   TDV   M. Uğur Derman, "Ebru", TDV İslâm Ansiklopedisi (1994), and its "Okyay" biography
//   AAT   Getty Art & Architecture Thesaurus
//   WIKI  Wikipedia, "Paper marbling" and "Suminagashi"

export const SOURCES = {
  RE: 'Roberts & Etherington, Bookbinding and the Conservation of Books (1982)',
  WOOL: 'C. W. Woolnough, The Whole Art of Marbling (1881)',
  UW: 'University of Washington Libraries, marbled paper pattern guide (after Wolfe 1990)',
  TDV: 'M. Uğur Derman, "Ebru", TDV İslâm Ansiklopedisi (1994)',
  AAT: 'Getty Art & Architecture Thesaurus',
  WIKI: 'Wikipedia, "Paper marbling" and "Suminagashi"',
};

const commons = (file) => `https://commons.wikimedia.org/wiki/File:${file}`;

export const PATTERNS = [
  // ---- Base patterns: colours thrown and left, no tool work ----
  {
    id: 'stone', family: 'base', names: { en: 'Stone, Turkish', de: 'Steinmarmor', tr: 'battal' }, status: 'verified',
    summary: 'Colours dropped or sprinkled onto the size and left as they land, each later colour pressing the earlier ones into a crowd of spots.',
    sources: ['UW', 'RE', 'TDV'],
    image: { title: 'Ottoman album leaf with marbled margins, ca. 1725–45', url: 'https://www.metmuseum.org/art/collection/search/898273', licence: 'CC0 (Met Open Access)' },
    example: 'Gilded stone', alsoExample: ['Stone, four colours', 'Stone (Cells)'],
  },
  {
    id: 'antique-spot', family: 'base', names: { en: 'Antique Spot' }, status: 'verified',
    summary: 'A variant of Antique marble, not another name for Stone: the colours are raked once up and down, then spotted with pink or green, and finally white.',
    sources: ['RE', 'WOOL'], image: { title: 'Woolnough 1881, Examples 14–15', url: 'https://archive.org/details/wholeartofmarbli00wool', licence: 'Public Domain Mark' },

    example: 'Antique spot',
  },
  {
    id: 'shell', family: 'base', names: { en: 'Shell, French Shell' }, status: 'verified',
    summary: 'Oil in a colour makes each drop dark in the middle with a lighter outer ring, its "shell".',
    sources: ['RE', 'WOOL', 'UW'], image: { title: 'Woolnough 1881, Nos. 25–28', url: 'https://archive.org/details/wholeartofmarbli00wool', licence: 'Public Domain Mark' },
    example: 'French Shell',
  },
  {
    id: 'stormont', family: 'base', names: { en: 'Stormont' }, status: 'verified',
    summary: 'Turpentine in the last colour thrown makes it break into a lace of fine holes.',
    sources: ['RE', 'WOOL', 'UW', 'AAT'], image: { title: 'Woolnough 1881, No. 30', url: 'https://archive.org/details/wholeartofmarbli00wool', licence: 'Public Domain Mark' },

    example: 'Stormont',
  },
  {
    id: 'gloster', family: 'base', names: { en: 'Gloster' }, status: 'partly',
    summary: 'A raked or combed ground, then spots of a Stormont (turpentine) colour, usually blue, with no white on top.',
    sources: ['RE', 'WOOL', 'UW'], image: { title: 'Woolnough 1881, No. 31', url: 'https://archive.org/details/wholeartofmarbli00wool', licence: 'Public Domain Mark' },
    example: 'Gloster',
  },
  {
    id: 'italian', family: 'base', names: { en: 'Italian, Vein, hair-vein' }, status: 'partly',
    summary: 'A last throw of strong gall-water (or white) drives the earlier colours into fine veins between pale cells; a stronger expander gives the finer hair-vein.',
    sources: ['UW', 'WOOL'], image: { title: 'Woolnough 1881, Examples 1–2', url: 'https://archive.org/details/wholeartofmarbli00wool', licence: 'Public Domain Mark' },
    example: 'Italian vein', alsoExample: ['Hair-vein', 'Stone veins (Thin film)', 'Large-cell vein (Cells)'],
  },
  // ---- Combed and manipulated patterns ----
  {
    id: 'gelgit', family: 'combed', names: { en: 'Get-gel', tr: 'gelgit' }, status: 'verified',
    summary: 'A stylus or rake drawn back and forth across the bath ("come and go"), giving zigzag bands.',
    sources: ['TDV'], image: { title: 'Taraklı Gel Git Ebru', url: commons('Tarakl%C4%B1_Gel_Git_Ebru.jpg'), licence: 'CC BY-SA 4.0' },

    example: 'Get-gel',
  },
  {
    id: 'nonpareil', family: 'combed', names: { en: 'Nonpareil' }, status: 'verified',
    summary: 'A get-gel combed through with a fine comb, giving tight parallel rows; a staple of 19th-century bookbinding.',
    sources: ['RE', 'UW', 'WOOL'], image: { title: 'Combed marbled endpaper dated 1826', url: commons('Combed_marbled_endpaper_dated_1826.jpg'), licence: 'Public domain' },
    example: 'Nonpareil',
  },
  {
    id: 'old-dutch', family: 'combed', names: { en: 'Old Dutch' }, status: 'verified',
    summary: 'One of the oldest European combed patterns, with bold comb lines. "Dutch" is a different pattern, not a synonym.',
    sources: ['RE'], image: { title: 'Atlas de Wit, 1698, endpaper (KB)', url: commons('Atlas_de_Wit_1698-schutbladachter-KB_PPN_145205088_(cropped).jpg'), licence: 'Public domain' },
  },
  {
    id: 'bouquet', family: 'combed', names: { en: 'Bouquet' }, status: 'verified',
    summary: 'A nonpareil worked with a second comb along a wavy path, making repeating teardrop "flower" shapes. Naming overlaps with Peacock.',
    sources: ['UW', 'RE'], image: { title: 'Marbled endpaper, Vienna ca. 1875', url: commons('Marbled_endpaper_from_Die_Nachfolge_Christi_ed._Ludwig_Donin_(Vienna_ca._1875)_500ppi.jpg'), licence: 'Public domain' },
  },
  {
    id: 'peacock', family: 'combed', names: { en: 'Peacock' }, status: 'partly',
    summary: 'A nonpareil pulled with a wavy comb so the rows bunch into eye-like plumes.',
    sources: ['RE', 'UW'], image: { title: 'Kluge, Wörterbuch (6th ed., 1899), endpaper', url: commons('Kluge,_W%C3%B6rterbuch_(6th_ed._1899),_marbled_endpaper.jpg'), licence: 'Public domain' },
    example: 'Emerald peacock',
  },
  {
    id: 'chevron', family: 'combed', names: { en: 'Chevron, Feather' }, status: 'unverifiable',
    summary: 'Combs drawn in opposing directions, giving V shapes or feathering. Practitioners use the names; no historical definition was found.',
    sources: [], image: { title: 'Combed marbled paper, 1828 (a stand-in only)', url: commons('Combed_marbled_paper.jpg'), licence: 'Public domain' },
    example: 'Chevrons',
  },
  {
    id: 'french-curl', family: 'combed', names: { en: 'French Curl, Snail' }, status: 'verified',
    summary: 'Rows of tight spirals made by turning a set of styluses, or a curl comb, in the size.',
    sources: ['RE', 'UW', 'WOOL'], image: { title: 'Paper marbling, France, 1735', url: commons('PaperMarbling005France1735.jpg'), licence: 'Public domain' },
  },
  {
    id: 'spanish', family: 'combed', names: { en: 'Spanish' }, status: 'verified',
    summary: 'The paper is rocked as it is laid down, giving diagonal light and dark bands like folded cloth. It names a way of laying the paper, not a colour layout.',
    sources: ['UW', 'AAT', 'WOOL'], image: { title: 'Marbled paper (Flickr 7564185358)', url: commons('Marbled_Paper_(7564185358).jpg'), licence: 'CC BY 2.0' },
  },
  {
    id: 'cockerell', family: 'combed', names: { en: 'Cockerell' }, status: 'partly',
    summary: 'Marbling from Douglas Cockerell & Son, perfected by Sydney "Sandy" Cockerell (1906–1987), Douglas\'s son, mainly mid-20th century.',
    sources: [], image: null,
  },
  // ---- Ebru (Turkish) ----
  {
    id: 'ebru', family: 'ebru', names: { en: 'Ebru', tr: 'ebru' }, status: 'partly',
    summary: 'The Turkish art of marbling. The name is often traced to Persian abrî, "cloud-like", but the etymology is disputed.',
    sources: ['TDV', 'WIKI'], image: { title: 'Turkish ebru sample', url: commons('Turkish_ebru_sample.jpg'), licence: 'Public domain' },
  },
  {
    id: 'tarakli', family: 'ebru', names: { tr: 'taraklı', en: 'combed ebru' }, status: 'verified',
    summary: 'Ebru combed with a tarak (comb).', sources: ['TDV'],
    image: { title: 'Taraklı Gel Git Ebru', url: commons('Tarakl%C4%B1_Gel_Git_Ebru.jpg'), licence: 'CC BY-SA 4.0' },
  },
  {
    id: 'bulbul-yuvasi', family: 'ebru', names: { tr: 'bülbül yuvası', en: "nightingale's nest" }, status: 'verified',
    summary: 'Spirals worked into the colours, named for a nightingale\'s nest.', sources: ['TDV'], image: null,
  },
  {
    id: 'sal', family: 'ebru', names: { tr: 'şal', en: 'shawl' }, status: 'verified',
    summary: 'A shawl-like pattern made by swirling a gelgit.', sources: ['TDV'],
    image: { title: 'Taraklı Şal Ebru', url: commons('Tarakl%C4%B1_%C5%9Eal_Ebru.jpg'), licence: 'CC BY-SA 4.0' },
  },
  {
    id: 'hatip', family: 'ebru', names: { tr: 'hatip ebrusu' }, status: 'partly',
    summary: 'Motifs built from drops of colour placed inside one another and drawn with a stylus, named after Hatip Mehmed Efendi (d. 1773).',
    sources: ['TDV'], image: { title: 'Hatip Yürek Ebru', url: commons('Hatip_Y%C3%BCrek_Ebru.jpg'), licence: 'CC BY-SA 4.0' },
  },
  {
    id: 'cicekli', family: 'ebru', names: { tr: 'çiçekli ebru', en: 'floral ebru' }, status: 'verified',
    summary: 'Flowers drawn in the colours, popularised by Necmeddin Okyay (1883–1976).', sources: ['TDV'],
    image: { title: 'Lale Ebru', url: commons('Lale_Ebru.jpg'), licence: 'CC BY-SA 4.0' },
  },
  {
    id: 'akkase', family: 'ebru', names: { tr: 'akkâse' }, status: 'verified',
    summary: 'A sheet marbled twice with its centre masked, so a panel sits inside a differently marbled border (Okyay\'s use of an old manuscript term). Not a blank kept for writing.',
    sources: ['TDV'], image: null,
  },
  {
    id: 'yazili', family: 'ebru', names: { tr: 'yazılı ebru', en: 'written ebru' }, status: 'partly',
    summary: 'Calligraphy written in a resist so it stays clear of the marbling.', sources: ['TDV'], image: null,
  },
  // ---- Suminagashi (Japanese) ----
  {
    id: 'suminagashi', family: 'suminagashi', names: { ja: '墨流し', en: 'Suminagashi, "floating ink"' }, status: 'verified',
    summary: 'Concentric rings of ink on plain water, with no thickened size, built by touching ink and a surfactant to the water in turn. Older than, and separate from, the Persian, Turkish and European line.',
    sources: ['WIKI', 'TDV'], image: { title: 'Franz Bartsch, Suminagashi 12 (German National Library)', url: commons('Franz_Bartsch_Suminagashi_12_05316.tif'), licence: 'CC0' },
  },
];
