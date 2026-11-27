import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const AMOUNT_OPTIONS = ['light', 'medium', 'heavy'];
const AMOUNT_LABELS = ['Light (80 flakes)', 'Medium (160 flakes)', 'Heavy (320 flakes)'];

export default class WinterIsComingPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings('org.gnome.shell.extensions.winter-is-coming');
        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'weather-snow-symbolic',
        });

        const snowGroup = new Adw.PreferencesGroup({
            title: 'Snowfall',
            description: 'Customize snowfall density and desktop interactions.',
        });
        const amountList = new Gtk.StringList();
        for (const label of AMOUNT_LABELS) amountList.append(label);
        const amountRow = new Adw.ComboRow({
            title: 'Snow amount',
            subtitle: 'Lower density uses less compositor CPU',
            model: amountList,
        });
        const curAmount = settings.get_string('snow-amount');
        const curIdx = AMOUNT_OPTIONS.indexOf(curAmount);
        amountRow.set_selected(curIdx >= 0 ? curIdx : 1);
        amountRow.connect('notify::selected', () => {
            const idx = amountRow.get_selected();
            if (idx >= 0 && idx < AMOUNT_OPTIONS.length)
                settings.set_string('snow-amount', AMOUNT_OPTIONS[idx]);
        });
        snowGroup.add(amountRow);

        const winSnowRow = new Adw.SwitchRow({
            title: 'Settle snow on windows',
            subtitle: 'Piles accumulate on window titlebars and fly off when moved',
        });
        settings.bind('snow-on-windows', winSnowRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        snowGroup.add(winSnowRow);

        const lightsRow = new Adw.SwitchRow({
            title: 'Fairy lights',
            subtitle: 'Hang twinkling colored lights along the top edge of open windows',
        });
        settings.bind('fairy-lights', lightsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        snowGroup.add(lightsRow);
        page.add(snowGroup);

        const musicGroup = new Adw.PreferencesGroup({
            title: 'Mr. Snowman music',
            description: 'Choose an audio file on this device. Nothing is downloaded and no network connection is used.',
        });

        const trackRow = new Adw.ActionRow({
            title: 'Local song',
            subtitle: this._trackDescription(settings.get_string('music-track-uri')),
        });
        const chooseButton = new Gtk.Button({
            label: 'Choose…',
            valign: Gtk.Align.CENTER,
        });
        chooseButton.connect('clicked', () => {
            const chooser = new Gtk.FileChooserNative({
                title: 'Choose a song',
                transient_for: window,
                action: Gtk.FileChooserAction.OPEN,
                accept_label: 'Select',
                cancel_label: 'Cancel',
            });
            const filter = new Gtk.FileFilter();
            filter.set_name('Audio files');
            for (const mime of ['audio/mpeg', 'audio/ogg', 'audio/flac', 'audio/wav', 'audio/x-wav', 'audio/mp4'])
                filter.add_mime_type(mime);
            chooser.add_filter(filter);
            chooser.connect('response', (_dialog, response) => {
                if (response === Gtk.ResponseType.ACCEPT) {
                    const file = chooser.get_file();
                    if (file) {
                        settings.set_string('music-track-uri', file.get_uri());
                        trackRow.subtitle = this._trackDescription(file.get_uri());
                    }
                }
                chooser.destroy();
            });
            chooser.show();
        });
        trackRow.add_suffix(chooseButton);

        const clearButton = new Gtk.Button({
            label: 'Clear',
            valign: Gtk.Align.CENTER,
        });
        clearButton.connect('clicked', () => {
            settings.set_string('music-track-uri', '');
            trackRow.subtitle = 'No song selected';
        });
        trackRow.add_suffix(clearButton);
        musicGroup.add(trackRow);

        const autoplayRow = new Adw.SwitchRow({
            title: 'Autoplay',
            subtitle: 'Play the selected song when WinterIsComing starts',
        });
        settings.bind('music-autoplay', autoplayRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        musicGroup.add(autoplayRow);

        const volumeRow = new Adw.ActionRow({
            title: 'Volume',
            subtitle: 'Adjust local music playback volume',
        });
        const volumeScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 1,
                step_increment: 0.05,
                page_increment: 0.1,
                value: settings.get_double('music-volume'),
            }),
            digits: 2,
            draw_value: true,
            width_request: 190,
            valign: Gtk.Align.CENTER,
        });
        volumeScale.connect('value-changed', () => {
            settings.set_double('music-volume', volumeScale.get_value());
        });
        settings.connect('changed::music-volume', () => {
            const value = settings.get_double('music-volume');
            if (Math.abs(volumeScale.get_value() - value) > 0.001)
                volumeScale.set_value(value);
        });
        volumeRow.add_suffix(volumeScale);
        musicGroup.add(volumeRow);
        page.add(musicGroup);

        const helpGroup = new Adw.PreferencesGroup({ title: 'Tips & Guide' });
        const guideRow = new Adw.ActionRow({
            title: 'Show welcome guide on next start',
            subtitle: 'Re-enables the how-to-play popup when the extension starts',
        });
        const resetBtn = new Gtk.Button({
            label: 'Reset',
            valign: Gtk.Align.CENTER,
        });
        resetBtn.connect('clicked', () => {
            settings.set_boolean('seen-guide', false);
            resetBtn.set_sensitive(false);
            resetBtn.set_label('Reset ✓');
        });
        guideRow.add_suffix(resetBtn);
        helpGroup.add(guideRow);
        page.add(helpGroup);
        window.add(page);
    }

    _trackDescription(uri) {
        if (!uri) return 'No song selected';
        try {
            const file = Gio.File.new_for_uri(uri);
            return file.get_basename() || 'Selected local audio file';
        } catch (_error) {
            return 'Selected local audio file';
        }
    }
}
