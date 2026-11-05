package com.nokia.mid.sound;

/** Nokia UI sound API; state machine only, audio output is silent for now. */
public class Sound {
    public static final int FORMAT_TONE = 1;
    public static final int FORMAT_WAV = 5;
    public static final int SOUND_PLAYING = 0;
    public static final int SOUND_STOPPED = 1;
    public static final int SOUND_UNINITIALIZED = 3;

    private int state = SOUND_UNINITIALIZED;
    private int gain = 255;
    private SoundListener listener;

    public Sound(byte[] data, int type) {
        init(data, type);
    }

    public Sound(int freq, long duration) {
        init(freq, duration);
    }

    public void init(byte[] data, int type) {
        if (data == null) {
            throw new NullPointerException();
        }
        setState(SOUND_STOPPED);
    }

    public void init(int freq, long duration) {
        setState(SOUND_STOPPED);
    }

    public static int getConcurrentSoundCount(int type) {
        return 1;
    }

    public static int[] getSupportedFormats() {
        return new int[] {FORMAT_TONE, FORMAT_WAV};
    }

    public int getGain() {
        return gain;
    }

    public void setGain(int gain) {
        this.gain = gain < 0 ? 0 : gain > 255 ? 255 : gain;
    }

    public int getState() {
        return state;
    }

    public void play(int loop) {
        if (state == SOUND_UNINITIALIZED) {
            throw new IllegalStateException();
        }
        setState(SOUND_PLAYING);
        // silent: report completion immediately for single plays
        if (loop == 1) {
            setState(SOUND_STOPPED);
        }
    }

    public void resume() {
        play(1);
    }

    public void stop() {
        if (state == SOUND_PLAYING) {
            setState(SOUND_STOPPED);
        }
    }

    public void release() {
        setState(SOUND_UNINITIALIZED);
    }

    public void setSoundListener(SoundListener listener) {
        this.listener = listener;
    }

    private void setState(int s) {
        if (state != s) {
            state = s;
            if (listener != null) {
                listener.soundStateChanged(this, s);
            }
        }
    }
}
