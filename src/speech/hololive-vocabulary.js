// 呼び方・呼ばれ方はホロライブ非公式wikiの呼称一覧を基に、音声認識を
// 一般語へ過度に引っ張らないよう頻出かつ固有性の高い表記へ絞っている。
export const HOLOLIVE_DICTIONARY_SOURCE = "https://seesaawiki.jp/hololivetv/d/%A5%DB%A5%ED%A5%E9%A5%A4%A5%D6%A1%DA%B8%C6%BE%CE%B0%EC%CD%F7%A1%DB";

// [日本語の正式名, 英語の正式名, 日本語の呼称, Latin文字の呼称]
const MEMBERS = [
  ["ときのそら", "Tokino Sora", ["そらちゃん", "そら先輩"], ["Sora"]],
  ["ロボ子さん", "Robocosan", ["ロボちゃん", "ロボ子先輩"], ["Roboco"]],
  ["さくらみこ", "Sakura Miko", ["みこち", "みこちゃん", "みこ先輩"], ["Miko"]],
  ["星街すいせい", "Hoshimachi Suisei", ["すいちゃん", "すいせい先輩"], ["Suisei"]],
  ["AZKi", "AZKi", ["あずきちゃん", "あずちゃん", "あずきち", "AZKi先輩"], []],
  ["夜空メル", "Yozora Mel", ["メルちゃん", "メルメル", "メル先輩"], ["Mel"]],
  ["アキ・ローゼンタール", "Aki Rosenthal", ["アキロゼ", "アキちゃん", "アキロゼ先輩"], ["Aki", "Akirose"]],
  ["赤井はあと", "Akai Haato", ["はあとちゃん", "はあちゃま", "はあと先輩"], ["Haato", "Haachama"]],
  ["白上フブキ", "Shirakami Fubuki", ["フブちゃん", "フブキちゃん", "フブキ先輩"], ["Fubuki"]],
  ["夏色まつり", "Natsuiro Matsuri", ["まつりちゃん", "まつり先輩"], ["Matsuri"]],
  ["湊あくあ", "Minato Aqua", ["あくあちゃん", "あくたん", "あくあ先輩"], ["Aqua"]],
  ["紫咲シオン", "Murasaki Shion", ["シオンちゃん", "シオン先輩", "シオンたん"], ["Shion"]],
  ["百鬼あやめ", "Nakiri Ayame", ["あやめちゃん", "あやめ先輩", "お嬢"], ["Ayame"]],
  ["癒月ちょこ", "Yuzuki Choco", ["ちょこ先生", "ちょこ先輩"], ["Choco"]],
  ["大空スバル", "Oozora Subaru", ["スバルちゃん", "スバル先輩", "しゅば"], ["Subaru"]],
  ["大神ミオ", "Ookami Mio", ["ミオちゃん", "ミオしゃ", "ミオ先輩"], ["Mio"]],
  ["猫又おかゆ", "Nekomata Okayu", ["おかゆん", "おかゆ先輩"], ["Okayu"]],
  ["戌神ころね", "Inugami Korone", ["ころさん", "ころねちゃん", "ころね先輩"], ["Korone"]],
  ["兎田ぺこら", "Usada Pekora", ["ぺこちゃん", "ぺこらちゃん", "ぺこーら", "ぺこら先輩"], ["Pekora"]],
  ["潤羽るしあ", "Uruha Rushia", ["るしあちゃん", "るしあ先輩"], ["Rushia"]],
  ["不知火フレア", "Shiranui Flare", ["ふーたん", "フレアちゃん", "フレア先輩"], ["Flare"]],
  ["白銀ノエル", "Shirogane Noel", ["団長", "ノエちゃん", "ノエルちゃん", "ノエル先輩"], ["Noel"]],
  ["宝鐘マリン", "Houshou Marine", ["船長", "マリン船長", "マリンちゃん", "マリン先輩"], ["Marine"]],
  ["天音かなた", "Amane Kanata", ["かなたん", "かなたちゃん", "かなた先輩"], ["Kanata"]],
  ["桐生ココ", "Kiryu Coco", ["会長", "ココ会長", "ココ先輩"], ["Coco"]],
  ["角巻わため", "Tsunomaki Watame", ["わためぇ", "わためちゃん", "わため先輩"], ["Watame"]],
  ["常闇トワ", "Tokoyami Towa", ["トワ様", "トワちゃん", "トワぴ", "トワ先輩"], ["Towa"]],
  ["姫森ルーナ", "Himemori Luna", ["んなたん", "ルーナたん", "ルーナ姫", "ルーナ先輩"], ["Luna"]],
  ["雪花ラミィ", "Yukihana Lamy", ["ラミィちゃん", "ラミたん", "ラミィ先輩"], ["Lamy"]],
  ["桃鈴ねね", "Momosuzu Nene", ["ねねち", "ねねちゃん", "ねね先輩"], ["Nene"]],
  ["獅白ぼたん", "Shishiro Botan", ["ししろん", "ぼたんちゃん", "ぼたん先輩"], ["Botan"]],
  ["魔乃アロエ", "Mano Aloe", ["アロエちゃん"], ["Aloe"]],
  ["尾丸ポルカ", "Omaru Polka", ["ポルポル", "ポルカちゃん", "ポルカ先輩"], ["Polka"]],
  ["ラプラス・ダークネス", "La+ Darknesss", ["ラプちゃん", "ラプラスちゃん", "ラプラス先輩", "総帥", "山田"], ["Laplus", "La+"]],
  ["鷹嶺ルイ", "Takane Lui", ["ルイ姉", "ルイルイ", "ルイちゃん", "ルイ先輩"], ["Lui"]],
  ["博衣こより", "Hakui Koyori", ["こよちゃん", "こよりちゃん", "こより先輩", "こんこよ"], ["Koyori"]],
  ["沙花叉クロヱ", "Sakamata Chloe", ["沙花叉", "クロヱ", "クロヱちゃん"], ["Chloe"]],
  ["風真いろは", "Kazama Iroha", ["いろはちゃん", "いろは先輩", "ござる"], ["Iroha"]],
  ["火威青", "Hiodoshi Ao", ["青くん", "青くゆ", "青ちゃん"], ["Ao"]],
  ["音乃瀬奏", "Otonose Kanade", ["奏ちゃん", "かなでぃ", "きゃなでぃ"], ["Kanade"]],
  ["一条莉々華", "Ichijou Ririka", ["莉々華ちゃん", "りりか", "りりーか"], ["Ririka"]],
  ["儒烏風亭らでん", "Juufuutei Raden", ["らでん", "らでんちゃん"], ["Raden"]],
  ["轟はじめ", "Todoroki Hajime", ["はじめちゃん", "番長", "ばんちょー"], ["Hajime"]],
  ["響咲リオナ", "Isaki Riona", ["リオナ", "リオナちゃん"], ["Riona"]],
  ["虎金妃笑虎", "Koganei Niko", ["笑虎", "笑虎ちゃん", "ニコたん"], ["Niko"]],
  ["水宮枢", "Mizumiya Su", ["枢ちゃん", "すうちゃん"], []],
  ["輪堂千速", "Rindo Chihaya", ["千速", "千速ちゃん", "ちは", "ちはちゃん"], ["Chihaya"]],
  ["綺々羅々ヴィヴィ", "Kikirara Vivi", ["ヴィヴィ", "ヴィヴィちゃん", "ヴィヴィたん"], ["Vivi"]],
  ["井月みちる", "Izuki Michiru", ["みちるちゃん"], ["Michiru"]],
  ["花園さやか", "Hanazono Sayaka", ["さやかちゃん"], ["Sayaka"]],
  ["風白ゆき", "Kazeshiro Yuki", ["ゆきちゃん"], ["Yuki"]],
  ["アユンダ・リス", "Ayunda Risu", ["リス", "リスちゃん"], ["Risu"]],
  ["ムーナ・ホシノヴァ", "Moona Hoshinova", ["ムーナ", "ムーナちゃん"], ["Moona"]],
  ["アイラニ・イオフィフティーン", "Airani Iofifteen", ["イオフィ", "イオフィちゃん"], ["Iofi"]],
  ["クレイジー・オリー", "Kureiji Ollie", ["オリー", "オリーちゃん"], ["Ollie"]],
  ["アーニャ・メルフィッサ", "Anya Melfissa", ["アーニャ", "アーニャ先輩"], ["Anya"]],
  ["パヴォリア・レイネ", "Pavolia Reine", ["レイネ", "レイネちゃん"], ["Reine"]],
  ["ベスティア・ゼータ", "Vestia Zeta", ["ゼータ", "ゼータちゃん"], ["Zeta"]],
  ["カエラ・コヴァルスキア", "Kaela Kovalskia", ["カエラ", "カエラちゃん"], ["Kaela"]],
  ["こぼ・かなえる", "Kobo Kanaeru", ["こぼ", "こぼちゃん"], ["Kobo"]],
  ["森カリオペ", "Mori Calliope", ["カリオペ", "カリちゃん"], ["Calli"]],
  ["小鳥遊キアラ", "Takanashi Kiara", ["キアラ", "キアラちゃん"], ["Kiara"]],
  ["一伊那尓栖", "Ninomae Ina'nis", ["イナ", "イナちゃん"], ["Ina"]],
  ["がうる・ぐら", "Gawr Gura", ["ぐら", "ぐらちゃん"], ["Gura"]],
  ["ワトソン・アメリア", "Watson Amelia", ["アメ", "アメちゃん"], ["Ame"]],
  ["IRyS", "IRyS", ["アイリス"], ["Irys"]],
  ["九十九佐命", "Tsukumo Sana", ["サナ", "サナちゃん"], ["Sana"]],
  ["セレス・ファウナ", "Ceres Fauna", ["ファウナ", "ファウナちゃん"], ["Fauna", "Faunya"]],
  ["オーロ・クロニー", "Ouro Kronii", ["クロニー", "クロニーちゃん"], ["Kronii"]],
  ["七詩ムメイ", "Nanashi Mumei", ["ムメイ", "ムメイちゃん"], ["Mumei", "Moom"]],
  ["ハコス・ベールズ", "Hakos Baelz", ["ベーちゃん", "ハコスちゃん"], ["Bae"]],
  ["シオリ・ノヴェラ", "Shiori Novella", ["シオリ", "シオリちゃん"], ["Shiori"]],
  ["古石ビジュー", "Koseki Bijou", ["ビジュー", "ビブー", "ビジュー先輩"], ["Bijou", "Biboo", "Beebs"]],
  ["ネリッサ・レイヴンクロフト", "Nerissa Ravencroft", ["ネリッサ", "ネリッサちゃん"], ["Nerissa", "Rissa"]],
  ["フワワ・アビスガード", "Fuwawa Abyssgard", ["フワワ", "フワワちゃん"], ["Fuwawa", "Fuwa"]],
  ["モココ・アビスガード", "Mococo Abyssgard", ["モココ", "モコちゃん"], ["Mococo", "Moco"]],
  ["エリザベス・ローズ・ブラッドフレイム", "Elizabeth Rose Bloodflame", ["エリザベス", "リズ"], ["Elizabeth", "Liz"]],
  ["ジジ・ムリン", "Gigi Murin", ["ジジ", "ジジちゃん"], ["Gigi"]],
  ["セシリア・イマーグリーン", "Cecilia Immergreen", ["セシリア", "セシリアちゃん"], ["Cecilia"]],
  ["ラオーラ・パンテーラ", "Raora Panthera", ["ラオーラ", "ラオーラちゃん"], ["Raora"]]
];

