// Settings › Scan (#/settings/scan): how a Scan finds the arrows (the hand-written rules, or the
// neural network of arrowNet.js), and where the raw picture of each Scan is kept (scanPhoto.js):
// Google Photos (the default; uploaded by photosUploader.js), a download to the phone, or nowhere.
import { h } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { card } from './common.js';
import { scanPhotoMode } from '../scanPhoto.js';
import { ALBUM_TITLE } from '../../sync/photosUploader.js';
import { loadArrowNet } from '../arrowNet.js';

/** How a Scan finds the arrows: 'rules' (the default) or 'network'. */
export const scanMethod = (settings) => (settings?.scanMethod === 'network' ? 'network' : 'rules');

const caption = (text) => h('p', { class: 'apl-cap13' }, text);

/** The overview row's line: where the photos go now. */
export function scanPhotosSub(settings, photos) {
  const mode = scanPhotoMode(settings);
  if (mode === 'off') return 'Scan photos are not kept';
  if (mode === 'download') return 'Scan photos are downloaded to the phone';
  return photos?.allowed() ? 'Scan photos go to Google Photos' : 'Google Photos: not allowed yet';
}

const ERRORS = {
  auth: 'Waiting for the Google sign-in to be renewed.',
  offline: 'Offline: the photos are uploaded when back online.',
  scope: 'Google Photos access was not granted.',
};

export function renderScanSettings(ctx) {
  const settings = ctx.repo.getSettings();
  const photos = ctx.scanPhotos;
  const mode = scanPhotoMode(settings);
  const options = [
    ...(photos?.available ? [{ value: 'photos', label: 'Google Photos' }] : []),
    { value: 'download', label: 'Phone' },
    { value: 'off', label: 'Off' },
  ];

  const body = [
    APL.SegmentedControl({
      label: 'Keep scan photos',
      options,
      value: options.some((o) => o.value === mode) ? mode : 'download',
      onChange: (scanPhotos) => ctx.saveSettings({ scanPhotos }) && ctx.rerender(),
      fk: 'scan-photos',
    }),
  ];

  if (mode === 'photos' && photos?.available) body.push(...photosPart(ctx, photos));
  else if (mode === 'download')
    body.push(
      caption(
        'The picture each Scan reads the arrows from is downloaded as it was taken, without the marks, to the Download folder of this phone (the gallery shows it as an album). Each download leaves a browser notification.',
      ),
    );
  else body.push(caption('The pictures are only used to read the arrows and are then dropped.'));

  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      APL.ScreenHeader({ title: 'Scan', onBack: () => ctx.navigate('settings'), backLabel: 'Back to settings' }),
      h(
        'div',
        { class: 'apl-screen-body history-body' },
        card({ class: 'apl-card' }, APL.Section({ label: 'Arrows found by', id: 'set-scan-method', children: methodPart(ctx, settings) })),
        card({ class: 'apl-card' }, APL.Section({ label: 'Photos', id: 'set-scan', children: body })),
      ),
    ),
  };
}

/** How the arrows are found: the rules, or the neural network (fetched once, then kept offline). */
function methodPart(ctx, settings) {
  const method = scanMethod(settings);
  const parts = [
    APL.SegmentedControl({
      label: 'Arrows found by',
      options: [
        { value: 'rules', label: 'Rules' },
        { value: 'network', label: 'Neural network' },
      ],
      value: method,
      onChange: (scanMethod) => ctx.saveSettings({ scanMethod }) && ctx.rerender(),
      fk: 'scan-method',
    }),
  ];
  if (method === 'rules') {
    parts.push(caption('The arrows are found by hand-written rules: each shaft is followed to where it enters the paper.'));
    return parts;
  }
  parts.push(
    caption(
      'A neural network, trained on marked photos of 40 cm triple faces, finds where each shaft enters the paper. Where it is not sure, the rules decide. Used on sheets of several spots (one arrow per spot); a single face is always read by the rules. It is downloaded once (about 15 MB) and then works offline.',
    ),
  );
  // fetched now, so the first Scan at the range does not need a connection
  const status = h('p', { class: 'apl-cap13', role: 'status' }, 'Getting the neural network ready…');
  loadArrowNet().then(
    () => (status.textContent = 'The neural network is ready, also offline.'),
    () => {
      status.textContent = 'The neural network could not be downloaded. Connect to the internet and open this page again; until then the rules find the arrows.';
      status.classList.add('error');
    },
  );
  parts.push(status);
  return parts;
}

function photosPart(ctx, photos) {
  const parts = [
    caption(
      `The picture each Scan reads the arrows from is uploaded, as it was taken and without the marks, to the album “${ALBUM_TITLE}” in your Google Photos. The app may only add photos: it cannot see the rest of your library. Until a photo is uploaded it waits on this phone.`,
    ),
  ];
  // the line about the queue fills in once the count is read
  const status = h('p', { class: 'apl-cap13', role: 'status' }, '');
  const st = photos.status();
  photos.pending().then((n) => {
    const err = st.error ? ERRORS[st.error.kind] || st.error.message : null;
    status.textContent = st.busy
      ? `Uploading… ${n} waiting.`
      : n
        ? `${n} ${n === 1 ? 'photo waits' : 'photos wait'} to be uploaded.${err ? ` ${err}` : ''}`
        : 'All scan photos are uploaded.';
    status.classList.toggle('error', !!err && !st.busy);
    // the button only when there is something to upload (the APL button's display beats `hidden`)
    if (n && photos.allowed() && !st.busy)
      actions.replaceChildren(APL.Button({ children: 'Upload now', variant: 'secondary', onClick: () => photos.uploadNow(), fk: 'scan-upload' }));
  });
  const actions = h('div');

  if (!photos.allowed()) {
    parts.push(
      caption(
        ctx.sync?.signedIn()
          ? 'Allow the app to add photos to your Google Photos (Google asks once).'
          : 'Connect your Google account and allow the app to add photos to your Google Photos. This also turns on Sync with Google Drive (Settings › Sync & backup).',
      ),
      APL.Button({ children: 'Allow Google Photos', variant: 'secondary', onClick: () => photos.allow(), fk: 'scan-allow-photos' }),
    );
  }
  parts.push(status, actions);
  return parts;
}
