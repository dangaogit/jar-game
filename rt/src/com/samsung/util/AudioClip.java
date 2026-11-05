package com.samsung.util;

import java.io.IOException;

/** Samsung audio API; silent for now. */
public class AudioClip {
    public static final int TYPE_MMF = 1;
    public static final int TYPE_MP3 = 2;
    public static final int TYPE_MIDI = 3;

    public AudioClip(int type, String filename) throws IOException {
    }

    public AudioClip(int type, byte[] audioData, int audioOffset, int audioLength) {
    }

    public static boolean isSupported() {
        return true;
    }

    public void play(int loop, int volume) {
    }

    public void pause() {
    }

    public void resume() {
    }

    public void stop() {
    }
}
