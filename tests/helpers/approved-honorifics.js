// Exact direct-address corrections already accepted in PR #8 before this revision.
export function withApprovedHonorifics(text) {
  return text
    .replace('【主人公】、行ってみましょう', '【主人公】様、行ってみましょう')
    .replace('【主人公】ご覧ください', '【主人公】様、ご覧ください')
    .replace('【主人公】。この状況で', '【主人公】様。この状況で')
    .replace('【主人公】、こちらをご覧ください', '【主人公】様、こちらをご覧ください')
    .replace('【主人公】。このような状況に', '【主人公】様。このような状況に')
    .replace('【主人公】、では配布所に', '【主人公】様、では配布所に');
}
