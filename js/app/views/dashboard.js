// Dashboard: the start page and gate to the app's features (history, insights, equipment, sight
// marks, grading guide, settings). New session and running sessions sit at the bottom, above the
// tab bar (renderRunning in main.js), within thumb reach.
import { h } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { T } from '../strings.js';
import { icons } from '../icons.js';
import { SUPPORT_URL, PAYPAL_ME } from '../../config.js';
import { paypalMeUrl } from '../support.js';

export function renderDashboard(ctx) {
  const finished = ctx.finished.list();
  const row = (props) => APL.NavRow(props);

  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      APL.ScreenHeader({ title: T.appTitle }),
      h(
        'div',
        { class: 'apl-screen-body' },
        h(
          'nav',
          { class: 'apl-list', 'aria-label': 'Sections' },
          row({
            href: '#/history',
            icon: icons.history(),
            title: 'History',
            detail: `${finished.length} ${finished.length === 1 ? 'session' : 'sessions'}`,
            fk: 'hub-history',
          }),
          row({ href: '#/insights', icon: icons.insights(), title: 'Insights', detail: 'Trends, reviews, training load', fk: 'hub-insights' }),
          row({ href: '#/gear', icon: icons.gear(), title: 'Equipment', detail: 'Setups and their sight marks', fk: 'hub-gear' }),
          row({
            onClick: () => ctx.ui.set({ guide: true }),
            icon: icons.help(),
            title: 'Grades',
            detail: 'M / S grading guide',
            fk: 'hub-grades',
          }),
          row({
            href: '#/settings',
            icon: icons.settings(),
            title: 'Settings',
            detail: ctx.sync?.signedIn() ? 'Synced to Google Drive' : 'Backup and sync',
            fk: 'hub-settings',
          }),
        ),
        supportRow(),
      ),
    ),
  };
}

/**
 * A quiet offer under the sections, in a new tab: PayPal.Me when a name is set (the quickest way to
 * tip), else the tip page. Nothing when neither is set.
 */
export function supportRow(url = SUPPORT_URL, paypal = PAYPAL_ME) {
  if (!url && !paypal) return null;
  return h(
    'nav',
    { class: 'apl-list', 'aria-label': 'Support' },
    APL.NavRow({
      href: paypal ? paypalMeUrl(paypal) : url,
      newTab: true,
      icon: icons.coffee(),
      title: 'Buy me a coffee',
      detail: paypal ? 'The journal is free. Tip with PayPal' : 'The journal is free. Support it on Ko-fi',
      fk: 'hub-support',
    }),
  );
}
