package jargame.media;

import java.util.Vector;
import javax.microedition.media.Control;
import javax.microedition.media.MediaException;
import javax.microedition.media.Player;
import javax.microedition.media.PlayerListener;
import javax.microedition.media.TimeBase;
import javax.microedition.media.control.MIDIControl;
import javax.microedition.media.control.ToneControl;
import javax.microedition.media.control.VolumeControl;

/** Player with a correct MMAPI state machine; audio output is delegated to the host (silent for now). */
public final class BasicPlayer implements Player, VolumeControl, ToneControl, MIDIControl {
    private final int[] channelVolumes = new int[16];

    private final byte[] data;
    private final String type;
    private int state = UNREALIZED;
    private int loopCount = 1;
    private int level = 100;
    private boolean muted;
    private final Vector listeners = new Vector();

    public BasicPlayer(byte[] data, String type) {
        this.data = data;
        this.type = type;
    }

    private void checkClosed() {
        if (state == CLOSED) {
            throw new IllegalStateException("closed");
        }
    }

    private void fire(String event, Object data) {
        for (int i = 0; i < listeners.size(); i++) {
            ((PlayerListener) listeners.elementAt(i)).playerUpdate(this, event, data);
        }
    }

    public void realize() throws MediaException {
        checkClosed();
        if (state < REALIZED) {
            state = REALIZED;
        }
    }

    public void prefetch() throws MediaException {
        realize();
        if (state < PREFETCHED) {
            state = PREFETCHED;
        }
    }

    public void start() throws MediaException {
        prefetch();
        if (state != STARTED) {
            state = STARTED;
            fire(PlayerListener.STARTED, new Long(0));
        }
    }

    public void stop() throws MediaException {
        checkClosed();
        if (state == STARTED) {
            state = PREFETCHED;
            fire(PlayerListener.STOPPED, new Long(0));
        }
    }

    public void deallocate() {
        checkClosed();
        if (state >= PREFETCHED) {
            state = REALIZED;
        }
    }

    public void close() {
        if (state != CLOSED) {
            state = CLOSED;
            fire(PlayerListener.CLOSED, null);
        }
    }

    public long setMediaTime(long now) throws MediaException {
        checkClosed();
        return 0;
    }

    public long getMediaTime() {
        return 0;
    }

    public int getState() {
        return state;
    }

    public long getDuration() {
        return TIME_UNKNOWN;
    }

    public String getContentType() {
        return type;
    }

    public void setLoopCount(int count) {
        if (count == 0) {
            throw new IllegalArgumentException();
        }
        loopCount = count;
    }

    public void addPlayerListener(PlayerListener playerListener) {
        if (playerListener != null) {
            listeners.addElement(playerListener);
        }
    }

    public void removePlayerListener(PlayerListener playerListener) {
        listeners.removeElement(playerListener);
    }

    public void setTimeBase(TimeBase master) throws MediaException {
    }

    public TimeBase getTimeBase() {
        return null;
    }

    public Control[] getControls() {
        return new Control[] {this};
    }

    public Control getControl(String controlType) {
        if (controlType.endsWith("VolumeControl") || controlType.endsWith("ToneControl")
                || controlType.endsWith("MIDIControl")) {
            return this;
        }
        return null;
    }

    public boolean isBankQuerySupported() {
        return false;
    }

    public int[] getProgram(int channel) throws MediaException {
        throw new MediaException("not supported");
    }

    public int getChannelVolume(int channel) {
        return channel >= 0 && channel < 16 ? channelVolumes[channel] : -1;
    }

    public void setProgram(int channel, int bank, int program) {
    }

    public void setChannelVolume(int channel, int volume) {
        if (channel < 0 || channel > 15 || volume < 0 || volume > 127) {
            throw new IllegalArgumentException();
        }
        channelVolumes[channel] = volume;
    }

    public int[] getBankList(boolean custom) throws MediaException {
        throw new MediaException("not supported");
    }

    public int[] getProgramList(int bank) throws MediaException {
        throw new MediaException("not supported");
    }

    public String getProgramName(int bank, int prog) throws MediaException {
        throw new MediaException("not supported");
    }

    public String getKeyName(int bank, int prog, int key) throws MediaException {
        throw new MediaException("not supported");
    }

    public void shortMidiEvent(int type, int data1, int data2) {
    }

    public int longMidiEvent(byte[] data, int offset, int length) {
        return length;
    }

    public void setMute(boolean mute) {
        muted = mute;
    }

    public boolean isMuted() {
        return muted;
    }

    public int setLevel(int level) {
        this.level = level < 0 ? 0 : level > 100 ? 100 : level;
        return this.level;
    }

    public int getLevel() {
        return level;
    }

    public void setSequence(byte[] sequence) {
    }
}