const JAPANESE_TERMS = [
  "あえんびえん", "ギョリノフ", "ホロライブ", "ホロメン", "ホロリス", "箱推し",
  "ホロックス", "リグロス", "フロウグロウ", "フワモコ", "ホロぐら", "ホロジュール",
  "ホロアース", "ホロカ", "ホロドリ", "みこめっと", "おかころ", "ぺこみこ", "スバおか",
  "やごー", "谷郷"
];

const LATIN_TERMS = [
  "aenbien", "hololive", "holomem", "holoEN", "holoID", "holoX",
  "ReGLOSS", "FLOW GLOW", "FUWAMOCO", "YAGOO", "HoloGTA", "HoloEarth"
];

const EXACT_GLOSSARY = [
  { terms: ["あえんびえん", "aenbien"], ja: "あえんびえん", en: "aenbien (pandemonium)", id: "aenbien (kekacauan)" },
  ...MEMBERS.map(([ja, en, jaAliases, latinAliases]) => ({ terms: [ja, en, ...jaAliases, ...latinAliases], ja, en, id: en }))
];

function phraseEntries(phrases, boost) {
  return phrases.map((phrase) => ({ phrase, boost }));
}

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
  const isJapanese = modelLanguage === "ja";
  const officialNames = MEMBERS.map(([ja, en]) => isJapanese ? ja : en);
  const callNames = MEMBERS.flatMap(([, , jaAliases, latinAliases]) => isJapanese ? jaAliases : latinAliases);
  const terms = isJapanese ? JAPANESE_TERMS : LATIN_TERMS;
  // Chromeのboostは対数的に効くため、固有語でも1以下の弱いヒントに留める。
  return uniquePhrases([
    ...phraseEntries(officialNames, 0.9),
    ...phraseEntries(callNames, 0.8),
    ...phraseEntries(terms, 1)
  ]);
}

export function isKnownHololiveMember(value) {
  const normalized = String(value).toLocaleLowerCase("en-US");
  return MEMBERS.some(([ja, en, jaAliases, latinAliases]) => [ja, en, ...jaAliases, ...latinAliases]
    .some((name) => normalized.includes(name.toLocaleLowerCase("en-US"))));
}

export function getExactHololiveTranslation(text, targetLanguage) {
  const normalized = String(text).trim().replace(/[。．.!！?？]+$/u, "").trim().toLocaleLowerCase("en-US");
  if (!normalized) return null;
  const entry = EXACT_GLOSSARY.find(({ terms }) => terms.some((term) => term.toLocaleLowerCase("en-US") === normalized));
  if (!entry) return null;
  const target = String(targetLanguage).split("-")[0].toLowerCase();
  return entry[target] || entry.en;
}
