// 呼び方・呼ばれ方はホロライブ非公式wikiの呼称一覧を基に、音声認識を
// 一般語へ過度に引っ張らないよう頻出かつ固有性の高い表記へ絞っている。
export const HOLOLIVE_DICTIONARY_SOURCE =
  "https://seesaawiki.jp/hololivetv/d/%A5%DB%A5%ED%A5%E9%A5%A4%A5%D6%A1%DA%B8%C6%BE%CE%B0%EC%CD%F7%A1%DB";

// [日本語の正式名, 英語の正式名, 日本語の呼称, Latin文字の呼称]
const MEMBERS = [
  ["ときのそら", "Tokino Sora", ["そらちゃん", "そら先輩"], ["Sora"]],
  ["ロボ子さん", "Robocosan", ["ロボちゃん", "ロボ子先輩"], ["Roboco"]],
  ["さくらみこ", "Sakura Miko", ["みこち", "みこちゃん", "みこ先輩"], ["Miko"]],
  [
    "星街すいせい",
    "Hoshimachi Suisei",
    ["すいちゃん", "すいせい先輩"],
    ["Suisei"],
  ],
  [
    "AZKi",
    "AZKi",
    ["あずきちゃん", "あずちゃん", "あずきち", "AZKi先輩", "あずき"],
    [],
  ],
  ["夜空メル", "Yozora Mel", ["メルちゃん", "メルメル", "メル先輩"], ["Mel"]],
  [
    "アキ・ローゼンタール",
    "Aki Rosenthal",
    ["アキロゼ", "アキちゃん", "アキロゼ先輩"],
    ["Aki", "Akirose"],
  ],
  [
    "赤井はあと",
    "Akai Haato",
    ["はあとちゃん", "はあちゃま", "はあと先輩"],
    ["Haato", "Haachama"],
  ],
  [
    "白上フブキ",
    "Shirakami Fubuki",
    ["白上", "フブさん", "フブキ", "フブちゃん", "フブキちゃん", "フブキ先輩"],
    ["Fubuki"],
  ],
  [
    "夏色まつり",
    "Natsuiro Matsuri",
    ["まつりちゃん", "まつり先輩"],
    ["Matsuri"],
  ],
  [
    "湊あくあ",
    "Minato Aqua",
    ["あくあちゃん", "あくたん", "あくあ先輩"],
    ["Aqua"],
  ],
  [
    "紫咲シオン",
    "Murasaki Shion",
    ["シオンちゃん", "シオン先輩", "シオンたん"],
    ["Shion"],
  ],
  [
    "百鬼あやめ",
    "Nakiri Ayame",
    ["あやめちゃん", "あやめ先輩", "お嬢"],
    ["Ayame"],
  ],
  ["癒月ちょこ", "Yuzuki Choco", ["ちょこ先生", "ちょこ先輩"], ["Choco"]],
  [
    "大空スバル",
    "Oozora Subaru",
    ["スバルちゃん", "スバル先輩", "しゅば"],
    ["Subaru"],
  ],
  ["大神ミオ", "Ookami Mio", ["ミオちゃん", "ミオしゃ", "ミオ先輩"], ["Mio"]],
  ["猫又おかゆ", "Nekomata Okayu", ["おかゆん", "おかゆ先輩"], ["Okayu"]],
  [
    "戌神ころね",
    "Inugami Korone",
    ["ころさん", "ころね", "ころねちゃん", "ころね先輩"],
    ["Korone"],
  ],
  [
    "兎田ぺこら",
    "Usada Pekora",
    ["ぺこら", "ぺこちゃん", "ぺこらちゃん", "ぺこーら", "ぺこら先輩"],
    ["Pekora"],
  ],
  ["潤羽るしあ", "Uruha Rushia", ["るしあちゃん", "るしあ先輩"], ["Rushia"]],
  [
    "不知火フレア",
    "Shiranui Flare",
    ["ふーたん", "フレアちゃん", "フレア先輩"],
    ["Flare"],
  ],
  [
    "白銀ノエル",
    "Shirogane Noel",
    ["団長", "ノエちゃん", "ノエルちゃん", "ノエル先輩"],
    ["Noel"],
  ],
  [
    "宝鐘マリン",
    "Houshou Marine",
    ["マリン", "船長", "マリン船長", "マリンちゃん", "マリン先輩"],
    ["Marine"],
  ],
  [
    "天音かなた",
    "Amane Kanata",
    ["かなたん", "かなたちゃん", "かなた先輩"],
    ["Kanata"],
  ],
  ["桐生ココ", "Kiryu Coco", ["会長", "ココ会長", "ココ先輩"], ["Coco"]],
  [
    "角巻わため",
    "Tsunomaki Watame",
    ["わためぇ", "わためちゃん", "わため先輩"],
    ["Watame"],
  ],
  [
    "常闇トワ",
    "Tokoyami Towa",
    ["トワ様", "トワちゃん", "トワぴ", "トワ先輩"],
    ["Towa"],
  ],
  [
    "姫森ルーナ",
    "Himemori Luna",
    ["んなたん", "ルーナたん", "ルーナ姫", "ルーナ先輩"],
    ["Luna"],
  ],
  [
    "雪花ラミィ",
    "Yukihana Lamy",
    ["ラミィ", "ラミィちゃん", "ラミたん", "ラミィ先輩"],
    ["Lamy"],
  ],
  [
    "桃鈴ねね",
    "Momosuzu Nene",
    ["ねね", "ねねち", "ねねちゃん", "ねね先輩"],
    ["Nene"],
  ],
  [
    "獅白ぼたん",
    "Shishiro Botan",
    ["ぼたん", "ししろん", "ぼたんちゃん", "ぼたん先輩"],
    ["Botan"],
  ],
  ["魔乃アロエ", "Mano Aloe", ["アロエちゃん"], ["Aloe"]],
  [
    "尾丸ポルカ",
    "Omaru Polka",
    ["ポルポル", "ポルカちゃん", "ポルカ先輩"],
    ["Polka"],
  ],
  [
    "ラプラス・ダークネス",
    "La+ Darknesss",
    [
      "ラプラス",
      "ラプちゃん",
      "ラプラスちゃん",
      "ラプラス先輩",
      "総帥",
      "山田",
    ],
    ["Laplus", "La+"],
  ],
  [
    "鷹嶺ルイ",
    "Takane Lui",
    ["ルイ", "ルイ姉", "ルイルイ", "ルイちゃん", "ルイ先輩"],
    ["Lui"],
  ],
  [
    "博衣こより",
    "Hakui Koyori",
    ["こより", "こよちゃん", "こよりちゃん", "こより先輩", "こんこよ"],
    ["Koyori"],
  ],
  [
    "沙花叉クロヱ",
    "Sakamata Chloe",
    ["沙花叉", "クロヱ", "クロヱちゃん"],
    ["Chloe"],
  ],
  [
    "風真いろは",
    "Kazama Iroha",
    ["いろはちゃん", "いろは先輩", "ござる"],
    ["Iroha"],
  ],
  ["火威青", "Hiodoshi Ao", ["青くん", "青くゆ", "青ちゃん"], ["Ao"]],
  [
    "音乃瀬奏",
    "Otonose Kanade",
    ["奏ちゃん", "かなでぃ", "きゃなでぃ"],
    ["Kanade"],
  ],
  [
    "一条莉々華",
    "Ichijou Ririka",
    ["莉々華ちゃん", "りりか", "りりーか"],
    ["Ririka"],
  ],
  ["儒烏風亭らでん", "Juufuutei Raden", ["らでん", "らでんちゃん"], ["Raden"]],
  [
    "轟はじめ",
    "Todoroki Hajime",
    ["はじめちゃん", "番長", "ばんちょー"],
    ["Hajime"],
  ],
  ["響咲リオナ", "Isaki Riona", ["リオナ", "リオナちゃん"], ["Riona"]],
  ["虎金妃笑虎", "Koganei Niko", ["笑虎", "笑虎ちゃん", "ニコたん"], ["Niko"]],
  ["水宮枢", "Mizumiya Su", ["枢ちゃん", "すうちゃん"], []],
  [
    "輪堂千速",
    "Rindo Chihaya",
    ["千速", "千速ちゃん", "ちは", "ちはちゃん"],
    ["Chihaya"],
  ],
  [
    "綺々羅々ヴィヴィ",
    "Kikirara Vivi",
    ["ヴィヴィ", "ヴィヴィちゃん", "ヴィヴィたん"],
    ["Vivi"],
  ],

  ["百灯キョーコ", "Hyakuto Kyoko", [], []],
  ["熱千めら", "Achichi Mela", [], []],
  ["鈴鳴つづり", "Suzuna Tsuzuri", [], []],
  ["宙科そぴあ", "Sorashina Sopia", [], []],

  ["井月みちる", "Izuki Michiru", ["みちるちゃん"], ["Michiru"]],
  ["花園さやか", "Hanazono Sayaka", ["さやかちゃん"], ["Sayaka"]],
  ["風白ゆき", "Kazeshiro Yuki", ["ゆきちゃん"], ["Yuki"]],
  ["アユンダ・リス", "Ayunda Risu", ["リス", "リスちゃん"], ["Risu"]],
  [
    "ムーナ・ホシノヴァ",
    "Moona Hoshinova",
    ["ムーナ", "ムーナちゃん"],
    ["Moona"],
  ],
  [
    "アイラニ・イオフィフティーン",
    "Airani Iofifteen",
    ["イオフィ", "イオフィちゃん"],
    ["Iofi"],
  ],
  [
    "クレイジー・オリー",
    "Kureiji Ollie",
    ["オリー", "オリーちゃん"],
    ["Ollie"],
  ],
  [
    "アーニャ・メルフィッサ",
    "Anya Melfissa",
    ["アーニャ", "アーニャ先輩"],
    ["Anya"],
  ],
  [
    "パヴォリア・レイネ",
    "Pavolia Reine",
    ["レイネ", "レイネちゃん"],
    ["Reine"],
  ],
  ["ベスティア・ゼータ", "Vestia Zeta", ["ゼータ", "ゼータちゃん"], ["Zeta"]],
  [
    "カエラ・コヴァルスキア",
    "Kaela Kovalskia",
    ["カエラ", "カエラ神", "カエラちゃん"],
    ["Kaela"],
  ],
  ["こぼ・かなえる", "Kobo Kanaeru", ["こぼ", "こぼちゃん"], ["Kobo"]],
  ["森カリオペ", "Mori Calliope", ["カリオペ", "カリちゃん"], ["Calli"]],
  ["小鳥遊キアラ", "Takanashi Kiara", ["キアラ", "キアラちゃん"], ["Kiara"]],
  ["一伊那尓栖", "Ninomae Ina'nis", ["イナ", "イナちゃん"], ["Ina"]],
  ["がうる・ぐら", "Gawr Gura", ["ぐら", "ぐらちゃん"], ["Gura"]],
  ["ワトソン・アメリア", "Watson Amelia", ["アメ", "アメちゃん"], ["Ame"]],
  ["IRyS", "IRyS", ["アイリス"], ["Irys"]],
  ["九十九佐命", "Tsukumo Sana", ["サナ", "サナちゃん"], ["Sana"]],
  [
    "セレス・ファウナ",
    "Ceres Fauna",
    ["ファウナ", "ファウナちゃん"],
    ["Fauna", "Faunya"],
  ],
  [
    "オーロ・クロニー",
    "Ouro Kronii",
    ["クロニー", "クロニーちゃん"],
    ["Kronii"],
  ],
  [
    "七詩ムメイ",
    "Nanashi Mumei",
    ["ムメイ", "ムメイちゃん"],
    ["Mumei", "Moom"],
  ],
  ["ハコス・ベールズ", "Hakos Baelz", ["ベーちゃん", "ハコスちゃん"], ["Bae"]],
  [
    "シオリ・ノヴェラ",
    "Shiori Novella",
    ["シオリ", "シオリちゃん"],
    ["Shiori"],
  ],
  [
    "古石ビジュー",
    "Koseki Bijou",
    ["ビジュー", "ビブー", "ビジュー先輩"],
    ["Bijou", "Biboo", "Beebs"],
  ],
  [
    "ネリッサ・レイヴンクロフト",
    "Nerissa Ravencroft",
    ["ネリッサ", "ネリッサちゃん"],
    ["Nerissa", "Rissa"],
  ],
  [
    "フワワ・アビスガード",
    "Fuwawa Abyssgard",
    ["フワワ", "フワワちゃん"],
    ["Fuwawa", "Fuwa"],
  ],
  [
    "モココ・アビスガード",
    "Mococo Abyssgard",
    ["モココ", "モコちゃん"],
    ["Mococo", "Moco"],
  ],
  [
    "エリザベス・ローズ・ブラッドフレイム",
    "Elizabeth Rose Bloodflame",
    ["エリザベス", "リズ"],
    ["Elizabeth", "Liz"],
  ],
  ["ジジ・ムリン", "Gigi Murin", ["ジジ", "ジジちゃん"], ["Gigi"]],
  [
    "セシリア・イマーグリーン",
    "Cecilia Immergreen",
    ["セシリア", "セシリアちゃん"],
    ["Cecilia"],
  ],
  [
    "ラオーラ・パンテーラ",
    "Raora Panthera",
    ["ラオーラ", "ラオーラちゃん"],
    ["Raora"],
  ],
];

