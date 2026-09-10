// Official display names are kept together so speech hints and exact glossary
// translations use the same canonical spelling.
const MEMBERS = [
  ["ときのそら", "Tokino Sora"], ["ロボ子さん", "Robocosan"], ["アキ・ローゼンタール", "Aki Rosenthal"],
  ["赤井はあと", "Akai Haato"], ["白上フブキ", "Shirakami Fubuki"], ["夏色まつり", "Natsuiro Matsuri"],
  ["百鬼あやめ", "Nakiri Ayame"], ["癒月ちょこ", "Yuzuki Choco"], ["大空スバル", "Oozora Subaru"],
  ["AZKi", "AZKi"], ["大神ミオ", "Ookami Mio"], ["さくらみこ", "Sakura Miko"],
  ["猫又おかゆ", "Nekomata Okayu"], ["戌神ころね", "Inugami Korone"], ["星街すいせい", "Hoshimachi Suisei"],
  ["兎田ぺこら", "Usada Pekora"], ["不知火フレア", "Shiranui Flare"], ["白銀ノエル", "Shirogane Noel"],
  ["宝鐘マリン", "Houshou Marine"], ["角巻わため", "Tsunomaki Watame"], ["常闇トワ", "Tokoyami Towa"],
  ["姫森ルーナ", "Himemori Luna"], ["雪花ラミィ", "Yukihana Lamy"], ["桃鈴ねね", "Momosuzu Nene"],
  ["獅白ぼたん", "Shishiro Botan"], ["尾丸ポルカ", "Omaru Polka"], ["ラプラス・ダークネス", "La+ Darknesss"],
  ["鷹嶺ルイ", "Takane Lui"], ["博衣こより", "Hakui Koyori"], ["風真いろは", "Kazama Iroha"],
  ["沙花叉クロヱ", "Sakamata Chloe"], ["音乃瀬奏", "Otonose Kanade"], ["一条莉々華", "Ichijou Ririka"],
  ["儒烏風亭らでん", "Juufuutei Raden"], ["轟はじめ", "Todoroki Hajime"], ["響咲リオナ", "Isaki Riona"],
  ["虎金妃笑虎", "Koganei Niko"], ["水宮枢", "Mizumiya Su"], ["輪堂千速", "Rindo Chihaya"],
  ["綺々羅々ヴィヴィ", "Kikirara Vivi"], ["井月みちる", "Izuki Michiru"], ["花園さやか", "Hanazono Sayaka"],
  ["風白ゆき", "Kazeshiro Yuki"], ["アユンダ・リス", "Ayunda Risu"], ["ムーナ・ホシノヴァ", "Moona Hoshinova"],
  ["アイラニ・イオフィフティーン", "Airani Iofifteen"], ["クレイジー・オリー", "Kureiji Ollie"],
  ["アーニャ・メルフィッサ", "Anya Melfissa"], ["パヴォリア・レイネ", "Pavolia Reine"],
  ["ベスティア・ゼータ", "Vestia Zeta"], ["カエラ・コヴァルスキア", "Kaela Kovalskia"],
  ["こぼ・かなえる", "Kobo Kanaeru"], ["森カリオペ", "Mori Calliope"], ["小鳥遊キアラ", "Takanashi Kiara"],
  ["一伊那尓栖", "Ninomae Ina'nis"], ["IRyS", "IRyS"], ["オーロ・クロニー", "Ouro Kronii"],
  ["ハコス・ベールズ", "Hakos Baelz"], ["シオリ・ノヴェラ", "Shiori Novella"], ["古石ビジュー", "Koseki Bijou"],
  ["ネリッサ・レイヴンクロフト", "Nerissa Ravencroft"], ["フワワ・アビスガード", "Fuwawa Abyssgard"],
  ["モココ・アビスガード", "Mococo Abyssgard"], ["エリザベス・ローズ・ブラッドフレイム", "Elizabeth Rose Bloodflame"],
  ["ジジ・ムリン", "Gigi Murin"], ["セシリア・イマーグリーン", "Cecilia Immergreen"],
  ["ラオーラ・パンテーラ", "Raora Panthera"], ["ワトソン・アメリア", "Watson Amelia"],
  ["がうる・ぐら", "Gawr Gura"], ["九十九佐命", "Tsukumo Sana"], ["セレス・ファウナ", "Ceres Fauna"],
  ["七詩ムメイ", "Nanashi Mumei"], ["湊あくあ", "Minato Aqua"], ["紫咲シオン", "Murasaki Shion"],
  ["天音かなた", "Amane Kanata"], ["桐生ココ", "Kiryu Coco"], ["火威青", "Hiodoshi Ao"]
];

const JAPANESE_TERMS = [
  "あえんびえん", "ホロライブ", "ホロメン", "ホロリス",
  "ホロックス", "リグロス", "フロウグロウ", "みこち",
  "すいちゃん", "ぺこら", "船長", "団長", "こんこよ",
  "こんぺこ", "おつぺこ", "にぇ", "しゅば", "んなたん", "やごー"
];

const LATIN_TERMS = [
  "hololive", "holoEN", "holoID", "holoX", "ReGLOSS",
  "FLOW GLOW", "FUWAMOCO", "YAGOO", "aenbien"
];

const EXACT_GLOSSARY = [
  { terms: ["あえんびえん", "aenbien"], ja: "あえんびえん", en: "aenbien (pandemonium)", id: "aenbien (kekacauan)" },
  ...MEMBERS.map(([ja, en]) => ({ terms: [ja, en], ja, en, id: en }))
];

function uniquePhrases(entries) {
  const seen = new Set();
  return entries.filter(({ phrase }) => {
    const key = phrase.toLocaleLowerCase("en-US");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getHololiveSpeechPhrases(language) {
  const modelLanguage = String(language).split("-")[0].toLowerCase();
  const names = MEMBERS.map(([ja, en]) => ({ phrase: modelLanguage === "ja" ? ja : en, boost: 1 }));
  // Boost is logarithmic; even fixed-language recognition needs only a light hint.
  const terms = (modelLanguage === "ja" ? JAPANESE_TERMS : LATIN_TERMS).map((phrase) => ({ phrase, boost: 1 }));
  return uniquePhrases([...names, ...terms]);
}

export function isKnownHololiveMember(value) {
  const normalized = String(value).toLocaleLowerCase("en-US");
  return MEMBERS.some(([ja, en]) => normalized.includes(ja.toLocaleLowerCase("en-US")) || normalized.includes(en.toLocaleLowerCase("en-US")));
}

export function getExactHololiveTranslation(text, targetLanguage) {
  const normalized = String(text).trim().replace(/[。．.!！?？]+$/u, "").trim().toLocaleLowerCase("en-US");
  if (!normalized) return null;
  const entry = EXACT_GLOSSARY.find(({ terms }) => terms.some((term) => term.toLocaleLowerCase("en-US") === normalized));
  if (!entry) return null;
  const target = String(targetLanguage).split("-")[0].toLowerCase();
  return entry[target] || entry.en;
}
