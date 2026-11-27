import Gst from 'gi://Gst';
import GLib from 'gi://GLib';

export class MusicPlayer {
    constructor(settings) {
        this._settings = settings;
        this._playbin = null;
        this._busWatchId = 0;
        this._playing = false;
        try {
            Gst.init(null);
            this._playbin = Gst.ElementFactory.make('playbin', 'winter-is-coming-music');
            if (!this._playbin)
                throw new Error('GStreamer playbin is unavailable');
            this.setVolume(settings.get_double('music-volume'));
            this._busWatchId = this._playbin.get_bus().add_watch(
                GLib.PRIORITY_DEFAULT,
                (_bus, message) => {
                    switch (message.type) {
                    case Gst.MessageType.EOS:
                        this.stop();
                        break;
                    case Gst.MessageType.ERROR: {
                        const [error, debug] = message.parse_error();
                        console.error(`[WinterIsComing] Music playback error: ${error.message}`);
                        if (debug) console.debug(debug);
                        this.stop();
                        break;
                    }
                    default:
                        break;
                    }
                    return GLib.SOURCE_CONTINUE;
                }
            );
        } catch (error) {
            console.error(`[WinterIsComing] Music player unavailable: ${error.message}`);
            this._playbin = null;
        }
    }

    get available() {
        return this._playbin !== null;
    }

    get playing() {
        return this._playing;
    }

    play(uri = this._settings.get_string('music-track-uri')) {
        if (!this._playbin || !uri || !uri.startsWith('file://'))
            return false;
        this._playbin.set_state(Gst.State.NULL);
        this._playbin.set_property('uri', uri);
        this.setVolume(this._settings.get_double('music-volume'));
        const result = this._playbin.set_state(Gst.State.PLAYING);
        this._playing = result !== Gst.StateChangeReturn.FAILURE;
        return this._playing;
    }

    pause() {
        if (!this._playbin || !this._playing) return;
        this._playbin.set_state(Gst.State.PAUSED);
        this._playing = false;
    }

    resume() {
        if (!this._playbin || !this._playbin.get_property('uri')) return;
        this._playbin.set_state(Gst.State.PLAYING);
        this._playing = true;
    }

    toggle() {
        if (this._playing) this.pause();
        else if (this._playbin?.get_property('uri')) this.resume();
        else this.play();
    }

    stop() {
        if (!this._playbin) return;
        this._playbin.set_state(Gst.State.NULL);
        this._playing = false;
    }

    setVolume(value) {
        if (!this._playbin) return;
        const volume = Math.max(0, Math.min(1, Number(value) || 0));
        this._playbin.set_property('volume', volume);
    }

    destroy() {
        this.stop();
        if (this._busWatchId) {
            GLib.source_remove(this._busWatchId);
            this._busWatchId = 0;
        }
        this._playbin = null;
        this._settings = null;
    }
}