const JAPANESE_TERMS = [
  // ホロライブ甲子園／パワプロ配信で使われる野球・育成用語
  "他校調査",
  "一塁",
  "トリラン",
  "あえんびえん",
  "ギョリノフ",
  "ホロライブ",
  "ホロメン",
  "ホロリス",
  "箱推し",
  "ホロックス",
  "リグロス",
  "フロウグロウ",
  "フログロ",
  "フワモコ",
  "ホロぐら",
  "ホロジュール",
  "ホロアース",
  "ホロカ",
  "ホロドリ",
  "みこめっと",
  "おかころ",
  "ぺこみこ",
  "スバおか",
  "やごー",
  "谷郷",
  "だぶちーず",
  "だぶち",
  "ぷにち",
  "いぬち",
];

// 漢字・英字表記だけでは読みが伝わりにくい名前は、読み仮名も認識候補にする。
// これは音声認識用ヒントであり、翻訳辞書の別名には含めない。
const JAPANESE_NAME_READINGS = {
  ロボ子さん: ["ろぼこさん"],
  さくらみこ: ["さくらみこ"],
  星街すいせい: ["ほしまちすいせい"],
  AZKi: ["あずき"],
  "アキ・ローゼンタール": ["あきろーぜんたーる"],
  赤井はあと: ["あかいはあと"],
  白上フブキ: ["しらかみふぶき", "しらかみ", "白上ふぶき", "シラカミフブキ"],
  湊あくあ: ["みなとあくあ"],
  紫咲シオン: ["むらさきしおん"],
  百鬼あやめ: ["なきりあやめ"],
  癒月ちょこ: ["ゆづきちょこ"],
  大空スバル: ["おおぞらすばる"],
  大神ミオ: ["おおかみみお"],
  猫又おかゆ: ["ねこまたおかゆ"],
  戌神ころね: ["いぬがみころね"],
  兎田ぺこら: ["うさだぺこら"],
  不知火フレア: ["しらぬいふれあ"],
  白銀ノエル: ["しろがねのえる"],
  宝鐘マリン: ["ほうしょうまりん"],
  天音かなた: ["あまねかなた"],
  桐生ココ: ["きりゅうここ"],
  角巻わため: ["つのまきわため"],
  常闇トワ: ["とこやみとわ"],
  姫森ルーナ: ["ひめもりるーな"],
  雪花ラミィ: ["ゆきはならみぃ"],
  桃鈴ねね: ["ももすずねね"],
  獅白ぼたん: ["ししろぼたん"],
  尾丸ポルカ: ["おまるぽるか"],
  "ラプラス・ダークネス": ["らぷらすだーくねす"],
  鷹嶺ルイ: ["たかねるい"],
  博衣こより: ["はくいこより"],
  沙花叉クロヱ: ["さかまたくろえ"],
  風真いろは: ["かざまいろは"],
  火威青: ["ひおどしあお"],
  音乃瀬奏: ["おとのせかなで"],
  一条莉々華: ["いちじょうりりか"],
  儒烏風亭らでん: ["じゅうふうていらでん"],
  轟はじめ: ["とどろきはじめ"],
  響咲リオナ: ["いさきりおな"],
  虎金妃笑虎: ["こがねいにこ"],
  水宮枢: ["みずみやすう"],
  輪堂千速: ["りんどうちはや"],
  綺々羅々ヴィヴィ: ["ききららゔぃゔぃ"],
  古石ビジュー: ["こせきびじゅー", "コセキ・ビジュー"],
  一伊那尓栖: ["にのまえいなにす"],
  九十九佐命: ["つくもさな"],
  七詩ムメイ: ["ななしむめい"],
};

