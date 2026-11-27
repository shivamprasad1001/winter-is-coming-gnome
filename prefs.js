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
            if (idx >= 0 && idx < AMOUNT_OPTIONS.length) {
                settings.set_string('snow-amount', AMOUNT_OPTIONS[idx]);
            }
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

        const helpGroup = new Adw.PreferencesGroup({
            title: 'Tips & Guide',
        });

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
}
