// Author-approved first edition, 2026-11-03. Historical content stays unchanged.
import { content as previous } from './ending.js';

export const content = structuredClone(previous);
content.contentVersion = 'baumgarten-map-return-2026-11-03';
content.mapReturnLines = {
  'char.harold': ['この旅、思っていたよりずっと勉強になりますね', '皆さんと一緒だと、知らない道も心強いです'],
  'char.frederica': ['次へ行く前に、持ち物を確かめておこう', '……さっきの人たち、少しは安心できたかな'],
  'char.lisette': ['……街によって、こんなに暮らしが違うんですね', '次の街でも、私にできることを探してみます'],
  'char.vantalt': ['地図で見るのと、実際に歩くのとでは違いますね', '今日の出来事は、忘れないうちに記録しておきましょう'],
  'char.sandro': ['やっと一息つけるな。……飯はまだか？', '次の街まで長いなら、先に休憩しとけよ'],
  'char.heidemarie': ['さっきの方、少し表情が明るくなりましたね', 'あら、道端に小さな花が。綺麗ですね'],
  'char.madian': ['次の街には何があるかな。ちょっと楽しみだ！', '少しくらい寄り道したっていいだろ？ 面白いものがあるかもよ'],
  'char.olivel': ['街が変わると、人の考え方も変わる。そういうのを知るのも、旅の面白さよね', 'せっかくの旅なんだから、景色も楽しみなさいよ'],
};