// 呼称一覧の「相手＝本人」行（呼び方／一人称）から、発話される特徴的な形を採用。
// 「私」「俺」など一般的な一人称や、文章表記のみ・限定的な用法は強調しない。
// ほかのチャンネルでは一般語になり得るため、本人の配信だけに渡す。
const CHANNEL_SELF_REFERENCES = {
  ときのそら: ["そらち"],
  さくらみこ: ["みこ"],
  星街すいせい: ["すいせい", "すいちゃん"],
  AZKi: ["あずき"],
  夜空メル: ["メル"],
  "アキ・ローゼンタール": ["ムキロゼ", "アキロゼ"],
  赤井はあと: ["はあちゃま"],
  白上フブキ: ["白上"],
  夏色まつり: ["まつり"],
  湊あくあ: ["あてぃし"],
  紫咲シオン: ["シオン"],
  百鬼あやめ: ["余"],
  癒月ちょこ: ["ちょこ", "癒月"],
  大空スバル: ["スバル"],
  大神ミオ: ["うち", "ウチ"],
  戌神ころね: ["ころね", "こぉね"],
  兎田ぺこら: ["ぺこーら"],
  不知火フレア: ["フレア"],
  白銀ノエル: ["団長", "だんちょ", "うち"],
  宝鐘マリン: ["船長", "マリン"],
  天音かなた: ["かなたそ", "かなた"],
  角巻わため: ["わため", "わためぇ"],
  常闇トワ: ["トワ", "トワ様"],
  姫森ルーナ: ["ルーナ", "んなたん"],
  雪花ラミィ: ["ラミィ"],
  桃鈴ねね: ["ねね"],
  獅白ぼたん: ["ししろん"],
  尾丸ポルカ: ["ポルカ"],
  "ラプラス・ダークネス": ["吾輩"],
  鷹嶺ルイ: ["わし"],
  博衣こより: ["こよ", "こんこよ"],
  沙花叉クロヱ: ["沙花叉"],
  風真いろは: ["かざま", "ござる"],
  "アイラニ・イオフィフティーン": ["よっぴー"],
  "こぼ・かなえる": ["こぼ"],
  森カリオペ: ["森"],
  小鳥遊キアラ: ["ウチ"],
  古石ビジュー: ["ビジュー", "biboo"],
  音乃瀬奏: ["奏"],
  一条莉々華: ["莉々華"],
  儒烏風亭らでん: ["らでん", "JFT"],
  轟はじめ: ["うち", "はじめ"],
  響咲リオナ: ["あたい", "リオナ"],
  虎金妃笑虎: ["ニコたん", "笑虎"],
  水宮枢: ["枢", "すうちゃん", "水宮"],
  輪堂千速: ["千速", "ちは"],
  綺々羅々ヴィヴィ: ["うち", "ヴィヴィ", "ヴィヴィたん"],
};

