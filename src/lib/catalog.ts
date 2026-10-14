export const FOOD_CATEGORIES = [
  { name: "Non", color: "#b45309" },
  { name: "Sabzavot-meva", color: "#15803d" },
  { name: "Go'sht-tuxum", color: "#b91c1c" },
  { name: "Sut mahsulotlari", color: "#a16207" },
  { name: "Yorma va yog'", color: "#0f766e" },
  { name: "Qand-shakar", color: "#e11d48" },
  { name: "Ichimliklar", color: "#0369a1" },
  { name: "Shirinlik", color: "#9d174d" },
] as const;

/** barcode, name, category name, unit, buy, sell, stock, minStock */
export const FOOD_PRODUCTS: Array<
  [string, string, (typeof FOOD_CATEGORIES)[number]["name"], string, number, number, number, number]
> = [
  ["20000001", "Non", "Non", "dona", 2500, 3500, 90, 25],
  ["20000002", "Lepyoshka", "Non", "dona", 2800, 4000, 40, 12],
  ["20000003", "Patir", "Non", "dona", 3500, 5000, 24, 8],
  ["20000004", "Baton", "Non", "dona", 4000, 6000, 20, 6],

  ["20001001", "Kartoshka", "Sabzavot-meva", "kg", 4000, 6000, 80, 20],
  ["20001002", "Piyoz", "Sabzavot-meva", "kg", 3000, 5000, 45, 12],
  ["20001003", "Sabzi", "Sabzavot-meva", "kg", 3500, 5500, 30, 10],
  ["20001004", "Pomidor", "Sabzavot-meva", "kg", 8000, 12000, 18, 6],
  ["20001005", "Bodring", "Sabzavot-meva", "kg", 7000, 10000, 16, 5],
  ["20001006", "Olma", "Sabzavot-meva", "kg", 10000, 15000, 22, 6],
  ["20001007", "Banan", "Sabzavot-meva", "kg", 14000, 20000, 12, 4],

  ["20002001", "Tuxum 10 ta", "Go'sht-tuxum", "dona", 14000, 18000, 30, 10],
  ["20002002", "Tovuq", "Go'sht-tuxum", "kg", 28000, 36000, 15, 5],
  ["20002003", "Mol go'shti", "Go'sht-tuxum", "kg", 75000, 95000, 8, 3],
  ["20002004", "Kolbasa", "Go'sht-tuxum", "kg", 42000, 55000, 6, 2],

  ["20003001", "Sut 1l", "Sut mahsulotlari", "litr", 9000, 12000, 24, 8],
  ["20003002", "Qatiq", "Sut mahsulotlari", "dona", 7000, 9500, 20, 6],
  ["20003003", "Qaymoq", "Sut mahsulotlari", "dona", 11000, 15000, 12, 4],
  ["20003004", "Pishloq", "Sut mahsulotlari", "kg", 25000, 32000, 7, 2],
  ["20003005", "Sariyog'", "Sut mahsulotlari", "dona", 14000, 18000, 16, 5],
  ["20003006", "Tvorog", "Sut mahsulotlari", "dona", 12000, 16000, 10, 3],

  ["20004001", "Guruch", "Yorma va yog'", "kg", 14000, 18000, 50, 12],
  ["20004002", "Un", "Yorma va yog'", "kg", 7000, 9500, 40, 12],
  ["20004003", "Shakar", "Qand-shakar", "kg", 11000, 14000, 28, 8],
  ["20004004", "Makaron", "Yorma va yog'", "dona", 6000, 8500, 45, 12],
  ["20004005", "Grechka", "Yorma va yog'", "kg", 16000, 21000, 14, 4],
  ["20004006", "Mosh", "Yorma va yog'", "kg", 18000, 24000, 10, 3],
  ["20004007", "O'simlik yog'i 1l", "Yorma va yog'", "litr", 18000, 24000, 22, 6],
  ["20004008", "Tuz", "Yorma va yog'", "kg", 2000, 3500, 20, 6],
  ["20004009", "Choy", "Yorma va yog'", "dona", 9000, 12000, 28, 8],

  ["20005001", "Suv 0.5l", "Ichimliklar", "dona", 1500, 2500, 80, 24],
  ["20005002", "Suv 1.5l", "Ichimliklar", "dona", 2500, 4000, 48, 16],
  ["20005003", "Coca-Cola 1.5l", "Ichimliklar", "dona", 11000, 14000, 36, 12],
  ["20005004", "Fanta 1.5l", "Ichimliklar", "dona", 11000, 14000, 24, 8],
  ["20005005", "Pepsi 1.5l", "Ichimliklar", "dona", 11000, 14000, 20, 8],
  ["20005006", "Sok 1l", "Ichimliklar", "dona", 8000, 11000, 22, 8],
  ["20005007", "Ayran", "Ichimliklar", "dona", 4000, 6000, 18, 6],
  ["20005008", "Energetik", "Ichimliklar", "dona", 9000, 13000, 16, 6],

  ["20006001", "Pechene", "Shirinlik", "dona", 7000, 10000, 20, 6],
  ["20006002", "Shokolad", "Shirinlik", "dona", 8000, 12000, 18, 6],
  ["20006003", "Chipsi", "Shirinlik", "dona", 6000, 9000, 24, 8],
  ["20006004", "Muzqaymoq", "Shirinlik", "dona", 4000, 7000, 30, 10],
];

export const FOOD_SALES: Array<{ ago: number; barcodes: Array<[string, number]>; method: string }> = [
  { ago: 0, barcodes: [["20000001", 6], ["20005003", 2], ["20005001", 4]], method: "naqd" },
  { ago: 0, barcodes: [["20004001", 2], ["20004003", 1], ["20004004", 3]], method: "humo" },
  { ago: 0, barcodes: [["20003001", 2], ["20003002", 2], ["20000001", 2]], method: "naqd" },
  { ago: 1, barcodes: [["20002001", 2], ["20002002", 1.5], ["20004007", 1]], method: "uzcard" },
  { ago: 1, barcodes: [["20001001", 5], ["20001002", 2], ["20001003", 2]], method: "naqd" },
  { ago: 2, barcodes: [["20005004", 3], ["20005006", 2], ["20005002", 6]], method: "otkazma" },
  { ago: 3, barcodes: [["20003004", 0.5], ["20003005", 2], ["20006001", 3]], method: "naqd" },
  { ago: 4, barcodes: [["20000001", 10], ["20004009", 2], ["20004002", 3]], method: "humo" },
  { ago: 5, barcodes: [["20001006", 2], ["20001007", 1.5], ["20006004", 4]], method: "naqd" },
  { ago: 6, barcodes: [["20002003", 1], ["20004001", 3], ["20000002", 4]], method: "naqd" },
];

export const FOOD_SETTINGS = {
  store_name: "Oziq-ovqat do'koni",
  store_phone: "+998 90 123 45 67",
  store_address: "Toshkent",
  receipt_footer: "Yana keling — yangi non har kuni!",
  allow_negative_stock: "0",
  opening_cash: "800000",
  catalog_version: "oziq-v1",
};

export const FOOD_SUPPLIERS = [
  { name: "Nonvoyxona", phone: "+998711112200", payable: 0 },
  { name: "Oziq-ovqat optom", phone: "+998711112233", payable: 0 },
  { name: "Ichimliklar distribyutor", phone: "+998711118888", payable: 180000 },
  { name: "Sut kombinati", phone: "+998714445566", payable: 240000 },
];
