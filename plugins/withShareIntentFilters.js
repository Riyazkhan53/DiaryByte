// Lists DiaryByte in Android's share sheet for text, links and images
// (received by modules/share-text). Keeps the main activity single-task,
// so a share always comes to the one running app window.
const { withAndroidManifest } = require('expo/config-plugins');

const FILTERS = [
  { action: 'android.intent.action.SEND', types: ['text/*', 'image/*'] },
  { action: 'android.intent.action.SEND_MULTIPLE', types: ['image/*'] },
];

module.exports = function withShareIntentFilters(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    const main = app?.activity?.find((a) => a.$['android:name'] === '.MainActivity');
    if (!main) return cfg;
    main.$['android:launchMode'] = 'singleTask';
    main['intent-filter'] = (main['intent-filter'] || []).filter(
      (f) => !(f.action || []).some((a) => FILTERS.some((x) => x.action === a.$['android:name']))
    );
    FILTERS.forEach(({ action, types }) => {
      main['intent-filter'].push({
        action: [{ $: { 'android:name': action } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: types.map((t) => ({ $: { 'android:mimeType': t } })),
      });
    });
    return cfg;
  });
};