const LATIN_SELF_REFERENCES = {
  "アイラニ・イオフィフティーン": ["Yopi"],
  小鳥遊キアラ: ["Kiwawa"],
  七詩ムメイ: ["Mumei"],
};

export function findHololiveChannelMember(channelIdentity = "") {
  const channel = String(channelIdentity).toLocaleLowerCase("en-US");
  const matches = MEMBERS.filter(
    ([ja, en]) =>
      channel.includes(ja.toLocaleLowerCase("en-US")) ||
      channel.includes(en.toLocaleLowerCase("en-US")),
  );
  return matches.length === 1 ? matches[0][0] : null;
}

const LATIN_TERMS = [
  "scouting other schools",
  "first base",
  "Toriran",
  "aenbien",
  "hololive",
  "holomem",
  "Holodori",
  "HoloDori",
  "holodori app",
  "holoEN",
  "holoID",
  "holoX",
  "ReGLOSS",
  "FLOW GLOW",
  "FUWAMOCO",
  "YAGOO",
  "HoloGTA",
  "HoloEarth",
  "YAGOO",
  "Dabuchīzu",
  "Dabuchi",
  "Punichi",
  "Inuchi",
];

const EXACT_GLOSSARY = [
  {
    terms: ["あえんびえん", "aenbien"],
    ja: "あえんびえん",
    en: "aenbien (pandemonium)",
    id: "aenbien (kekacauan)",
  },
  ...MEMBERS.map(([ja, en, jaAliases, latinAliases]) => ({
    terms: [ja, en, ...jaAliases, ...latinAliases],
    ja,
    en,
    id: en,
  })),
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

export function getHololiveSpeechPhrases(language, channelMember = null) {
  const modelLanguage = String(language).split("-")[0].toLowerCase();
  const isJapanese = modelLanguage === "ja";
  const boosts = isJapanese
    ? { officialNames: 4, callNames: 3, terms: 5 }
    : { officialNames: 2, callNames: 1, terms: 3 };
  const officialNames = MEMBERS.map(([ja, en]) => (isJapanese ? ja : en));
  const callNames = MEMBERS.flatMap(([, , jaAliases, latinAliases]) =>
    isJapanese ? jaAliases : latinAliases,
  );
  const nameReadings = isJapanese
    ? MEMBERS.flatMap(([ja]) => JAPANESE_NAME_READINGS[ja] || [])
    : [];
  const terms = isJapanese ? JAPANESE_TERMS : LATIN_TERMS;
  const member = MEMBERS.find(([ja]) => ja === channelMember);
  const channelPhrases = member
    ? isJapanese
      ? [
          member[0],
          ...member[2],
          ...(JAPANESE_NAME_READINGS[member[0]] || []),
          ...(CHANNEL_SELF_REFERENCES[member[0]] || []),
        ]
      : [member[1], ...member[3], ...(LATIN_SELF_REFERENCES[member[0]] || [])]
    : [];
  // Chromeのboostは「通常より何倍あり得るか」の自然対数に近い尺度。
  // 日本語は固有名の認識を優先し、英語・インドネシア語では一般語と衝突しやすい
  // Latin文字の候補を控えめにする。
  return uniquePhrases([
    ...phraseEntries(channelPhrases, isJapanese ? 6 : 4),
    ...phraseEntries(officialNames, boosts.officialNames).map((entry) =>
      isJapanese && entry.phrase === "白上フブキ"
        ? { ...entry, boost: 6 }
        : entry,
    ),
    ...phraseEntries(callNames, boosts.callNames),
    ...phraseEntries(nameReadings, boosts.callNames),
    ...phraseEntries(terms, boosts.terms),
  ]);
}

export function isKnownHololiveMember(value) {
  const normalized = String(value).toLocaleLowerCase("en-US");
  return MEMBERS.some(([ja, en, jaAliases, latinAliases]) =>
    [ja, en, ...jaAliases, ...latinAliases].some((name) =>
      normalized.includes(name.toLocaleLowerCase("en-US")),
    ),
  );
}

export function getExactHololiveTranslation(text, targetLanguage) {
  const normalized = String(text)
    .trim()
    .replace(/[。．.!！?？]+$/u, "")
    .trim()
    .toLocaleLowerCase("en-US");
  if (!normalized) return null;
  const entry = EXACT_GLOSSARY.find(({ terms }) =>
    terms.some((term) => term.toLocaleLowerCase("en-US") === normalized),
  );
  if (!entry) return null;
  const target = String(targetLanguage).split("-")[0].toLowerCase();
  return entry[target] || entry.en;
}
